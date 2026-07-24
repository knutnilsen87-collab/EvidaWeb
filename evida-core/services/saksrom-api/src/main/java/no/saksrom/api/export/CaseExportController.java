package no.saksrom.api.export;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.casefile.CaseFile;
import no.saksrom.api.casefile.CaseFileRepository;
import no.saksrom.api.saksrom.SourceBoundSaksromService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.Permission;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/exports")
public class CaseExportController {
    private final CurrentUserService currentUserService;
    private final AuthorizationService authorizationService;
    private final CaseFileRepository caseFileRepository;
    private final SourceBoundSaksromService saksromService;
    private final AuditService auditService;

    public CaseExportController(
            CurrentUserService currentUserService,
            AuthorizationService authorizationService,
            CaseFileRepository caseFileRepository,
            SourceBoundSaksromService saksromService,
            AuditService auditService
    ) {
        this.currentUserService = currentUserService;
        this.authorizationService = authorizationService;
        this.caseFileRepository = caseFileRepository;
        this.saksromService = saksromService;
        this.auditService = auditService;
    }

    @GetMapping("/cases/{caseId}/source-report")
    public ResponseEntity<byte[]> exportSourceReport(
            @PathVariable UUID caseId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID requestedTenant = parseTenant(tenantHeader);
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        authorizationService.requirePermission(user, Permission.EXPORT_CREATE);
        CaseFile caseFile = caseFileRepository.findById(caseId)
                .filter(candidate -> requestedTenant.equals(candidate.getTenantId()))
                .filter(candidate -> !"DELETED".equals(candidate.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saken ble ikke funnet for aktiv tenant."));

        SourceBoundSaksromService.SaksromSummaryResponse summary = saksromService.summarize(
                requestedTenant,
                new SourceBoundSaksromService.SaksromSummaryRequest(caseId.toString(), true, "SOURCE_READY_ONLY")
        );
        if (!summary.sourceBound() || summary.sources() == null || summary.sources().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EXPORT_BLOCKED_NO_SOURCE_BASIS");
        }

        OffsetDateTime generatedAt = OffsetDateTime.now();
        byte[] payload = report(caseFile, summary, generatedAt).getBytes(StandardCharsets.UTF_8);
        auditService.record(
                requestedTenant,
                caseId,
                user.userId(),
                "EXPORT_CREATED",
                "CASE_SOURCE_REPORT",
                caseId,
                "{\"format\":\"markdown\",\"sourceCount\":" + summary.sources().size()
                        + ",\"generatedAt\":\"" + generatedAt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME) + "\"}"
        );

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"evida-source-report-" + caseId + ".md\"")
                .contentType(MediaType.parseMediaType("text/markdown;charset=UTF-8"))
                .contentLength(payload.length)
                .body(payload);
    }

    private String report(
            CaseFile caseFile,
            SourceBoundSaksromService.SaksromSummaryResponse summary,
            OffsetDateTime generatedAt
    ) {
        StringBuilder output = new StringBuilder();
        output.append("# EVIDA kildegrunnlagsrapport\n\n")
                .append("> AI-GENERERT UTKAST – MÅ KVALITETSSIKRES AV ANSVARLIG JURIST.\n\n")
                .append("- Sak: ").append(safe(caseFile.getTitle())).append('\n')
                .append("- Saks-ID: `").append(caseFile.getId()).append("`\n")
                .append("- Generert: ").append(generatedAt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).append('\n')
                .append("- Kildebundet: ja\n");
        if (summary.warnings() != null && !summary.warnings().isEmpty()) {
            output.append("- Advarsler: ").append(String.join(", ", summary.warnings())).append('\n');
        }
        output.append("\n## Oppsummering\n\n")
                .append(safe(summary.summary()))
                .append("\n\n## Funn\n\n");
        for (SourceBoundSaksromService.SummaryFinding finding : summary.findings()) {
            output.append("### ").append(safe(finding.heading())).append("\n\n")
                    .append(safe(finding.text())).append("\n\n");
            for (var source : finding.sources()) {
                output.append("- Kilde: dokument `").append(source.documentId())
                        .append("`, side ").append(source.pageNumber())
                        .append(", kildeenhet `").append(safe(source.sourceUnitId())).append("`\n");
            }
            output.append('\n');
        }
        output.append("## Fullstendig kildegrunnlag\n\n");
        for (var source : summary.sources()) {
            output.append("- Dokument `").append(source.documentId())
                    .append("`, side ").append(source.pageNumber())
                    .append(", kildeenhet `").append(safe(source.sourceUnitId())).append("`\n");
        }
        return output.toString();
    }

    private UUID parseTenant(String tenantHeader) {
        try {
            return UUID.fromString(tenantHeader);
        } catch (RuntimeException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "TENANT_HEADER_INVALID", error);
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.replace("\r", " ").replace("\n", " ").trim();
    }
}
