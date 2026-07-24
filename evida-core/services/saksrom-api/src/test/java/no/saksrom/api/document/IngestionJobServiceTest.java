package no.saksrom.api.document;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IngestionJobServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID OTHER_CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001102");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001201");
    private static final UUID DOCUMENT_ID_2 = UUID.fromString("00000000-0000-0000-0000-000000001202");
    private static final UUID DOCUMENT_ID_WITHOUT_JOB = UUID.fromString("00000000-0000-0000-0000-000000001203");
    private static final UUID FOREIGN_TENANT_DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000009999");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001003");

    @Test
    void approveCreatesPendingJobAndMarksDocumentPendingIngestion() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(jobRepository.findFirstByTenantIdAndDocumentIdAndStatusInOrderByCreatedAtDesc(eq(TENANT_ID), eq(DOCUMENT_ID), anyCollection()))
                .thenReturn(Optional.empty());
        when(documentRepository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRepository.save(any(IngestionJob.class))).thenAnswer(invocation -> invocation.getArgument(0));

        IngestionJob job = service.approve(DOCUMENT_ID, TENANT_ID);

        assertEquals(IngestionJob.STATUS_PENDING, job.getStatus());
        assertEquals(Document.STATUS_APPROVED_PENDING_INGESTION, document.getStatus());
        assertEquals(0, job.getAttemptCount());
        verify(jobRepository).save(any(IngestionJob.class));
    }

    @Test
    void approveAllowsPartialSourceReadyDocumentToBeReprocessed() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        document.markPartialSourceReady("PARTIAL_SOURCE_READY");
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(jobRepository.findFirstByTenantIdAndDocumentIdAndStatusInOrderByCreatedAtDesc(eq(TENANT_ID), eq(DOCUMENT_ID), anyCollection()))
                .thenReturn(Optional.empty());
        when(documentRepository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jobRepository.save(any(IngestionJob.class))).thenAnswer(invocation -> invocation.getArgument(0));

        IngestionJob job = service.approve(DOCUMENT_ID, TENANT_ID);

        assertEquals(IngestionJob.STATUS_PENDING, job.getStatus());
        assertEquals(Document.STATUS_APPROVED_PENDING_INGESTION, document.getStatus());
        assertNull(document.getIngestionError());
        verify(jobRepository).save(any(IngestionJob.class));
    }

    @Test
    void approveReturnsExistingActiveJobWithoutCreatingDuplicate() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        var existing = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(jobRepository.findFirstByTenantIdAndDocumentIdAndStatusInOrderByCreatedAtDesc(eq(TENANT_ID), eq(DOCUMENT_ID), anyCollection()))
                .thenReturn(Optional.of(existing));

        IngestionJob job = service.approve(DOCUMENT_ID, TENANT_ID);

        assertEquals(existing.getId(), job.getId());
        assertEquals(Document.STATUS_QUARANTINE, document.getStatus());
        verify(jobRepository, never()).save(any(IngestionJob.class));
    }

    @Test
    void retryFailedJobDoesNotIncrementAttemptCount() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        document.markIngestionFailed("parser_not_configured");
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        job.markFailed("parser_not_configured");
        when(jobRepository.findByIdAndTenantIdForUpdate(job.getId(), TENANT_ID)).thenReturn(Optional.of(job));
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(jobRepository.save(job)).thenReturn(job);

        IngestionJob retried = service.retry(job.getId(), TENANT_ID);

        assertEquals(IngestionJob.STATUS_PENDING, retried.getStatus());
        assertEquals(0, retried.getAttemptCount());
        assertEquals(Document.STATUS_APPROVED_PENDING_INGESTION, document.getStatus());
    }

    @Test
    void persistPageSkipsExistingDocumentPageParserVersion() {
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(mock(DocumentRepository.class), mock(IngestionJobRepository.class), sourceUnitRepository);
        var document = document();
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(sourceUnitRepository.existsByTenantIdAndDocumentIdAndPageNumberAndParserVersion(TENANT_ID, DOCUMENT_ID, 1, "v1"))
                .thenReturn(true);

        boolean persisted = service.persistPageIfMissing(document, job, new PageUnit(1, "side 1", 0.8, List.of()));

        assertFalse(persisted);
        verify(sourceUnitRepository, never()).save(any(DocumentSourceUnit.class));
    }

    @Test
    void firstMissingPageIsOneWhenNothingIsPersisted() {
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(mock(DocumentRepository.class), mock(IngestionJobRepository.class), sourceUnitRepository);
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(sourceUnitRepository.findPageNumbersByTenantIdAndDocumentIdAndParserVersion(TENANT_ID, DOCUMENT_ID, "v1"))
                .thenReturn(List.of());

        assertEquals(1, service.firstMissingPage(document(), job, 5));
    }

    @Test
    void firstMissingPageFindsGapAfterContiguousPrefix() {
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(mock(DocumentRepository.class), mock(IngestionJobRepository.class), sourceUnitRepository);
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(sourceUnitRepository.findPageNumbersByTenantIdAndDocumentIdAndParserVersion(TENANT_ID, DOCUMENT_ID, "v1"))
                .thenReturn(List.of(1, 2, 3, 5));

        assertEquals(4, service.firstMissingPage(document(), job, 5));
    }

    @Test
    void firstMissingPageIsTotalPlusOneWhenAllPagesPersisted() {
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(mock(DocumentRepository.class), mock(IngestionJobRepository.class), sourceUnitRepository);
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(sourceUnitRepository.findPageNumbersByTenantIdAndDocumentIdAndParserVersion(TENANT_ID, DOCUMENT_ID, "v1"))
                .thenReturn(List.of(1, 2, 3, 4, 5));

        assertEquals(6, service.firstMissingPage(document(), job, 5));
    }

    @Test
    void updateDocumentPageCountPersistsInspectedPageTotal() {
        var documentRepository = mock(DocumentRepository.class);
        var service = service(documentRepository, mock(IngestionJobRepository.class), mock(DocumentSourceUnitRepository.class));
        var document = document();
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(documentRepository.save(document)).thenReturn(document);

        service.updateDocumentPageCount(DOCUMENT_ID, TENANT_ID, 78);

        assertEquals(78, document.getPageCount());
        verify(documentRepository).save(document);
    }

    @Test
    void completeWithWarningsMarksDocumentPartialSourceReadyWithoutFullSourceReady() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(documentRepository, jobRepository, sourceUnitRepository);
        var document = document();
        document.markApprovedForIngestion();
        document.markIngesting();
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(jobRepository.findByIdAndTenantIdForUpdate(job.getId(), TENANT_ID)).thenReturn(Optional.of(job));
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(sourceUnitRepository.countByTenantIdAndDocumentIdAndParserVersion(TENANT_ID, DOCUMENT_ID, "v1")).thenReturn(73L);
        when(jobRepository.save(job)).thenReturn(job);

        IngestionJob saved = service.completeWithWarnings(
                job.getId(),
                TENANT_ID,
                78,
                "PARTIAL_OCR_RUNTIME_MISSING pages=1-5 parsed_pages=73/78"
        );

        assertEquals(IngestionJob.STATUS_COMPLETED_WITH_WARNINGS, saved.getStatus());
        assertEquals(73, saved.getPagesProcessed());
        assertEquals(78, saved.getPagesTotal());
        assertEquals(Document.STATUS_PARTIAL_SOURCE_READY, document.getStatus());
        assertEquals("PARTIAL_OCR_RUNTIME_MISSING pages=1-5 parsed_pages=73/78", document.getIngestionError());
        verify(documentRepository).save(document);
    }

    @Test
    void completeWithWarningsFailsWhenNoRealPageUnitsExist() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        var service = service(documentRepository, jobRepository, sourceUnitRepository);
        var document = document();
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(jobRepository.findByIdAndTenantIdForUpdate(job.getId(), TENANT_ID)).thenReturn(Optional.of(job));
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));
        when(sourceUnitRepository.countByTenantIdAndDocumentIdAndParserVersion(TENANT_ID, DOCUMENT_ID, "v1")).thenReturn(0L);

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.completeWithWarnings(job.getId(), TENANT_ID, 78, "PARTIAL_OCR_RUNTIME_MISSING pages=1-78")
        );

        assertTrue(error.getMessage().contains("PARTIAL_SOURCE_READY_REQUIRES_SOURCE_UNITS"));
        verify(documentRepository, never()).save(any(Document.class));
        verify(jobRepository, never()).save(any(IngestionJob.class));
    }

    @Test
    void claimOnlySucceedsForPendingJobOnceAndMarksDocumentIngesting() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        document.markApprovedForIngestion();
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(jobRepository.claimPendingJob(job.getId(), "worker-1")).thenReturn(1).thenReturn(0);
        when(jobRepository.findById(job.getId())).thenReturn(Optional.of(job));
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));

        assertTrue(service.claim(job.getId(), "worker-1").isPresent());
        assertTrue(service.claim(job.getId(), "worker-1").isEmpty());
        assertEquals(Document.STATUS_INGESTING, document.getStatus());
        verify(jobRepository, times(2)).claimPendingJob(job.getId(), "worker-1");
    }

    @Test
    void approveRejectsNonQuarantineDocumentWithoutCreatingJob() {
        var documentRepository = mock(DocumentRepository.class);
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(documentRepository, jobRepository, mock(DocumentSourceUnitRepository.class));
        var document = document();
        document.markDeleted();
        when(documentRepository.findByIdAndTenantIdForUpdate(DOCUMENT_ID, TENANT_ID)).thenReturn(Optional.of(document));

        assertThrows(ResponseStatusException.class, () -> service.approve(DOCUMENT_ID, TENANT_ID));
        verify(jobRepository, never()).save(any(IngestionJob.class));
    }

    @Test
    void batchLookupReturnsLatestJobsForTenantAndSilentlyOmitsMissingAndForeignDocuments() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(mock(DocumentRepository.class), jobRepository, mock(DocumentSourceUnitRepository.class));
        var activeJob = job(DOCUMENT_ID, CASE_ID);
        var completedJob = job(DOCUMENT_ID_2, CASE_ID);
        when(jobRepository.findBatchLatestCandidates(
                eq(TENANT_ID),
                eq(new java.util.LinkedHashSet<>(List.of(DOCUMENT_ID, DOCUMENT_ID_2, DOCUMENT_ID_WITHOUT_JOB, FOREIGN_TENANT_DOCUMENT_ID))),
                isNull(),
                isNull()
        )).thenReturn(List.of(activeJob, completedJob));

        List<IngestionJob> jobs = service.listLatestJobsForDocuments(
                TENANT_ID,
                List.of(DOCUMENT_ID, DOCUMENT_ID_2, DOCUMENT_ID_WITHOUT_JOB, FOREIGN_TENANT_DOCUMENT_ID),
                null,
                null
        );

        assertEquals(List.of(activeJob.getId(), completedJob.getId()), jobs.stream().map(IngestionJob::getId).toList());
        verify(jobRepository).findBatchLatestCandidates(any(), anyCollection(), isNull(), isNull());
    }

    @Test
    void batchLookupReturnsOnlyNewestCandidatePerDocumentInRepositoryOrder() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(mock(DocumentRepository.class), jobRepository, mock(DocumentSourceUnitRepository.class));
        var newest = job(DOCUMENT_ID, CASE_ID);
        var older = job(DOCUMENT_ID, CASE_ID);
        when(jobRepository.findBatchLatestCandidates(eq(TENANT_ID), anyCollection(), isNull(), isNull()))
                .thenReturn(List.of(newest, older));

        List<IngestionJob> jobs = service.listLatestJobsForDocuments(TENANT_ID, List.of(DOCUMENT_ID), null, null);

        assertEquals(1, jobs.size());
        assertEquals(newest.getId(), jobs.getFirst().getId());
    }

    @Test
    void batchLookupAndsDocumentIdsWithStatus() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(mock(DocumentRepository.class), jobRepository, mock(DocumentSourceUnitRepository.class));

        service.listLatestJobsForDocuments(TENANT_ID, List.of(DOCUMENT_ID, DOCUMENT_ID_2), null, IngestionJob.STATUS_RUNNING);

        verify(jobRepository).findBatchLatestCandidates(
                eq(TENANT_ID),
                eq(new java.util.LinkedHashSet<>(List.of(DOCUMENT_ID, DOCUMENT_ID_2))),
                isNull(),
                eq(IngestionJob.STATUS_RUNNING)
        );
    }

    @Test
    void batchLookupAndsDocumentIdsWithCaseId() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = service(mock(DocumentRepository.class), jobRepository, mock(DocumentSourceUnitRepository.class));

        service.listLatestJobsForDocuments(TENANT_ID, List.of(DOCUMENT_ID, DOCUMENT_ID_2), CASE_ID, null);

        verify(jobRepository).findBatchLatestCandidates(
                eq(TENANT_ID),
                eq(new java.util.LinkedHashSet<>(List.of(DOCUMENT_ID, DOCUMENT_ID_2))),
                eq(CASE_ID),
                isNull()
        );
    }

    @Test
    void batchLookupRejectsMoreThanTwoHundredDocumentIds() {
        var service = service(mock(DocumentRepository.class), mock(IngestionJobRepository.class), mock(DocumentSourceUnitRepository.class));
        List<UUID> documentIds = java.util.stream.IntStream.range(0, 201)
                .mapToObj(index -> UUID.nameUUIDFromBytes(("doc-" + index).getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .toList();

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.listLatestJobsForDocuments(TENANT_ID, documentIds, null, null)
        );

        assertEquals(400, error.getStatusCode().value());
        assertTrue(error.getReason().contains("DOCUMENT_IDS_LIMIT_EXCEEDED"));
    }

    private IngestionJobService service(
            DocumentRepository documentRepository,
            IngestionJobRepository jobRepository,
            DocumentSourceUnitRepository sourceUnitRepository
    ) {
        return new IngestionJobService(documentRepository, jobRepository, sourceUnitRepository, null);
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
                1,
                "hash",
                TENANT_ID + "/aa/hash",
                "QUARANTINE_LOCAL"
        );
    }

    private IngestionJob job(UUID documentId, UUID caseId) {
        return new IngestionJob(UUID.randomUUID(), TENANT_ID, caseId, documentId, "v1");
    }
}
