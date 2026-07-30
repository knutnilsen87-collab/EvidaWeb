package no.saksrom.api.saksrom;

import com.fasterxml.jackson.databind.ObjectMapper;
import no.saksrom.api.ai.SseAiStreamer;
import no.saksrom.api.ai.TextTokenizer;
import no.saksrom.api.audit.AuditService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.Permission;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class SaksromController {
    private final CurrentUserService currentUserService;
    private final SourceBoundSaksromService saksromService;
    private final SourceCoverageService sourceCoverageService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final SseAiStreamer sseAiStreamer;
    private final AuthorizationService authorizationService;

    @Autowired
    public SaksromController(
            CurrentUserService currentUserService,
            SourceBoundSaksromService saksromService,
            SourceCoverageService sourceCoverageService,
            AuditService auditService,
            ObjectMapper objectMapper,
            SseAiStreamer sseAiStreamer,
            AuthorizationService authorizationService
    ) {
        this.currentUserService = currentUserService;
        this.saksromService = saksromService;
        this.sourceCoverageService = sourceCoverageService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.sseAiStreamer = sseAiStreamer;
        this.authorizationService = authorizationService;
    }

    public SaksromController(
            CurrentUserService currentUserService,
            SourceBoundSaksromService saksromService,
            SourceCoverageService sourceCoverageService,
            AuditService auditService,
            ObjectMapper objectMapper,
            SseAiStreamer sseAiStreamer
    ) {
        this(currentUserService, saksromService, sourceCoverageService, auditService, objectMapper, sseAiStreamer, new AuthorizationService());
    }

    @GetMapping("/source-units/search")
    public List<SourceBoundSaksromService.SourceSearchResult> searchSourceUnits(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestParam("q") String query
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SOURCE_READ);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        return saksromService.search(tenantId, parseUuidOrNull(caseId), query);
    }

    @GetMapping("/saksrom/source-coverage")
    public SourceCoverageService.SourceCoverageResponse sourceCoverage(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SOURCE_READ);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        return sourceCoverageService.coverage(tenantId, parseUuidOrNull(caseId));
    }

    @PostMapping("/saksrom/ask")
    public SourceBoundSaksromService.SaksromAnswerResponse ask(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody SourceBoundSaksromService.SaksromQuestionRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        auditService.record(
                tenantId,
                parseUuidOrNull(request.caseId()),
                user.userId(),
                "SAKSROM_QUESTION_ASKED",
                "SAKSROM",
                null,
                "{\"mode\":\"" + safe(request.mode()) + "\"}"
        );
        SourceBoundSaksromService.SaksromAnswerResponse answer = saksromService.answer(tenantId, request);
        auditService.record(
                tenantId,
                parseUuidOrNull(request.caseId()),
                user.userId(),
                "SAKSROM_ANSWER_CREATED",
                "SAKSROM",
                null,
                "{\"sourceBound\":" + answer.sourceBound() + ",\"sourceCount\":" + answer.sources().size() + "}"
        );
        return answer;
    }

    @PostMapping("/saksrom/summary")
    public SourceBoundSaksromService.SaksromSummaryResponse summary(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody SourceBoundSaksromService.SaksromSummaryRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        UUID caseId = parseUuid(request.caseId(), "CASE_ID_INVALID");
        auditService.record(
                tenantId,
                caseId,
                user.userId(),
                "SAKSROM_SUMMARY_REQUESTED",
                "SAKSROM",
                null,
                "{\"sourceBasis\":\"" + safe(request.sourceBasis()) + "\",\"includePartial\":" + Boolean.TRUE.equals(request.includePartial()) + "}"
        );
        SourceBoundSaksromService.SaksromSummaryResponse summary = saksromService.summarize(tenantId, request);
        auditService.record(
                tenantId,
                caseId,
                user.userId(),
                "SAKSROM_SUMMARY_CREATED",
                "SAKSROM",
                null,
                "{\"sourceBound\":" + summary.sourceBound() + ",\"sourceCount\":" + summary.sources().size() + "}"
        );
        return summary;
    }

    @PostMapping(value = "/saksrom/summary/stream", produces = "application/x-ndjson")
    public StreamingResponseBody summaryStream(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody SourceBoundSaksromService.SaksromSummaryRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        UUID caseId = parseUuid(request.caseId(), "CASE_ID_INVALID");
        auditService.record(
                tenantId,
                caseId,
                user.userId(),
                "SAKSROM_SUMMARY_STREAM_REQUESTED",
                "SAKSROM",
                null,
                "{\"sourceBasis\":\"" + safe(request.sourceBasis()) + "\",\"includePartial\":" + Boolean.TRUE.equals(request.includePartial()) + "}"
        );

        return outputStream -> {
            try {
                writeEvent(outputStream, event("stage")
                        .put("stage", "reading_sources")
                        .put("label", "Leser kildegrunnlaget"));

                SourceBoundSaksromService.SaksromSummaryResponse summary = saksromService.summarize(tenantId, request);

                writeEvent(outputStream, event("stage")
                        .put("stage", "extracting_findings")
                        .put("label", "Identifiserer faktiske funn"));
                writeEvent(outputStream, event("section_start")
                        .put("sectionId", "overview")
                        .put("title", "Hovedoversikt"));
                // Stream the overview token-by-token instead of one large block so the client can
                // render it at a smooth, natural reading pace (see SSE variant for the primary path).
                for (String token : TextTokenizer.tokenize(summary.summary())) {
                    writeEvent(outputStream, event("text_delta")
                            .put("sectionId", "overview")
                            .put("text", token));
                }

                writeEvent(outputStream, event("stage")
                        .put("stage", "linking_citations")
                        .put("label", "Knytter funn til kilder"));
                for (SourceReference source : summary.sources()) {
                    writeEvent(outputStream, event("citation")
                            .put("sectionId", "overview")
                            .put("citation", source));
                }

                for (SourceBoundSaksromService.SummaryFinding finding : summary.findings()) {
                    writeEvent(outputStream, event("finding")
                            .put("theme", themeForFinding(finding))
                            .put("heading", finding.heading())
                            .put("text", finding.text())
                            .put("citations", finding.sources()));
                }

                for (String warning : summary.warnings()) {
                    writeEvent(outputStream, event("warning")
                            .put("code", warning)
                            .put("text", warningText(warning, summary.coverage())));
                }

                writeEvent(outputStream, event("stage")
                        .put("stage", "composing_summary")
                        .put("label", "Bygger foreløpig saksoversikt"));
                writeEvent(outputStream, event("complete")
                        .put("summary", summary));

                auditService.record(
                        tenantId,
                        caseId,
                        user.userId(),
                        "SAKSROM_SUMMARY_STREAM_COMPLETED",
                        "SAKSROM",
                        null,
                        "{\"sourceBound\":" + summary.sourceBound() + ",\"sourceCount\":" + summary.sources().size() + "}"
                );
            } catch (Exception exception) {
                writeEvent(outputStream, event("error")
                        .put("message", "Kunne ikke strømme kildebundet oppsummering."));
            }
        };
    }

    /**
     * Primary streaming path for the source-bound summary: true Server-Sent Events, token-by-token.
     * Every event carries a monotonic {@code seq} (also the SSE {@code id:}); the stream always ends
     * with {@code event: done} or {@code event: error}. Pass {@code fromToken} on reconnect to resume
     * from the last token the client already rendered.
     */
    @PostMapping(value = "/saksrom/summary/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter summarySse(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "fromToken", required = false, defaultValue = "0") int fromToken,
            @RequestBody SourceBoundSaksromService.SaksromSummaryRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        UUID caseId = parseUuid(request.caseId(), "CASE_ID_INVALID");
        auditService.record(
                tenantId,
                caseId,
                user.userId(),
                "SAKSROM_SUMMARY_STREAM_REQUESTED",
                "SAKSROM",
                null,
                "{\"transport\":\"sse\",\"sourceBasis\":\"" + safe(request.sourceBasis()) + "\"}"
        );

        return sseAiStreamer.stream(fromToken, sink -> {
            sink.stage("reading_sources", "Leser kildegrunnlaget");
            SourceBoundSaksromService.SaksromSummaryResponse summary = saksromService.summarize(tenantId, request);

            sink.stage("extracting_findings", "Identifiserer faktiske funn");
            sink.event("section_start", Map.of("sectionId", "overview", "title", "Hovedoversikt"));
            sink.tokens("overview", summary.summary());

            sink.stage("linking_citations", "Knytter funn til kilder");
            for (SourceReference source : summary.sources()) {
                sink.event("citation", Map.of("sectionId", "overview", "citation", source));
            }
            for (SourceBoundSaksromService.SummaryFinding finding : summary.findings()) {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("theme", themeForFinding(finding));
                data.put("heading", finding.heading());
                data.put("text", finding.text());
                data.put("citations", finding.sources());
                sink.event("finding", data);
            }
            for (String warning : summary.warnings()) {
                sink.event("warning", Map.of("code", warning, "text", warningText(warning, summary.coverage())));
            }

            sink.stage("composing_summary", "Bygger foreløpig saksoversikt");
            sink.event("complete", Map.of("summary", summary));

            if (!sink.cancelled()) {
                auditService.record(
                        tenantId,
                        caseId,
                        user.userId(),
                        "SAKSROM_SUMMARY_STREAM_COMPLETED",
                        "SAKSROM",
                        null,
                        "{\"transport\":\"sse\",\"sourceBound\":" + summary.sourceBound()
                                + ",\"sourceCount\":" + summary.sources().size() + "}"
                );
            }
        });
    }

    /**
     * Streaming path for the Saksrom chat answer: same SSE contract as {@link #summarySse}.
     */
    @PostMapping(value = "/saksrom/ask/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter askSse(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "fromToken", required = false, defaultValue = "0") int fromToken,
            @RequestBody SourceBoundSaksromService.SaksromQuestionRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        auditService.record(
                tenantId,
                parseUuidOrNull(request.caseId()),
                user.userId(),
                "SAKSROM_QUESTION_ASKED",
                "SAKSROM",
                null,
                "{\"transport\":\"sse\",\"mode\":\"" + safe(request.mode()) + "\"}"
        );

        return sseAiStreamer.stream(fromToken, sink -> {
            sink.stage("reading_sources", "Leser kildegrunnlaget");
            SourceBoundSaksromService.SaksromAnswerResponse answer = saksromService.answer(tenantId, request);

            sink.event("section_start", Map.of("sectionId", "answer", "title", "Svar"));
            sink.tokens("answer", answer.answer());

            sink.stage("linking_citations", "Knytter funn til kilder");
            for (SourceReference source : answer.sources()) {
                sink.event("citation", Map.of("sectionId", "answer", "citation", source));
            }
            for (String warning : answer.warnings()) {
                sink.event("warning", Map.of("code", warning, "text", warning));
            }
            sink.event("complete", Map.of("answer", answer));

            if (!sink.cancelled()) {
                auditService.record(
                        tenantId,
                        parseUuidOrNull(request.caseId()),
                        user.userId(),
                        "SAKSROM_ANSWER_CREATED",
                        "SAKSROM",
                        null,
                        "{\"transport\":\"sse\",\"sourceBound\":" + answer.sourceBound()
                                + ",\"sourceCount\":" + answer.sources().size() + "}"
                );
            }
        });
    }

    private UUID requireMatchingTenant(String tenantHeader, AuthenticatedUser user) {
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        return requestedTenant;
    }

    private UUID parseUuid(String value, String errorCode) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode, e);
        }
    }

    private UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private EventBuilder event(String type) {
        return new EventBuilder().put("type", type);
    }

    private void writeEvent(OutputStream outputStream, EventBuilder event) throws IOException {
        outputStream.write(objectMapper.writeValueAsString(event.values()).getBytes(StandardCharsets.UTF_8));
        outputStream.write('\n');
        outputStream.flush();
    }

    private String themeForFinding(SourceBoundSaksromService.SummaryFinding finding) {
        String text = (finding.heading() + " " + finding.text()).toLowerCase();
        if (text.contains("rettsbok") || text.contains("retten") || text.contains("prosess")) {
            return "Rettsbok og prosess";
        }
        if (text.contains("avtale") || text.contains("kontrakt") || text.contains("leietaker") || text.contains("utleier")) {
            return "Avtale, ansvar og dokumentasjon";
        }
        if (text.contains("motstrid") || text.contains("usikker") || text.contains("bestrid")) {
            return "Motstrid og usikkerhet";
        }
        return "Øvrige kildeutdrag";
    }

    private String warningText(String warning, SourceCoverageService.SourceCoverageResponse coverage) {
        if ("PARTIAL_SOURCE_COVERAGE".equals(warning) && coverage != null) {
            return coverage.readyPages() + " av " + coverage.totalPages() + " sider brukes. Uferdige sider er ikke kilder.";
        }
        if (warning.startsWith("MISSING_OCR_PAGES=")) {
            return "Sider som krever OCR er ikke brukt som kilder: " + warning.substring("MISSING_OCR_PAGES=".length());
        }
        if (warning.startsWith("BELOW_THRESHOLD_PAGES=")) {
            return "Sider som krever kontroll er ikke brukt som kilder: " + warning.substring("BELOW_THRESHOLD_PAGES=".length());
        }
        return warning;
    }

    private static final class EventBuilder {
        private final Map<String, Object> values = new LinkedHashMap<>();

        private EventBuilder put(String key, Object value) {
            if (value != null) {
                values.put(key, value);
            }
            return this;
        }

        private Map<String, Object> values() {
            return values;
        }
    }
}
