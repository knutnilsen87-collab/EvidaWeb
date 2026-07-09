package no.saksrom.api.document;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class IngestionJobRecoveryServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001201");

    @Test
    void staleRunningJobIsResetToPendingWithoutTouchingAttemptCount() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = new IngestionJobRecoveryService(jobRepository, 900);
        var job = job();
        when(jobRepository.findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(eq(IngestionJob.STATUS_RUNNING), any(OffsetDateTime.class)))
                .thenReturn(List.of(job));
        when(jobRepository.resetStaleRunningJob(eq(job.getId()), any(OffsetDateTime.class))).thenReturn(1);

        int resets = service.recoverStaleRunningJobs();

        assertEquals(1, resets);
        // attempt_count semantics: the reaper never touches it (native reset leaves the column
        // alone); the next worker claim increments it via claimPendingJob.
        assertEquals(0, job.getAttemptCount());
        verify(jobRepository).resetStaleRunningJob(eq(job.getId()), any(OffsetDateTime.class));
        verify(jobRepository, never()).save(any(IngestionJob.class));
    }

    @Test
    void cutoffMatchesConfiguredStaleTimeout() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = new IngestionJobRecoveryService(jobRepository, 900);
        when(jobRepository.findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(eq(IngestionJob.STATUS_RUNNING), any(OffsetDateTime.class)))
                .thenReturn(List.of());

        service.recoverStaleRunningJobs();

        ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(jobRepository).findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(eq(IngestionJob.STATUS_RUNNING), cutoff.capture());
        OffsetDateTime expected = OffsetDateTime.now().minusSeconds(900);
        long driftSeconds = Math.abs(java.time.Duration.between(expected, cutoff.getValue()).getSeconds());
        assertTrue(driftSeconds <= 5, "stale cutoff must be now - configured timeout, drift was " + driftSeconds + "s");
    }

    @Test
    void freshHeartbeatWinningTheRaceMeansNoReset() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = new IngestionJobRecoveryService(jobRepository, 900);
        var job = job();
        when(jobRepository.findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(eq(IngestionJob.STATUS_RUNNING), any(OffsetDateTime.class)))
                .thenReturn(List.of(job));
        // Conditional UPDATE matches zero rows because the worker refreshed locked_at
        // between candidate lookup and reset.
        when(jobRepository.resetStaleRunningJob(eq(job.getId()), any(OffsetDateTime.class))).thenReturn(0);

        assertEquals(0, service.recoverStaleRunningJobs());
    }

    @Test
    void noStaleCandidatesMeansNoResetCalls() {
        var jobRepository = mock(IngestionJobRepository.class);
        var service = new IngestionJobRecoveryService(jobRepository, 900);
        when(jobRepository.findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(eq(IngestionJob.STATUS_RUNNING), any(OffsetDateTime.class)))
                .thenReturn(List.of());

        assertEquals(0, service.recoverStaleRunningJobs());
        verify(jobRepository, never()).resetStaleRunningJob(any(UUID.class), any(OffsetDateTime.class));
    }

    @Test
    void progressUpdateRefreshesHeartbeatUsedByStaleDetection() throws Exception {
        var job = job();
        assertNull(job.getLockedAt(), "new job has no heartbeat before claim/progress");

        job.updateProgress(1, 10);
        OffsetDateTime firstHeartbeat = job.getLockedAt();
        assertNotNull(firstHeartbeat, "progress update must set the heartbeat");
        assertTrue(firstHeartbeat.isAfter(OffsetDateTime.now().minusSeconds(5)));

        Thread.sleep(5);
        job.updateProgress(2, 10);
        assertTrue(job.getLockedAt().isAfter(firstHeartbeat), "each progress update must refresh the heartbeat");
    }

    private IngestionJob job() {
        return new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
    }
}
