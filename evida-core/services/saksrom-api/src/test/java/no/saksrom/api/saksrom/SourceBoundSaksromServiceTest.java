package no.saksrom.api.saksrom;

import no.saksrom.api.document.DocumentSourceUnit;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SourceBoundSaksromServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID OTHER_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000009999");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001111");

    @Test
    void searchReturnsTenantScopedKeywordResults() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceBoundSaksromService(repository);
        var unit = unit("doc_00000000_p0001_b0001", "varslingsplikt");
        when(repository.searchKeyword(eq(TENANT_ID), eq(CASE_ID), eq("varsling"), any(Pageable.class)))
                .thenReturn(List.of(unit));

        var results = service.search(TENANT_ID, CASE_ID, " varsling ");

        assertEquals(1, results.size());
        assertEquals("keyword_v1", results.get(0).searchMode());
        assertEquals(unit.getSourceUnitId(), results.get(0).sourceUnitId());
        verify(repository).searchKeyword(eq(TENANT_ID), eq(CASE_ID), eq("varsling"), any(Pageable.class));
    }

    @Test
    void askWithoutSourceUnitsReturnsNoSourceBasis() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceBoundSaksromService(repository);
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(null, "Hva er varslingsplikten?", List.of(), "sporre");

        var answer = service.answer(TENANT_ID, request);

        assertFalse(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertTrue(answer.warnings().contains("NO_SOURCE_BASIS"));
        assertTrue(answer.answer().contains("ikke nok kildegrunnlag"));
    }

    @Test
    void askWithSelectedSourceUnitsReturnsOnlyRealReferences() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceBoundSaksromService(repository);
        var unit = unit("doc_00000000_p0001_b0001", "Skriftlig varsling må dokumenteres.");
        when(repository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
                TENANT_ID,
                List.of("doc_00000000_p0001_b0001", "nonexistent")
        )).thenReturn(List.of(unit));
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                CASE_ID.toString(),
                "Hva er varslingsplikten?",
                List.of("doc_00000000_p0001_b0001", "nonexistent"),
                "sporre"
        );

        var answer = service.answer(TENANT_ID, request);

        assertTrue(answer.sourceBound());
        assertEquals(1, answer.sources().size());
        assertEquals("doc_00000000_p0001_b0001", answer.sources().get(0).sourceUnitId());
        assertFalse(answer.sources().stream().anyMatch(source -> "nonexistent".equals(source.sourceUnitId())));
    }

    @Test
    void crossTenantSelectedSourceUnitsAreIgnoredByTenantLookup() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceBoundSaksromService(repository);
        when(repository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
                OTHER_TENANT_ID,
                List.of("doc_00000000_p0001_b0001")
        )).thenReturn(List.of());
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                CASE_ID.toString(),
                "Hva er varslingsplikten?",
                List.of("doc_00000000_p0001_b0001"),
                "sporre"
        );

        var answer = service.answer(OTHER_TENANT_ID, request);

        assertFalse(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertTrue(answer.warnings().contains("NO_SOURCE_BASIS"));
    }

    @Test
    void askWithSelectedSourceUnitsFiltersOutCrossCaseReferences() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceBoundSaksromService(repository);
        
        UUID caseA = CASE_ID;
        UUID caseB = UUID.randomUUID();
        
        var unitInCaseA = new DocumentSourceUnit(
                UUID.randomUUID(), TENANT_ID, caseA, DOCUMENT_ID,
                "doc_00000000_p0001_b0001", 1, "TEXT_BLOCK",
                "Skriftlig varsling må dokumenteres.", 0, 34, null, 0.85
        );
        
        when(repository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
                TENANT_ID,
                List.of("doc_00000000_p0001_b0001")
        )).thenReturn(List.of(unitInCaseA));
        
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                caseB.toString(),
                "Hva er varslingsplikten?",
                List.of("doc_00000000_p0001_b0001"),
                "sporre"
        );

        var answer = service.answer(TENANT_ID, request);

        assertFalse(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertTrue(answer.warnings().contains("NO_SOURCE_BASIS"));
    }

    private DocumentSourceUnit unit(String sourceUnitId, String text) {
        return new DocumentSourceUnit(
                UUID.randomUUID(),
                TENANT_ID,
                CASE_ID,
                DOCUMENT_ID,
                sourceUnitId,
                1,
                "TEXT_BLOCK",
                text,
                0,
                text.length(),
                null,
                0.85
        );
    }
}
