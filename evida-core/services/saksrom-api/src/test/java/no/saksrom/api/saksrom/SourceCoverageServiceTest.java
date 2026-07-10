package no.saksrom.api.saksrom;

import no.saksrom.api.document.Document;
import no.saksrom.api.document.DocumentRepository;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import no.saksrom.api.document.IngestionJob;
import no.saksrom.api.document.IngestionJobRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SourceCoverageServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001111");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001201");

    @Test
    void coverageIsCaseScopedAndCountsPartialPages() {
        var documentRepository = mock(DocumentRepository.class);
        var ingestionJobRepository = mock(IngestionJobRepository.class);
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = new SourceCoverageService(documentRepository, ingestionJobRepository, sourceUnitRepository);
        String warning = "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 text_below_threshold=75 parsed_pages=72/78";
        Document document = document("masterdoc.pdf", 78);
        document.markPartialSourceReady(warning);
        IngestionJob job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        job.markCompletedWithWarnings(72, 78, warning);
        List<Integer> readyPages = IntStream.rangeClosed(6, 78)
                .filter(page -> page != 75)
                .boxed()
                .toList();

        when(documentRepository.findByTenantIdAndCaseIdAndStatusNotInOrderByCreatedAtDesc(
                eq(TENANT_ID),
                eq(CASE_ID),
                eq(List.of(Document.STATUS_ARCHIVED, Document.STATUS_DELETED))
        )).thenReturn(List.of(document));
        when(ingestionJobRepository.findFirstByTenantIdAndDocumentIdOrderByCreatedAtDesc(TENANT_ID, DOCUMENT_ID))
                .thenReturn(Optional.of(job));
        when(sourceUnitRepository.findDistinctPageNumbersByTenantIdAndDocumentId(TENANT_ID, DOCUMENT_ID))
                .thenReturn(readyPages);

        var coverage = service.coverage(TENANT_ID, CASE_ID);

        assertEquals(1, coverage.totalDocuments());
        assertEquals(0, coverage.sourceReadyDocuments());
        assertEquals(1, coverage.partialDocuments());
        assertEquals(78, coverage.totalPages());
        assertEquals(72, coverage.readyPages());
        assertEquals(0, coverage.ocrReadyPages());
        assertEquals(72, coverage.textReadyPages());
        assertEquals(5, coverage.missingOcrPages());
        assertEquals(1, coverage.belowThresholdPages());
        assertEquals(0, coverage.failedPages());
        assertEquals(92, coverage.coveragePercent());
        assertEquals("1-5", coverage.missingOcrPageRanges());
        assertEquals("75", coverage.belowThresholdPageRanges());
        assertEquals("1-5", coverage.documentCoverage().get(0).missingOcrPageRanges());
        assertEquals("75", coverage.documentCoverage().get(0).belowThresholdPageRanges());
        verify(documentRepository).findByTenantIdAndCaseIdAndStatusNotInOrderByCreatedAtDesc(
                TENANT_ID,
                CASE_ID,
                List.of(Document.STATUS_ARCHIVED, Document.STATUS_DELETED)
        );
    }

    private Document document(String filename, int pages) {
        return new Document(
                DOCUMENT_ID,
                TENANT_ID,
                CASE_ID,
                USER_ID,
                filename,
                filename,
                "application/pdf",
                1024L,
                pages,
                "hash",
                "tenant/case/" + filename,
                "LOCAL_QUARANTINE"
        );
    }
}
