package no.saksrom.api.document;

import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IngestionJobControllerTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001003");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001201");
    private static final UUID DOCUMENT_ID_2 = UUID.fromString("00000000-0000-0000-0000-000000001202");

    @Test
    void listJobsRejectsInvalidDocumentIdWithBadRequest() {
        var jobService = mock(IngestionJobService.class);
        var controller = controller(jobService);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.listJobs(TENANT_ID.toString(), null, null, DOCUMENT_ID + ",not-a-uuid")
        );

        assertEquals(400, error.getStatusCode().value());
        assertEquals("DOCUMENT_ID_INVALID", error.getReason());
        verifyNoInteractions(jobService);
    }

    @Test
    void listJobsRejectsMoreThanTwoHundredDocumentIdsWithBadRequest() {
        var jobService = mock(IngestionJobService.class);
        var controller = controller(jobService);
        String ids = IntStream.range(0, 201)
                .mapToObj(index -> UUID.nameUUIDFromBytes(("doc-" + index).getBytes()).toString())
                .reduce((left, right) -> left + "," + right)
                .orElseThrow();

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.listJobs(TENANT_ID.toString(), null, null, ids)
        );

        assertEquals(400, error.getStatusCode().value());
        assertTrue(error.getReason().contains("DOCUMENT_IDS_LIMIT_EXCEEDED"));
        verifyNoInteractions(jobService);
    }

    @Test
    void listJobsPassesDocumentIdsStatusAndCaseAsAndedFilters() {
        var jobService = mock(IngestionJobService.class);
        var controller = controller(jobService);
        var job = new IngestionJob(UUID.randomUUID(), TENANT_ID, CASE_ID, DOCUMENT_ID, "v1");
        when(jobService.listLatestJobsForDocuments(
                eq(TENANT_ID),
                eq(List.of(DOCUMENT_ID, DOCUMENT_ID_2)),
                eq(CASE_ID),
                eq(IngestionJob.STATUS_RUNNING)
        )).thenReturn(List.of(job));

        List<IngestionJobController.IngestionJobResponse> response = controller.listJobs(
                TENANT_ID.toString(),
                CASE_ID.toString(),
                "running",
                DOCUMENT_ID + "," + DOCUMENT_ID_2
        );

        assertEquals(1, response.size());
        assertEquals(job.getId(), response.getFirst().id());
        assertEquals(job.getDocumentId(), response.getFirst().documentId());
        verify(jobService).listLatestJobsForDocuments(
                TENANT_ID,
                List.of(DOCUMENT_ID, DOCUMENT_ID_2),
                CASE_ID,
                IngestionJob.STATUS_RUNNING
        );
    }

    @Test
    void listJobsRejectsTenantMismatchBeforeBatchLookup() {
        var jobService = mock(IngestionJobService.class);
        var controller = controller(jobService);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.listJobs("00000000-0000-0000-0000-000000009999", null, null, DOCUMENT_ID.toString())
        );

        assertEquals(403, error.getStatusCode().value());
        verifyNoInteractions(jobService);
    }

    @Test
    void retryRejectsCrossCaseJobs() {
        var jobService = mock(IngestionJobService.class);
        var controller = controller(jobService);
        UUID jobId = UUID.randomUUID();
        UUID caseA = UUID.randomUUID();
        UUID caseB = UUID.randomUUID();
        
        var job = new IngestionJob(jobId, TENANT_ID, caseA, DOCUMENT_ID, "v1");
        when(jobService.getJob(jobId, TENANT_ID)).thenReturn(job);
        
        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.retryJob(jobId, TENANT_ID.toString(), caseB.toString())
        );
        
        assertEquals(403, error.getStatusCode().value());
        assertTrue(error.getReason().contains("Job does not belong to the active case"));
        verify(jobService, never()).retry(any(), any());
    }

    private IngestionJobController controller(IngestionJobService jobService) {
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"))
        );
        return new IngestionJobController(currentUserService, jobService);
    }
}
