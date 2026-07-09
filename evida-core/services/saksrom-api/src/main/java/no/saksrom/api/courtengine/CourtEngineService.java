package no.saksrom.api.courtengine;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import no.saksrom.api.document.Document;
import no.saksrom.api.document.DocumentRepository;
import no.saksrom.api.document.DocumentSourceUnit;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class CourtEngineService {
    private final DocumentRepository documentRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final OperativeSummaryRepository summaryRepository;
    private final ObjectMapper objectMapper;

    public CourtEngineService(
            DocumentRepository documentRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            OperativeSummaryRepository summaryRepository,
            ObjectMapper objectMapper
    ) {
        this.documentRepository = documentRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.summaryRepository = summaryRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AnalysisStartResponse startAnalysis(UUID tenantId, String caseId, Collection<String> fileIds) {
        String normalizedCaseId = normalizeCaseId(caseId);
        List<UUID> documentIds = parseDocumentIds(fileIds);
        OperativeSummaryEntity entity = summaryRepository.findByTenantIdAndCaseId(tenantId, normalizedCaseId)
                .orElseGet(() -> new OperativeSummaryEntity(UUID.randomUUID(), tenantId, normalizedCaseId));
        entity.markProcessing();
        summaryRepository.save(entity);

        try {
            OperativeSummaryResponse summary = runLegalAnalysis(tenantId, normalizedCaseId, documentIds);
            OperativeSummaryValidator.validate(summary);
            entity.markCompleted(writeSummary(summary));
            summaryRepository.save(entity);
            return new AnalysisStartResponse(normalizedCaseId, "completed", documentIds.stream().map(UUID::toString).toList());
        } catch (RuntimeException e) {
            entity.markFailed(e.getMessage());
            summaryRepository.save(entity);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public OperativeSummaryResponse getSummary(UUID tenantId, String caseId) {
        OperativeSummaryEntity entity = summaryRepository.findByTenantIdAndCaseId(tenantId, normalizeCaseId(caseId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Operativ oppsummering finnes ikke."));
        if (!"completed".equals(entity.getAnalysisStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Analyse er ikke fullfort.");
        }

        try {
            OperativeSummaryResponse summary = objectMapper.readValue(entity.getSummaryJson(), OperativeSummaryResponse.class);
            OperativeSummaryValidator.validate(summary);
            return summary;
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Lagret oppsummering feilet validering.", e);
        }
    }

    private OperativeSummaryResponse runLegalAnalysis(UUID tenantId, String caseId, List<UUID> documentIds) {
        UUID parsedCaseId = null;
        if (caseId != null && !caseId.isBlank()) {
            try {
                parsedCaseId = UUID.fromString(caseId);
            } catch (IllegalArgumentException e) {
                // Not a valid UUID
            }
        }
        final UUID finalParsedCaseId = parsedCaseId;

        List<Document> documents = documentIds.stream()
                .map(documentId -> {
                    Document doc = documentRepository.findByIdAndTenantId(documentId, tenantId)
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet: " + documentId));
                    if (finalParsedCaseId != null && !finalParsedCaseId.equals(doc.getCaseId())) {
                        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Document does not belong to the active case.");
                    }
                    return doc;
                })
                .toList();
        List<DocumentSourceUnit> units = documentIds.isEmpty()
                ? List.of()
                : sourceUnitRepository.findByTenantIdAndDocumentIdInOrderByDocumentIdAscPageNumberAscSourceUnitIdAsc(tenantId, documentIds);

        int totalPages = totalPages(documents, units);
        int processedPages = processedPages(units);
        double coveragePercent = totalPages == 0 ? 0.0 : Math.min(100.0, (processedPages * 100.0) / totalPages);
        List<String> missingIntervals = processedPages >= totalPages
                ? List.of()
                : List.of("Dekning er ikke komplett for alle registrerte dokumentsider");
        OperativeSummaryResponse.IntegrityStatus integrityStatus = processedPages > 0
                ? OperativeSummaryResponse.IntegrityStatus.verified
                : OperativeSummaryResponse.IntegrityStatus.unverified;

        List<OperativeSummaryResponse.SourceRef> firstSources = units.stream()
                .sorted(Comparator.comparing(DocumentSourceUnit::getPageNumber).thenComparing(DocumentSourceUnit::getSourceUnitId))
                .limit(3)
                .map(this::sourceRef)
                .toList();

        List<OperativeSummaryResponse.ActorCandidate> actors = firstSources.isEmpty()
                ? List.of(new OperativeSummaryResponse.ActorCandidate(
                        "Ikke dokumentert",
                        List.of(new OperativeSummaryResponse.ActorRoleFinding(
                                "Aktorer er ikke identifisert i kildegrunnlaget",
                                VerificationStatus.not_documented,
                                List.of()
                        ))
                ))
                : List.of(new OperativeSummaryResponse.ActorCandidate(
                        "Dokumentert kildegrunnlag",
                        List.of(new OperativeSummaryResponse.ActorRoleFinding(
                                "Forelopig kildebaerer",
                                VerificationStatus.requires_manual_review,
                                firstSources
                        ))
                ));

        List<OperativeSummaryResponse.KeyFinding> keyFindings = firstSources.isEmpty()
                ? List.of(new OperativeSummaryResponse.KeyFinding(
                        "Ingen dokumenterte funn kan etableres uten kildeenheter.",
                        VerificationStatus.not_documented,
                        List.of()
                ))
                : List.of(new OperativeSummaryResponse.KeyFinding(
                        "Saken har klargjort kildegrunnlag som kan brukes i kildebundet analyse.",
                        VerificationStatus.verified,
                        firstSources
                ));

        List<OperativeSummaryResponse.RiskFinding> risks = new ArrayList<>();
        if (firstSources.isEmpty()) {
            risks.add(new OperativeSummaryResponse.RiskFinding(
                    "source_coverage",
                    "Dokumentgrunnlaget er ikke klart for dokumenterte juridiske konklusjoner.",
                    OperativeSummaryResponse.Severity.high,
                    VerificationStatus.not_documented,
                    List.of()
            ));
        } else if (coveragePercent < 100.0) {
            risks.add(new OperativeSummaryResponse.RiskFinding(
                    "source_coverage",
                    "Dekningen er ufullstendig og bor kontrolleres for manglende sider eller OCR-behov.",
                    OperativeSummaryResponse.Severity.medium,
                    VerificationStatus.requires_manual_review,
                    firstSources
            ));
        }

        return new OperativeSummaryResponse(
                new OperativeSummaryResponse.CaseMetadata(
                        caseId,
                        "EVIDA sak " + caseId,
                        "Legal OS",
                        "completed",
                        OffsetDateTime.now().toString()
                ),
                new OperativeSummaryResponse.CoverageStatus(
                        processedPages,
                        Math.max(1, totalPages),
                        Math.round(coveragePercent * 10.0) / 10.0,
                        missingIntervals,
                        List.of(),
                        integrityStatus
                ),
                actors,
                new OperativeSummaryResponse.OperativeSummary(keyFindings, risks)
        );
    }

    private OperativeSummaryResponse.SourceRef sourceRef(DocumentSourceUnit unit) {
        return new OperativeSummaryResponse.SourceRef(
                unit.getDocumentId().toString(),
                unit.getPageNumber(),
                null,
                unit.getSourceUnitId(),
                quote(unit.getTextContent())
        );
    }

    private String quote(String value) {
        if (value == null || value.isBlank()) {
            return "Kildeenhet uten tekstutdrag.";
        }
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() > 240 ? normalized.substring(0, 240) : normalized;
    }

    private int totalPages(List<Document> documents, List<DocumentSourceUnit> units) {
        int fromDocuments = documents.stream()
                .map(Document::getPageCount)
                .filter(pageCount -> pageCount != null && pageCount > 0)
                .mapToInt(Integer::intValue)
                .sum();
        if (fromDocuments > 0) {
            return fromDocuments;
        }
        return Math.max(1, processedPages(units));
    }

    private int processedPages(List<DocumentSourceUnit> units) {
        Set<String> pages = new LinkedHashSet<>();
        for (DocumentSourceUnit unit : units) {
            pages.add(unit.getDocumentId() + ":" + unit.getPageNumber());
        }
        return pages.size();
    }

    private List<UUID> parseDocumentIds(Collection<String> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileIds er pakrevd.");
        }
        return fileIds.stream()
                .map(value -> {
                    try {
                        return UUID.fromString(value);
                    } catch (RuntimeException e) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileIds ma vaere UUID-er.", e);
                    }
                })
                .toList();
    }

    private String normalizeCaseId(String caseId) {
        return Optional.ofNullable(caseId)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "caseId er pakrevd."));
    }

    private String writeSummary(OperativeSummaryResponse summary) {
        try {
            return objectMapper.writeValueAsString(summary);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Kunne ikke serialisere operativ oppsummering.", e);
        }
    }

    public record AnalysisStartResponse(String caseId, String analysisStatus, List<String> fileIds) {}
}
