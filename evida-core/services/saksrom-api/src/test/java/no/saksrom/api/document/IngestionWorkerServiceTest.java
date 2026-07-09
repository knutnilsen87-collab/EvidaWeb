package no.saksrom.api.document;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IngestionWorkerServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001201");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001003");

    @Test
    void workerClaimsAtMostTwoPendingJobsPerTick() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, mock(DocumentStorageService.class), mock(DocumentParser.class));
        var jobs = List.of(job(), job(), job());
        when(jobRepository.findTop2ByStatusOrderByCreatedAtAsc(IngestionJob.STATUS_PENDING)).thenReturn(jobs);
        when(jobService.claim(any(UUID.class), anyString())).thenReturn(Optional.empty());

        int processed = worker.runOnce();

        assertEquals(0, processed);
        verify(jobService, times(2)).claim(any(UUID.class), anyString());
    }

    @Test
    void parserFailureMarksJobFailedAndDocumentIngestionFailedThroughService() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenThrow(new IllegalStateException("parser_not_configured"));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        verify(jobService).fail(job.getId(), TENANT_ID, "parser_not_configured");
        verify(jobService, never()).complete(any(UUID.class), any(UUID.class), anyInt());
    }

    @Test
    void workerPersistsEachPageDuringParseNotAfterParserReturns() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        List<Integer> persistedPages = new ArrayList<>();
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 3, "test-parser"));
        when(jobService.firstMissingPage(document, job, 3)).thenReturn(1);
        when(jobService.persistPageIfMissing(eq(document), eq(job), any(PageUnit.class))).thenAnswer(invocation -> {
            PageUnit page = invocation.getArgument(2);
            persistedPages.add(page.pageNumber());
            return true;
        });
        doAnswer(invocation -> {
            PageUnitSink sink = invocation.getArgument(3);
            for (int pageNumber = 1; pageNumber <= 3; pageNumber++) {
                if (pageNumber > 1) {
                    // Incremental-persistence proof: the previous page must already be persisted
                    // before the parser emits the next page.
                    assertTrue(
                            persistedPages.contains(pageNumber - 1),
                            "page " + (pageNumber - 1) + " must be persisted before page " + pageNumber + " is emitted"
                    );
                }
                sink.accept(new PageUnit(pageNumber, "side " + pageNumber, 0.9, List.of()));
            }
            return null;
        }).when(parser).parsePages(eq(document), eq(filePath), eq(1), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        assertEquals(List.of(1, 2, 3), persistedPages);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 0, 3);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 1, 3);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 2, 3);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 3, 3);
        verify(jobService).complete(job.getId(), TENANT_ID, 3);
        verify(parser, never()).parse(any(Document.class), any(Path.class));
        verify(jobService, never()).fail(any(UUID.class), any(UUID.class), anyString());
    }

    @Test
    void partialFailureAfterPageThreeKeepsPersistedPagesAndFailsJob() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        List<Integer> persistedPages = new ArrayList<>();
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 5, "test-parser"));
        when(jobService.firstMissingPage(document, job, 5)).thenReturn(1);
        when(jobService.persistPageIfMissing(eq(document), eq(job), any(PageUnit.class))).thenAnswer(invocation -> {
            PageUnit page = invocation.getArgument(2);
            persistedPages.add(page.pageNumber());
            return true;
        });
        doAnswer(invocation -> {
            PageUnitSink sink = invocation.getArgument(3);
            for (int pageNumber = 1; pageNumber <= 3; pageNumber++) {
                sink.accept(new PageUnit(pageNumber, "side " + pageNumber, 0.9, List.of()));
            }
            throw new DocumentParsingException("PAGE_TEXT_BELOW_THRESHOLD page=4");
        }).when(parser).parsePages(eq(document), eq(filePath), eq(1), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        assertEquals(List.of(1, 2, 3), persistedPages);
        verify(jobService).fail(job.getId(), TENANT_ID, "PAGE_TEXT_BELOW_THRESHOLD page=4");
        verify(jobService, never()).complete(any(UUID.class), any(UUID.class), anyInt());
    }

    @Test
    void mixedPdfOcrRuntimeMissingCompletesWithWarningsAfterPersistingTextPages() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        List<Integer> persistedPages = new ArrayList<>();
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 78, "test-parser"));
        when(jobService.firstMissingPage(document, job, 78)).thenReturn(1);
        when(jobService.persistPageIfMissing(eq(document), eq(job), any(PageUnit.class))).thenAnswer(invocation -> {
            PageUnit page = invocation.getArgument(2);
            persistedPages.add(page.pageNumber());
            return true;
        });
        doAnswer(invocation -> {
            PageUnitSink sink = invocation.getArgument(3);
            for (int pageNumber = 6; pageNumber <= 78; pageNumber++) {
                sink.accept(new PageUnit(pageNumber, "tekstlag side " + pageNumber, 0.9, List.of(), "TEXT"));
            }
            throw new PartialDocumentParsingException(
                    "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 parsed_pages=73/78",
                    73,
                    78,
                    List.of(1, 2, 3, 4, 5)
            );
        }).when(parser).parsePages(eq(document), eq(filePath), eq(1), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        assertEquals(73, persistedPages.size());
        assertEquals(6, persistedPages.getFirst());
        assertEquals(78, persistedPages.getLast());
        verify(jobService).completeWithWarnings(
                job.getId(),
                TENANT_ID,
                78,
                "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 parsed_pages=73/78"
        );
        verify(jobService, never()).complete(any(UUID.class), any(UUID.class), anyInt());
        verify(jobService, never()).fail(any(UUID.class), any(UUID.class), anyString());
    }

    @Test
    void imageOnlyPdfWithMissingOcrRuntimeFailsWhenNoTextPagesWerePersisted() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 2, "test-parser"));
        when(jobService.firstMissingPage(document, job, 2)).thenReturn(1);
        doThrow(new PartialDocumentParsingException(
                "PARTIAL_OCR_RUNTIME_MISSING pages=1-2 parsed_pages=0/2",
                0,
                2,
                List.of(1, 2)
        )).when(parser).parsePages(eq(document), eq(filePath), eq(1), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        verify(jobService, never()).persistPageIfMissing(any(Document.class), any(IngestionJob.class), any(PageUnit.class));
        verify(jobService).fail(job.getId(), TENANT_ID, "PARTIAL_OCR_RUNTIME_MISSING pages=1-2 parsed_pages=0/2");
        verify(jobService, never()).completeWithWarnings(any(UUID.class), any(UUID.class), anyInt(), anyString());
        verify(jobService, never()).complete(any(UUID.class), any(UUID.class), anyInt());
    }

    @Test
    void retryResumesFromFirstMissingPageWithoutReparsingPersistedPages() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        List<Integer> persistedPages = new ArrayList<>();
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 5, "test-parser"));
        when(jobService.firstMissingPage(document, job, 5)).thenReturn(4);
        when(jobService.persistPageIfMissing(eq(document), eq(job), any(PageUnit.class))).thenAnswer(invocation -> {
            PageUnit page = invocation.getArgument(2);
            persistedPages.add(page.pageNumber());
            return true;
        });
        doAnswer(invocation -> {
            int startPage = invocation.getArgument(2);
            assertEquals(4, startPage, "retry must start parsing at the first missing page");
            PageUnitSink sink = invocation.getArgument(3);
            for (int pageNumber = startPage; pageNumber <= 5; pageNumber++) {
                sink.accept(new PageUnit(pageNumber, "side " + pageNumber, 0.9, List.of()));
            }
            return null;
        }).when(parser).parsePages(eq(document), eq(filePath), eq(4), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        assertEquals(List.of(4, 5), persistedPages);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 3, 5);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 4, 5);
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 5, 5);
        verify(jobService).complete(job.getId(), TENANT_ID, 5);
        verify(jobService, never()).fail(any(UUID.class), any(UUID.class), anyString());
    }

    @Test
    void workerCompletesWithoutReparseWhenAllPagesAlreadyPersisted() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 5, "test-parser"));
        when(jobService.firstMissingPage(document, job, 5)).thenReturn(6);

        worker.processClaimedJob(job.getId(), TENANT_ID);

        verify(parser, never()).parsePages(any(Document.class), any(Path.class), anyInt(), any(PageUnitSink.class));
        verify(jobService).updateProgress(job.getId(), TENANT_ID, 5, 5);
        verify(jobService).complete(job.getId(), TENANT_ID, 5);
        verify(jobService, never()).fail(any(UUID.class), any(UUID.class), anyString());
    }

    @Test
    void emptyPageTextFromParserFailsClosedWithoutPersistingThatPage() {
        var jobRepository = mock(IngestionJobRepository.class);
        var jobService = mock(IngestionJobService.class);
        var storageService = mock(DocumentStorageService.class);
        var parser = mock(DocumentParser.class);
        var worker = new IngestionWorkerService(jobRepository, jobService, storageService, parser);
        var job = job();
        var document = document();
        Path filePath = Path.of("stored.pdf");
        when(jobService.getJob(job.getId(), TENANT_ID)).thenReturn(job);
        when(jobService.documentForJob(job)).thenReturn(document);
        when(storageService.resolveQuarantinePath(document.getStoragePath())).thenReturn(filePath);
        when(parser.inspect(document, filePath)).thenReturn(new ParsedDocumentMetadata(DOCUMENT_ID, 2, "test-parser"));
        when(jobService.firstMissingPage(document, job, 2)).thenReturn(1);
        doAnswer(invocation -> {
            PageUnitSink sink = invocation.getArgument(3);
            sink.accept(new PageUnit(1, "   ", 0.9, List.of()));
            return null;
        }).when(parser).parsePages(eq(document), eq(filePath), eq(1), any(PageUnitSink.class));

        worker.processClaimedJob(job.getId(), TENANT_ID);

        verify(jobService, never()).persistPageIfMissing(any(Document.class), any(IngestionJob.class), any(PageUnit.class));
        verify(jobService).fail(job.getId(), TENANT_ID, "PAGE_TEXT_EMPTY page=1");
        verify(jobService, never()).complete(any(UUID.class), any(UUID.class), anyInt());
    }

    private IngestionJob job() {
        return new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
    }

    private Document document() {
        return new Document(
                DOCUMENT_ID,
                TENANT_ID,
                CASE_ID,
                USER_ID,
                "case.pdf",
                "case.pdf",
                "application/pdf",
                4L,
                2,
                "hash",
                TENANT_ID + "/aa/hash",
                "QUARANTINE_LOCAL"
        );
    }
}
