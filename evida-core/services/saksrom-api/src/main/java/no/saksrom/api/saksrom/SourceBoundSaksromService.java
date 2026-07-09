package no.saksrom.api.saksrom;

import no.saksrom.api.document.DocumentSourceUnit;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class SourceBoundSaksromService {
    private static final int SEARCH_LIMIT = 20;

    private final DocumentSourceUnitRepository sourceUnitRepository;

    public SourceBoundSaksromService(DocumentSourceUnitRepository sourceUnitRepository) {
        this.sourceUnitRepository = sourceUnitRepository;
    }

    @Transactional(readOnly = true)
    public List<SourceSearchResult> search(UUID tenantId, UUID caseId, String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        return sourceUnitRepository.searchKeyword(tenantId, caseId, query.trim(), PageRequest.of(0, SEARCH_LIMIT))
                .stream()
                .map(SourceSearchResult::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public SaksromAnswerResponse answer(UUID tenantId, SaksromQuestionRequest request) {
        List<DocumentSourceUnit> selectedUnits = selectedUnits(tenantId, request);
        if (selectedUnits.isEmpty()) {
            return noSourceBasis();
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

        return new SaksromAnswerResponse(
                "Kildebundet vurdering basert på valgt kildegrunnlag: " + sourceSummary,
                sources,
                true,
                List.of()
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

        // Filter by requested caseId to ensure case isolation
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
            String mode
    ) {}

    public record SaksromAnswerResponse(
            String answer,
            List<SourceReference> sources,
            boolean sourceBound,
            List<String> warnings
    ) {}
}
