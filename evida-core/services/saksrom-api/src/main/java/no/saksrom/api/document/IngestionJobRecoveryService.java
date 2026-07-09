package no.saksrom.api.document;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Narrow stale-RUNNING recovery for ingestion jobs (DEFECT-P5-2 from the Prompt 5 stress gate).
 *
 * A hard backend crash mid-ingestion previously left the job RUNNING forever: the worker only
 * claims PENDING jobs and the retry endpoint accepts failed or warning-completed jobs. This service resets
 * RUNNING jobs whose heartbeat (locked_at, refreshed by every page-progress update) is older
 * than the configured timeout back to PENDING, so the normal worker claim + first-missing-page
 * resume path takes over. attempt_count is not touched here; the next worker claim increments it.
 */
@Service
public class IngestionJobRecoveryService {
    private static final Logger log = LoggerFactory.getLogger(IngestionJobRecoveryService.class);

    private final IngestionJobRepository jobRepository;
    private final long staleTimeoutSeconds;

    public IngestionJobRecoveryService(
            IngestionJobRepository jobRepository,
            @Value("${evida.ingestion.stale-running-timeout-seconds:900}") long staleTimeoutSeconds
    ) {
        this.jobRepository = jobRepository;
        this.staleTimeoutSeconds = Math.max(1, staleTimeoutSeconds);
    }

    // @Transactional must sit on the proxy entry point the scheduler invokes: calling
    // recoverStaleRunningJobs() internally is self-invocation and would bypass the
    // transaction proxy, making the @Modifying reset query fail.
    @Scheduled(fixedDelayString = "${evida.ingestion.stale-recovery-fixed-delay-ms:60000}")
    @Transactional
    public void runScheduledTick() {
        recoverStaleRunningJobs();
    }

    @Transactional
    public int recoverStaleRunningJobs() {
        OffsetDateTime staleBefore = OffsetDateTime.now().minusSeconds(staleTimeoutSeconds);
        List<IngestionJob> staleCandidates = jobRepository.findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(
                IngestionJob.STATUS_RUNNING,
                staleBefore
        );

        int resets = 0;
        for (IngestionJob job : staleCandidates) {
            // Conditional reset: a worker that refreshed the heartbeat after the candidate
            // lookup wins, and the update matches zero rows.
            int updated = jobRepository.resetStaleRunningJob(job.getId(), staleBefore);
            if (updated == 1) {
                resets++;
                log.warn(
                        "stale_running_ingestion_job_reset jobId={} tenantId={} documentId={} pagesProcessed={} pagesTotal={} attemptCount={} lockedBy={} lockedAt={}",
                        job.getId(),
                        job.getTenantId(),
                        job.getDocumentId(),
                        job.getPagesProcessed(),
                        job.getPagesTotal(),
                        job.getAttemptCount(),
                        job.getLockedBy(),
                        job.getLockedAt()
                );
            }
        }
        return resets;
    }
}
