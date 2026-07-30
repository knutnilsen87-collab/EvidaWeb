package no.saksrom.api.saksrom;

import no.saksrom.api.document.DocumentSourceUnit;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class SourceBoundSaksromService {
    private static final int SEARCH_LIMIT = 20;
    private static final int SUMMARY_SOURCE_LIMIT = 8;
    private static final Set<String> STOP_WORDS = Set.of(
            "hva", "står", "sier", "det", "den", "dette", "som", "med", "for",
            "om", "på", "paa", "ikke", "eller", "til", "fra", "kan", "skal", "vil"
    );

    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final SourceCoverageService sourceCoverageService;

    public SourceBoundSaksromService(DocumentSourceUnitRepository sourceUnitRepository) {
        this(sourceUnitRepository, null);
    }

    @Autowired
    public SourceBoundSaksromService(DocumentSourceUnitRepository sourceUnitRepository, SourceCoverageService sourceCoverageService) {
        this.sourceUnitRepository = sourceUnitRepository;
        this.sourceCoverageService = sourceCoverageService;
    }

    @Transactional(readOnly = true)
    public List<SourceSearchResult> search(UUID tenantId, UUID caseId, String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        Map<String, SourceSearchResult> results = new LinkedHashMap<>();
        for (String term : searchTerms(query)) {
            sourceUnitRepository.searchKeyword(tenantId, caseId, term, PageRequest.of(0, SEARCH_LIMIT))
                    .stream()
                    .map(SourceSearchResult::from)
                    .forEach(result -> results.putIfAbsent(result.sourceUnitId(), result));
            if (results.size() >= SEARCH_LIMIT) {
                break;
            }
        }
        return results.values().stream().limit(SEARCH_LIMIT).toList();
    }

    @Transactional(readOnly = true)
    public SaksromAnswerResponse answer(UUID tenantId, SaksromQuestionRequest request) {
        UUID reqCaseId = parseUuidOrNull(request.caseId());
        SourceCoverageService.SourceCoverageResponse coverage = reqCaseId == null || sourceCoverageService == null
                ? null
                : sourceCoverageService.coverage(tenantId, reqCaseId);
        List<DocumentSourceUnit> selectedUnits = selectedUnits(tenantId, request);
        if (selectedUnits.isEmpty()) {
            return hasReadySourceBasis(tenantId, reqCaseId) ? noRelevantSourceMatch(coverage) : noSourceBasis();
        }

        List<SourceReference> sources = selectedUnits.stream()
                .sorted(Comparator.comparing(DocumentSourceUnit::getPageNumber).thenComparing(DocumentSourceUnit::getSourceUnitId))
                .map(SourceReference::from)
                .toList();
        String sourceSummary = selectedUnits.stream()
                .map(DocumentSourceUnit::getTextContent)
                .filter(text -> text != null && !text.isBlank())
                .findFirst()
                .map(text -> text.length() > 240 ? text.substring(0, 240) + "..." : text)
                .orElse("Kilden er registrert, men mangler lesbart tekstutdrag.");
        List<String> warnings = coverageWarnings(coverage);

        return new SaksromAnswerResponse(
                coveragePrefix(coverage, request.question()) + "Kildebundet vurdering basert på valgt kildegrunnlag: " + sourceSummary,
                sources,
                true,
                warnings
        );
    }

    @Transactional(readOnly = true)
    public SaksromSummaryResponse summarize(UUID tenantId, SaksromSummaryRequest request) {
        UUID caseId = parseRequiredUuid(request.caseId(), "caseId er påkrevd.");
        SourceCoverageService.SourceCoverageResponse coverage = sourceCoverageService == null
                ? null
                : sourceCoverageService.coverage(tenantId, caseId);
        List<DocumentSourceUnit> units = sourceUnitRepository.findReadyTextByTenantIdAndCaseId(
                tenantId,
                caseId,
                PageRequest.of(0, SUMMARY_SOURCE_LIMIT)
        );

        if (units.isEmpty()) {
            return new SaksromSummaryResponse(
                    caseId.toString(),
                    "Ingen kildeklar oppsummering",
                    "Saksrommet har ikke ferdige kildeenheter å oppsummere ennå.",
                    List.of(),
                    List.of(),
                    false,
                    List.of("NO_SOURCE_BASIS"),
                    coverage
            );
        }

        List<SourceReference> sources = units.stream()
                .sorted(Comparator.comparing(DocumentSourceUnit::getPageNumber).thenComparing(DocumentSourceUnit::getSourceUnitId))
                .map(SourceReference::from)
                .toList();
        List<String> warnings = coverageWarnings(coverage);
        boolean partial = coverage != null && coverage.totalPages() > 0 && coverage.readyPages() < coverage.totalPages();
        String title = partial ? "Foreløpig kildebundet saksoppsummering" : "Kildebundet saksoppsummering";
        String summary = buildSummaryText(coverage, units);
        List<SummaryFinding> findings = units.stream()
                .limit(5)
                .map(unit -> new SummaryFinding(
                        "Side " + unit.getPageNumber(),
                        quote(unit.getTextContent()),
                        List.of(SourceReference.from(unit))
                ))
                .toList();

        return new SaksromSummaryResponse(
                caseId.toString(),
                title,
                summary,
                findings,
                sources,
                true,
                warnings,
                coverage
        );
    }

    private List<DocumentSourceUnit> selectedUnits(UUID tenantId, SaksromQuestionRequest request) {
        UUID reqCaseId = parseUuidOrNull(request.caseId());
        List<String> selectedIds = request.selectedSourceUnitIds() == null ? List.of() : request.selectedSourceUnitIds();

        List<DocumentSourceUnit> units;
        if (!selectedIds.isEmpty()) {
            units = sourceUnitRepository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(tenantId, selectedIds);
        } else {
            List<String> foundIds = search(tenantId, reqCaseId, request.question()).stream()
                    .map(SourceSearchResult::sourceUnitId)
                    .toList();
            if (foundIds.isEmpty()) {
                return List.of();
            }
            units = sourceUnitRepository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(tenantId, foundIds);
        }

        if (reqCaseId != null) {
            units = units.stream()
                    .filter(unit -> reqCaseId.equals(unit.getCaseId()))
                    .toList();
        } else {
            units = units.stream()
                    .filter(unit -> unit.getCaseId() == null)
                    .toList();
        }
        return units;
    }

    private SaksromAnswerResponse noSourceBasis() {
        return new SaksromAnswerResponse(
                "Jeg har ikke nok kildegrunnlag til å svare kildebundet. Last opp og klargjør kilder først, eller velg relevante kilder.",
                List.of(),
                false,
                List.of("NO_SOURCE_BASIS")
        );
    }

    private SaksromAnswerResponse noRelevantSourceMatch(SourceCoverageService.SourceCoverageResponse coverage) {
        List<String> warnings = new ArrayList<>(coverageWarnings(coverage));
        warnings.add("NO_RELEVANT_SOURCE_MATCH");
        return new SaksromAnswerResponse(
                coveragePrefix(coverage, null) + "Jeg finner ikke støtte for dette i det tilgjengelige kildegrunnlaget.",
                List.of(),
                true,
                warnings
        );
    }

    private boolean hasReadySourceBasis(UUID tenantId, UUID caseId) {
        return sourceUnitRepository.countReadyTextByTenantIdAndCaseId(tenantId, caseId) > 0;
    }

    private List<String> coverageWarnings(SourceCoverageService.SourceCoverageResponse coverage) {
        if (coverage == null || coverage.totalPages() <= 0 || coverage.readyPages() >= coverage.totalPages()) {
            return List.of();
        }
        List<String> warnings = new ArrayList<>();
        warnings.add("PARTIAL_SOURCE_COVERAGE");
        if (coverage.missingOcrPages() > 0) {
            warnings.add("MISSING_OCR_PAGES=" + coverage.missingOcrPageRanges());
        }
        if (coverage.belowThresholdPages() > 0) {
            warnings.add("BELOW_THRESHOLD_PAGES=" + coverage.belowThresholdPageRanges());
        }
        return warnings;
    }

    private String buildSummaryText(SourceCoverageService.SourceCoverageResponse coverage, List<DocumentSourceUnit> units) {
        StringBuilder text = new StringBuilder();
        if (coverage != null && coverage.totalPages() > 0 && coverage.readyPages() < coverage.totalPages()) {
            text.append("Foreløpig kildegrunnlag: oppsummeringen bygger kun på ")
                    .append(coverage.readyPages())
                    .append(" av ")
                    .append(coverage.totalPages())
                    .append(" sider med ferdige kildeenheter. ");
        } else {
            text.append("Oppsummeringen bygger på ferdige kildeenheter i saken. ");
        }
        text.append("De første tilgjengelige kildeenhetene viser: ");
        text.append(units.stream()
                .limit(3)
                .map(unit -> "side " + unit.getPageNumber() + ": " + quote(unit.getTextContent()))
                .toList()
                .stream()
                .reduce((left, right) -> left + " " + right)
                .orElse("ingen lesbare utdrag."));
        return text.toString();
    }

    private String quote(String value) {
        if (value == null || value.isBlank()) {
            return "Kildeenhet uten lesbart tekstutdrag.";
        }
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() > 260 ? normalized.substring(0, 260) + "..." : normalized;
    }

    private String coveragePrefix(SourceCoverageService.SourceCoverageResponse coverage, String question) {
        if (coverage == null || coverage.totalPages() <= 0 || coverage.readyPages() >= coverage.totalPages()) {
            return "";
        }
        StringBuilder prefix = new StringBuilder("Foreløpig kildegrunnlag: Svaret bygger på ")
                .append(coverage.readyPages())
                .append(" av ")
                .append(coverage.totalPages())
                .append(" sider. ");
        if (coverage.missingOcrPages() > 0) {
            prefix.append(coverage.missingOcrPages())
                    .append(" sider krever OCR");
            if (!coverage.missingOcrPageRanges().isBlank()) {
                prefix.append(" (side ").append(coverage.missingOcrPageRanges()).append(")");
            }
            prefix.append(" og er ikke brukt som kilder. ");
        }
        if (coverage.belowThresholdPages() > 0) {
            prefix.append(coverage.belowThresholdPages())
                    .append(" sider krever kontroll");
            if (!coverage.belowThresholdPageRanges().isBlank()) {
                prefix.append(" (side ").append(coverage.belowThresholdPageRanges()).append(")");
            }
            prefix.append(". ");
        }
        if (questionTargetsMissingPages(question, coverage)) {
            prefix.append("Dette kan ikke vurderes fullt ut fordi spørsmålet kan gjelde sider som mangler lesbart kildegrunnlag. ");
        }
        return prefix.toString();
    }

    private List<String> searchTerms(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        LinkedHashSet<String> terms = new LinkedHashSet<>();
        for (String token : query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (token.contains("rettsbok")) {
                terms.add("rettsbok");
            }
            if (token.contains("utskrift")) {
                terms.add("utskrift");
            }
            if (token.contains("håndskrev") || token.contains("handskrev")) {
                terms.add("håndskrev");
                terms.add("handskrev");
            }
            addSearchTerm(terms, token);
        }
        return terms.stream().limit(8).toList();
    }

    private void addSearchTerm(Set<String> terms, String token) {
        if (token == null || token.length() < 4 || STOP_WORDS.contains(token)) {
            return;
        }
        terms.add(token);
        for (String suffix : List.of("ene", "en", "et", "er")) {
            if (token.length() > suffix.length() + 3 && token.endsWith(suffix)) {
                String stem = token.substring(0, token.length() - suffix.length());
                if (stem.length() >= 4 && !STOP_WORDS.contains(stem)) {
                    terms.add(stem);
                }
            }
        }
    }

    private boolean questionTargetsMissingPages(String question, SourceCoverageService.SourceCoverageResponse coverage) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String normalized = question.toLowerCase();
        if (normalized.contains("ocr") || normalized.contains("skannet") || normalized.contains("rettsbok")) {
            return true;
        }
        return coverage.documentCoverage().stream()
                .flatMap(document -> document.missingOcrPageNumbers().stream())
                .anyMatch(page -> normalized.contains("side " + page) || normalized.contains("s. " + page));
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

    private UUID parseRequiredUuid(String value, String message) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException(message, e);
        }
    }

    public record SourceSearchResult(
            UUID documentId,
            String sourceUnitId,
            Integer pageNumber,
            String snippet,
            Double score,
            String searchMode
    ) {
        static SourceSearchResult from(DocumentSourceUnit unit) {
            return new SourceSearchResult(
                    unit.getDocumentId(),
                    unit.getSourceUnitId(),
                    unit.getPageNumber(),
                    unit.getTextContent(),
                    unit.getExtractionConfidence(),
                    "keyword_v1"
            );
        }
    }

    public record SaksromQuestionRequest(
            String caseId,
            String question,
            List<String> selectedSourceUnitIds,
            String mode,
            Boolean includePartial,
            String sourceBasis
    ) {}

    public record SaksromSummaryRequest(
            String caseId,
            Boolean includePartial,
            String sourceBasis
    ) {}

    public record SummaryFinding(
            String heading,
            String text,
            List<SourceReference> sources
    ) {}

    public record SaksromSummaryResponse(
            String caseId,
            String title,
            String summary,
            List<SummaryFinding> findings,
            List<SourceReference> sources,
            boolean sourceBound,
            List<String> warnings,
            SourceCoverageService.SourceCoverageResponse coverage
    ) {}

    public record SaksromAnswerResponse(
            String answer,
            List<SourceReference> sources,
            boolean sourceBound,
            List<String> warnings
    ) {}
}
