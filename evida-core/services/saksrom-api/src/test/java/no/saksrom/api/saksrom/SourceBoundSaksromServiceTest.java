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
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(null, "Hva er varslingsplikten?", List.of(), "sporre", true, "READY_PAGE_UNITS_ONLY");

        var answer = service.answer(TENANT_ID, request);

        assertFalse(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertTrue(answer.warnings().contains("NO_SOURCE_BASIS"));
        assertTrue(answer.answer().contains("ikke nok kildegrunnlag"));
    }

    @Test
    void askWithReadyUnitsButNoRetrievalMatchReturnsNoRelevantSourceMatch() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var coverageService = mock(SourceCoverageService.class);
        var service = new SourceBoundSaksromService(repository, coverageService);
        var coverage = new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                77,
                5,
                72,
                0,
                1,
                0,
                99,
                "",
                "75",
                List.of()
        );
        when(coverageService.coverage(TENANT_ID, CASE_ID)).thenReturn(coverage);
        when(repository.searchKeyword(eq(TENANT_ID), eq(CASE_ID), eq("finnes"), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.countReadyTextByTenantIdAndCaseId(TENANT_ID, CASE_ID)).thenReturn(77L);
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                CASE_ID.toString(),
                "finnes ikke",
                List.of(),
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
        );

        var answer = service.answer(TENANT_ID, request);

        assertTrue(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertFalse(answer.warnings().contains("NO_SOURCE_BASIS"));
        assertTrue(answer.warnings().contains("NO_RELEVANT_SOURCE_MATCH"));
        assertTrue(answer.warnings().contains("PARTIAL_SOURCE_COVERAGE"));
        assertTrue(answer.warnings().contains("BELOW_THRESHOLD_PAGES=75"));
        assertTrue(answer.answer().contains("Jeg finner ikke støtte"));
    }

    @Test
    void askWithNaturalRettsbokQuestionFindsReadyOcrPageUnit() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var coverageService = mock(SourceCoverageService.class);
        var service = new SourceBoundSaksromService(repository, coverageService);
        var unit = unit("doc_00000000_p0001_b0001", "UTSKRIFT AV RETTSBOK Oslo byrett forklarte vedlikeholdsansvar.", 1);
        when(coverageService.coverage(TENANT_ID, CASE_ID)).thenReturn(new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                77,
                5,
                72,
                0,
                1,
                0,
                99,
                "",
                "75",
                List.of()
        ));
        when(repository.searchKeyword(eq(TENANT_ID), eq(CASE_ID), anyString(), any(Pageable.class)))
                .thenReturn(List.of());
        when(repository.searchKeyword(eq(TENANT_ID), eq(CASE_ID), eq("rettsbok"), any(Pageable.class)))
                .thenReturn(List.of(unit));
        when(repository.searchKeyword(eq(TENANT_ID), eq(CASE_ID), eq("utskrift"), any(Pageable.class)))
                .thenReturn(List.of(unit));
        when(repository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
                TENANT_ID,
                List.of("doc_00000000_p0001_b0001")
        )).thenReturn(List.of(unit));
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                CASE_ID.toString(),
                "Hva står det i den håndskrevne teksten på utskriften av rettsboken?",
                List.of(),
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
        );

        var answer = service.answer(TENANT_ID, request);

        assertTrue(answer.sourceBound());
        assertFalse(answer.warnings().contains("NO_SOURCE_BASIS"));
        assertFalse(answer.warnings().contains("NO_RELEVANT_SOURCE_MATCH"));
        assertEquals(1, answer.sources().size());
        assertEquals(1, answer.sources().get(0).pageNumber());
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
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
        );

        var answer = service.answer(TENANT_ID, request);

        assertTrue(answer.sourceBound());
        assertEquals(1, answer.sources().size());
        assertEquals("doc_00000000_p0001_b0001", answer.sources().get(0).sourceUnitId());
        assertFalse(answer.sources().stream().anyMatch(source -> "nonexistent".equals(source.sourceUnitId())));
    }

    @Test
    void askWithPartialCoverageDisclosesMissingPagesButOnlyReferencesRealUnits() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var coverageService = mock(SourceCoverageService.class);
        var service = new SourceBoundSaksromService(repository, coverageService);
        var unit = unit("doc_00000000_p0006_b0001", "Skriftlig varsling må dokumenteres.", 6);
        var documentCoverage = new SourceCoverageService.DocumentCoverage(
                DOCUMENT_ID,
                "masterdoc.pdf",
                "PARTIAL_SOURCE_READY",
                78,
                72,
                0,
                72,
                5,
                1,
                0,
                "1-5",
                "75",
                List.of(1, 2, 3, 4, 5),
                List.of(75),
                "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 text_below_threshold=75 parsed_pages=72/78",
                false,
                true,
                false
        );
        var coverage = new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                72,
                0,
                72,
                5,
                1,
                0,
                92,
                "1-5",
                "75",
                List.of(documentCoverage)
        );
        when(repository.findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
                TENANT_ID,
                List.of("doc_00000000_p0006_b0001")
        )).thenReturn(List.of(unit));
        when(coverageService.coverage(TENANT_ID, CASE_ID)).thenReturn(coverage);
        var request = new SourceBoundSaksromService.SaksromQuestionRequest(
                CASE_ID.toString(),
                "Hva sier side 1 om rettsbok?",
                List.of("doc_00000000_p0006_b0001"),
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
        );

        var answer = service.answer(TENANT_ID, request);

        assertTrue(answer.sourceBound());
        assertTrue(answer.answer().contains("72 av 78 sider"));
        assertTrue(answer.answer().contains("Dette kan ikke vurderes fullt ut"));
        assertTrue(answer.warnings().contains("PARTIAL_SOURCE_COVERAGE"));
        assertTrue(answer.warnings().contains("MISSING_OCR_PAGES=1-5"));
        assertEquals(1, answer.sources().size());
        assertEquals(6, answer.sources().get(0).pageNumber());
    }

    @Test
    void summarizePartialReadyCaseUsesOnlyReadySourceUnits() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var coverageService = mock(SourceCoverageService.class);
        var service = new SourceBoundSaksromService(repository, coverageService);
        var unit = unit("doc_00000000_p0001_b0001", "UTSKRIFT AV RETTSBOK viser rettens behandling.", 1);
        var coverage = new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                77,
                5,
                72,
                0,
                1,
                0,
                99,
                "",
                "75",
                List.of()
        );
        when(coverageService.coverage(TENANT_ID, CASE_ID)).thenReturn(coverage);
        when(repository.findReadyTextByTenantIdAndCaseId(eq(TENANT_ID), eq(CASE_ID), any(Pageable.class)))
                .thenReturn(List.of(unit));

        var response = service.summarize(
                TENANT_ID,
                new SourceBoundSaksromService.SaksromSummaryRequest(
                        CASE_ID.toString(),
                        true,
                        "READY_PAGE_UNITS_ONLY"
                )
        );

        assertTrue(response.sourceBound());
        assertEquals(1, response.sources().size());
        assertEquals(1, response.sources().get(0).pageNumber());
        assertTrue(response.summary().contains("77 av 78 sider"));
        assertTrue(response.summary().contains("UTSKRIFT AV RETTSBOK"));
        assertTrue(response.warnings().contains("PARTIAL_SOURCE_COVERAGE"));
        assertTrue(response.warnings().contains("BELOW_THRESHOLD_PAGES=75"));
    }

    @Test
    void summarizeWithoutReadyUnitsReturnsNoSourceBasis() {
        var repository = mock(DocumentSourceUnitRepository.class);
        var coverageService = mock(SourceCoverageService.class);
        var service = new SourceBoundSaksromService(repository, coverageService);
        when(coverageService.coverage(TENANT_ID, CASE_ID)).thenReturn(new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                0,
                0,
                0,
                78,
                0,
                0,
                0,
                "1-78",
                "",
                List.of()
        ));
        when(repository.findReadyTextByTenantIdAndCaseId(eq(TENANT_ID), eq(CASE_ID), any(Pageable.class)))
                .thenReturn(List.of());

        var response = service.summarize(
                TENANT_ID,
                new SourceBoundSaksromService.SaksromSummaryRequest(
                        CASE_ID.toString(),
                        true,
                        "READY_PAGE_UNITS_ONLY"
                )
        );

        assertFalse(response.sourceBound());
        assertTrue(response.sources().isEmpty());
        assertTrue(response.warnings().contains("NO_SOURCE_BASIS"));
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
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
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
                "sporre",
                true,
                "READY_PAGE_UNITS_ONLY"
        );

        var answer = service.answer(TENANT_ID, request);

        assertFalse(answer.sourceBound());
        assertTrue(answer.sources().isEmpty());
        assertTrue(answer.warnings().contains("NO_SOURCE_BASIS"));
    }

    private DocumentSourceUnit unit(String sourceUnitId, String text) {
        return unit(sourceUnitId, text, 1);
    }

    private DocumentSourceUnit unit(String sourceUnitId, String text, int pageNumber) {
        return new DocumentSourceUnit(
                UUID.randomUUID(),
                TENANT_ID,
                CASE_ID,
                DOCUMENT_ID,
                sourceUnitId,
                pageNumber,
                "TEXT_BLOCK",
                text,
                0,
                text.length(),
                null,
                0.85
        );
    }
}
