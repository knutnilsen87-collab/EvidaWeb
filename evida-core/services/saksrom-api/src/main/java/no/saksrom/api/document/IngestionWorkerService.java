package no.saksrom.api.document;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class IngestionWorkerService {
    private static final Logger log = LoggerFactory.getLogger(IngestionWorkerService.class);
    private static final int MAX_JOBS_PER_TICK = 2;

    private final IngestionJobRepository jobRepository;
    private final IngestionJobService jobService;
    private final DocumentStorageService storageService;
    private final DocumentParser documentParser;
    private final String workerId;

    public IngestionWorkerService(
            IngestionJobRepository jobRepository,
            IngestionJobService jobService,
            DocumentStorageService storageService,
            DocumentParser documentParser
    ) {
        this.jobRepository = jobRepository;
        this.jobService = jobService;
        this.storageService = storageService;
        this.documentParser = documentParser;
        this.workerId = "worker-" + UUID.randomUUID();
    }

    @Scheduled(fixedDelayString = "${evida.ingestion.worker-fixed-delay-ms:5000}")
    public void runScheduledTick() {
        runOnce();
    }

    public int runOnce() {
        List<IngestionJob> pendingJobs = jobRepository.findTop2ByStatusOrderByCreatedAtAsc(IngestionJob.STATUS_PENDING);
        int processed = 0;
        for (IngestionJob pendingJob : pendingJobs.stream().limit(MAX_JOBS_PER_TICK).toList()) {
            if (jobService.claim(pendingJob.getId(), workerId).isPresent()) {
                processClaimedJob(pendingJob.getId(), pendingJob.getTenantId());
                processed++;
            }
        }
        return processed;
    }

    void processClaimedJob(UUID jobId, UUID tenantId) {
        IngestionJob job = jobService.getJob(jobId, tenantId);
        try {
            Document document = jobService.documentForJob(job);
            Path filePath = storageService.resolveQuarantinePath(document.getStoragePath());

            ParsedDocumentMetadata metadata = documentParser.inspect(document, filePath);
            int pagesTotal = metadata.pageCount();
            jobService.updateDocumentPageCount(document.getId(), document.getTenantId(), pagesTotal);
            int firstMissingPage = jobService.firstMissingPage(document, job, pagesTotal);
            jobService.updateProgress(job.getId(), job.getTenantId(), firstMissingPage - 1, pagesTotal);

            PartialDocumentParsingException partialWarning = null;
            if (firstMissingPage <= pagesTotal) {
                AtomicInteger pagesAccounted = new AtomicInteger(firstMissingPage - 1);
                try {
                    documentParser.parsePages(document, filePath, firstMissingPage, page -> {
                        if (page.text() == null || page.text().isBlank()) {
                            throw new IllegalStateException("PAGE_TEXT_EMPTY page=" + page.pageNumber());
                        }
                        jobService.persistPageIfMissing(document, job, page);
                        jobService.updateProgress(job.getId(), job.getTenantId(), pagesAccounted.incrementAndGet(), pagesTotal);
                    });
                } catch (PartialDocumentParsingException e) {
                    if (e.pagesParsed() < 1) {
                        throw e;
                    }
                    partialWarning = e;
                }
            }
            if (partialWarning != null) {
                jobService.completeWithWarnings(job.getId(), job.getTenantId(), pagesTotal, partialWarning.getMessage());
                return;
            }
            jobService.complete(job.getId(), job.getTenantId(), pagesTotal);
        } catch (RuntimeException e) {
            log.error("Ingestion job {} failed closed", jobId, e);
            jobService.fail(jobId, tenantId, e.getMessage());
        }
    }
}
