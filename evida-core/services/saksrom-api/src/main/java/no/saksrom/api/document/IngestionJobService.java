package no.saksrom.api.document;

import no.saksrom.api.audit.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class IngestionJobService {
    public static final int MAX_BATCH_DOCUMENT_IDS = 200;
    static final List<String> ACTIVE_STATUSES = List.of(IngestionJob.STATUS_PENDING, IngestionJob.STATUS_RUNNING);

    private final DocumentRepository documentRepository;
    private final IngestionJobRepository jobRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final AuditService auditService;

    public IngestionJobService(
            DocumentRepository documentRepository,
            IngestionJobRepository jobRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            AuditService auditService
    ) {
        this.documentRepository = documentRepository;
        this.jobRepository = jobRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.auditService = auditService;
    }

    @Transactional
    public IngestionJob approve(UUID documentId, UUID tenantId) {
        Document document = documentRepository.findByIdAndTenantIdForUpdate(documentId, tenantId)
                .filter(d -> !Document.STATUS_DELETED.equals(d.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet."));

        Optional<IngestionJob> activeJob = jobRepository.findFirstByTenantIdAndDocumentIdAndStatusInOrderByCreatedAtDesc(
                tenantId,
                documentId,
                ACTIVE_STATUSES
        );
        if (activeJob.isPresent()) {
            return activeJob.get();
        }

        if (Document.STATUS_QUARANTINE.equals(document.getStatus())) {
            document.markApprovedForIngestion();
        } else if (Document.STATUS_INGESTION_FAILED.equals(document.getStatus())
                || Document.STATUS_PARTIAL_SOURCE_READY.equals(document.getStatus())) {
            document.markApprovedPendingIngestionFromFailure();
        } else if (!Document.STATUS_APPROVED_PENDING_INGESTION.equals(document.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "DOCUMENT_NOT_APPROVABLE_FOR_INGESTION");
        }

        documentRepository.save(document);
        IngestionJob job = jobRepository.save(new IngestionJob(
                UUID.randomUUID(),
                document.getTenantId(),
                document.getCaseId(),
                document.getId(),
                IngestionJob.DEFAULT_PARSER_VERSION
        ));
        audit("DOCUMENT_APPROVED_PENDING_INGESTION", document, "{\"jobId\":\"" + job.getId() + "\"}");
        return job;
    }

    @Transactional(readOnly = true)
    public IngestionJob getJob(UUID jobId, UUID tenantId) {
        return jobRepository.findByIdAndTenantId(jobId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingestion-jobb ikke funnet."));
    }

    @Transactional(readOnly = true)
    public List<IngestionJob> listJobs(UUID tenantId, UUID caseId, String status) {
        if (caseId != null && status != null && !status.isBlank()) {
            return jobRepository.findByTenantIdAndCaseIdAndStatusOrderByCreatedAtDesc(tenantId, caseId, status);
        }
        if (caseId != null) {
            return jobRepository.findByTenantIdAndCaseIdOrderByCreatedAtDesc(tenantId, caseId);
        }
        if (status != null && !status.isBlank()) {
            return jobRepository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId, status);
        }
        return jobRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    @Transactional(readOnly = true)
    public List<IngestionJob> listLatestJobsForDocuments(
            UUID tenantId,
            List<UUID> documentIds,
            UUID caseId,
            String status
    ) {
        if (documentIds == null || documentIds.isEmpty()) {
            return List.of();
        }
        if (documentIds.size() > MAX_BATCH_DOCUMENT_IDS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "DOCUMENT_IDS_LIMIT_EXCEEDED max=" + MAX_BATCH_DOCUMENT_IDS);
        }

        Set<UUID> uniqueDocumentIds = new java.util.LinkedHashSet<>(documentIds);
        List<IngestionJob> candidates = jobRepository.findBatchLatestCandidates(
                tenantId,
                uniqueDocumentIds,
                caseId,
                status
        );

        Map<UUID, IngestionJob> latestByDocument = new LinkedHashMap<>();
        for (IngestionJob candidate : candidates) {
            latestByDocument.putIfAbsent(candidate.getDocumentId(), candidate);
        }
        return List.copyOf(latestByDocument.values());
    }

    @Transactional
    public IngestionJob retry(UUID jobId, UUID tenantId) {
        IngestionJob job = jobRepository.findByIdAndTenantIdForUpdate(jobId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingestion-jobb ikke funnet."));
        if (!IngestionJob.STATUS_FAILED.equals(job.getStatus())
                && !IngestionJob.STATUS_COMPLETED_WITH_WARNINGS.equals(job.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ONLY_FAILED_OR_WARNING_JOBS_CAN_BE_RETRIED");
        }

        Document document = documentRepository.findByIdAndTenantIdForUpdate(job.getDocumentId(), tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet."));
        document.markApprovedPendingIngestionFromFailure();
        job.markPendingForRetry();
        documentRepository.save(document);
        IngestionJob saved = jobRepository.save(job);
        audit("DOCUMENT_INGEST_RETRY_QUEUED", document, "{\"jobId\":\"" + saved.getId() + "\"}");
        return saved;
    }

    @Transactional
    public Optional<IngestionJob> claim(UUID jobId, String workerId) {
        int updated = jobRepository.claimPendingJob(jobId, workerId);
        if (updated != 1) {
            return Optional.empty();
        }
        IngestionJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new IllegalStateException("Claimed ingestion job disappeared"));
        Document document = documentRepository.findByIdAndTenantIdForUpdate(job.getDocumentId(), job.getTenantId())
                .orElseThrow(() -> new IllegalStateException("Claimed ingestion document disappeared"));
        if (!Document.STATUS_INGESTING.equals(document.getStatus())) {
            document.markIngesting();
            documentRepository.save(document);
        }
        audit("DOCUMENT_INGEST_STARTED", document, "{\"jobId\":\"" + job.getId() + "\",\"workerId\":\"" + escape(workerId) + "\"}");
        return Optional.of(job);
    }

    @Transactional(readOnly = true)
    public Document documentForJob(IngestionJob job) {
        return documentRepository.findByIdAndTenantId(job.getDocumentId(), job.getTenantId())
                .orElseThrow(() -> new IllegalStateException("Document missing for ingestion job " + job.getId()));
    }

    @Transactional
    public void updateDocumentPageCount(UUID documentId, UUID tenantId, int pageCount) {
        Document document = documentRepository.findByIdAndTenantIdForUpdate(documentId, tenantId)
                .orElseThrow(() -> new IllegalStateException("Document missing for page count update " + documentId));
        document.updatePageCount(pageCount);
        documentRepository.save(document);
    }

    /**
     * Returns the first page number (1-based) that has no persisted PageUnit for this document and
     * parser version. Returns {@code pagesTotal + 1} when every page is already persisted, so a
     * restarted job can complete without re-parsing.
     */
    @Transactional(readOnly = true)
    public int firstMissingPage(Document document, IngestionJob job, int pagesTotal) {
        List<Integer> persistedPages = sourceUnitRepository.findPageNumbersByTenantIdAndDocumentIdAndParserVersion(
                document.getTenantId(),
                document.getId(),
                job.getParserVersion()
        );
        int expected = 1;
        for (Integer pageNumber : persistedPages) {
            if (pageNumber == null) {
                continue;
            }
            if (pageNumber == expected) {
                expected++;
            } else if (pageNumber > expected) {
                break;
            }
        }
        return Math.min(expected, pagesTotal + 1);
    }

    @Transactional
    public boolean persistPageIfMissing(Document document, IngestionJob job, PageUnit page) {
        boolean exists = sourceUnitRepository.existsByTenantIdAndDocumentIdAndPageNumberAndParserVersion(
                document.getTenantId(),
                document.getId(),
                page.pageNumber(),
                job.getParserVersion()
        );
        if (exists) {
            return false;
        }

        sourceUnitRepository.save(new DocumentSourceUnit(
                UUID.randomUUID(),
                document.getTenantId(),
                document.getCaseId(),
                document.getId(),
                new LargeDocumentIngestionService().sourceUnitId(document.getId(), page.pageNumber()),
                page.pageNumber(),
                job.getParserVersion(),
                page.extractionMethod(),
                page.text() == null ? "" : page.text(),
                0,
                page.text() == null ? 0 : page.text().length(),
                null,
                page.confidence()
        ));
        return true;
    }

    @Transactional
    public void updateProgress(UUID jobId, UUID tenantId, int pagesProcessed, int pagesTotal) {
        IngestionJob job = getJobForUpdate(jobId, tenantId);
        job.updateProgress(pagesProcessed, pagesTotal);
        jobRepository.save(job);
    }

    @Transactional
    public IngestionJob complete(UUID jobId, UUID tenantId, int pagesTotal) {
        IngestionJob job = getJobForUpdate(jobId, tenantId);
        Document document = documentRepository.findByIdAndTenantIdForUpdate(job.getDocumentId(), tenantId)
                .orElseThrow(() -> new IllegalStateException("Document missing for ingestion job " + job.getId()));
        long storedPages = sourceUnitRepository.countByTenantIdAndDocumentIdAndParserVersion(
                tenantId,
                document.getId(),
                job.getParserVersion()
        );
        if (storedPages != pagesTotal) {
            throw new IllegalStateException("PAGE_UNIT_COUNT_MISMATCH expected=" + pagesTotal + " actual=" + storedPages);
        }
        job.markCompleted(pagesTotal, pagesTotal);
        document.markSourceReady();
        documentRepository.save(document);
        IngestionJob saved = jobRepository.save(job);
        audit("DOCUMENT_INGEST_SUCCEEDED", document, "{\"jobId\":\"" + job.getId() + "\",\"sourceUnitCount\":" + storedPages + "}");
        return saved;
    }

    @Transactional
    public IngestionJob completeWithWarnings(UUID jobId, UUID tenantId, int pagesTotal, String warningMessage) {
        IngestionJob job = getJobForUpdate(jobId, tenantId);
        Document document = documentRepository.findByIdAndTenantIdForUpdate(job.getDocumentId(), tenantId)
                .orElseThrow(() -> new IllegalStateException("Document missing for ingestion job " + job.getId()));
        long storedPages = sourceUnitRepository.countByTenantIdAndDocumentIdAndParserVersion(
                tenantId,
                document.getId(),
                job.getParserVersion()
        );
        if (storedPages < 1) {
            throw new IllegalStateException("PARTIAL_SOURCE_READY_REQUIRES_SOURCE_UNITS");
        }
        if (storedPages >= pagesTotal) {
            throw new IllegalStateException("PARTIAL_SOURCE_READY_REQUIRES_MISSING_PAGES expectedLessThan=" + pagesTotal + " actual=" + storedPages);
        }
        String normalizedWarning = warningMessage == null || warningMessage.isBlank()
                ? "PARTIAL_SOURCE_READY"
                : warningMessage;
        job.markCompletedWithWarnings((int) storedPages, pagesTotal, normalizedWarning);
        document.markPartialSourceReady(normalizedWarning);
        documentRepository.save(document);
        IngestionJob saved = jobRepository.save(job);
        audit(
                "DOCUMENT_INGEST_COMPLETED_WITH_WARNINGS",
                document,
                "{\"jobId\":\"" + job.getId() + "\",\"sourceUnitCount\":" + storedPages + ",\"warning\":\"" + escape(normalizedWarning) + "\"}"
        );
        return saved;
    }

    @Transactional
    public IngestionJob fail(UUID jobId, UUID tenantId, String errorMessage) {
        IngestionJob job = getJobForUpdate(jobId, tenantId);
        Document document = documentRepository.findByIdAndTenantIdForUpdate(job.getDocumentId(), tenantId)
                .orElseThrow(() -> new IllegalStateException("Document missing for ingestion job " + job.getId()));
        String normalizedError = errorMessage == null || errorMessage.isBlank() ? "INGESTION_FAILED" : errorMessage;
        job.markFailed(normalizedError);
        document.markIngestionFailed(normalizedError);
        documentRepository.save(document);
        IngestionJob saved = jobRepository.save(job);
        audit("DOCUMENT_INGEST_FAILED", document, "{\"jobId\":\"" + job.getId() + "\",\"error\":\"" + escape(normalizedError) + "\"}");
        return saved;
    }

    private IngestionJob getJobForUpdate(UUID jobId, UUID tenantId) {
        return jobRepository.findByIdAndTenantIdForUpdate(jobId, tenantId)
                .orElseThrow(() -> new IllegalStateException("Ingestion job missing " + jobId));
    }

    private void audit(String eventType, Document document, String payloadJson) {
        if (auditService == null) {
            return;
        }
        auditService.record(
                document.getTenantId(),
                document.getCaseId(),
                null,
                eventType,
                "DOCUMENT",
                document.getId(),
                payloadJson
        );
    }

    private String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
