package no.saksrom.api.document;

import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class IngestionJobController {
    private final CurrentUserService currentUserService;
    private final IngestionJobService jobService;

    public IngestionJobController(CurrentUserService currentUserService, IngestionJobService jobService) {
        this.currentUserService = currentUserService;
        this.jobService = jobService;
    }

    @PostMapping("/documents/{documentId}/approve")
    public ResponseEntity<IngestionJobResponse> approveDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader);
        IngestionJob job = jobService.approve(documentId, tenantId);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(IngestionJobResponse.from(job));
    }

    @GetMapping("/ingestion-jobs/{jobId}")
    public IngestionJobResponse getJob(
            @PathVariable UUID jobId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader);
        return IngestionJobResponse.from(jobService.getJob(jobId, tenantId));
    }

    @GetMapping("/ingestion-jobs")
    public List<IngestionJobResponse> listJobs(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "documentIds", required = false) String documentIds
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader);
        UUID parsedCaseId = caseId == null || caseId.isBlank() ? null : parseUuid(caseId, "CASE_ID_INVALID");
        String normalizedStatus = normalizeStatus(status);
        List<IngestionJob> jobs = documentIds == null || documentIds.isBlank()
                ? jobService.listJobs(tenantId, parsedCaseId, normalizedStatus)
                : jobService.listLatestJobsForDocuments(tenantId, parseDocumentIds(documentIds), parsedCaseId, normalizedStatus);
        return jobs.stream()
                .map(IngestionJobResponse::from)
                .toList();
    }

    @PostMapping("/ingestion-jobs/{jobId}/retry")
    public ResponseEntity<IngestionJobResponse> retryJob(
            @PathVariable UUID jobId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader);
        UUID requestedCase = (caseId != null && !caseId.isEmpty()) ? UUID.fromString(caseId) : null;
        
        IngestionJob job = jobService.getJob(jobId, tenantId);
        if (requestedCase != null && !requestedCase.equals(job.getCaseId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Job does not belong to the active case.");
        }
        
        return ResponseEntity.accepted().body(IngestionJobResponse.from(jobService.retry(jobId, tenantId)));
    }

    private UUID requireMatchingTenant(String tenantHeader) {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        return requestedTenant;
    }

    private UUID parseUuid(String value, String errorCode) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode, e);
        }
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.toUpperCase();
        if (!List.of(
                IngestionJob.STATUS_PENDING,
                IngestionJob.STATUS_RUNNING,
                IngestionJob.STATUS_COMPLETED,
                IngestionJob.STATUS_COMPLETED_WITH_WARNINGS,
                IngestionJob.STATUS_FAILED
        ).contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INGESTION_JOB_STATUS_INVALID");
        }
        return normalized;
    }

    private List<UUID> parseDocumentIds(String documentIds) {
        String[] rawIds = documentIds.split(",");
        if (rawIds.length > IngestionJobService.MAX_BATCH_DOCUMENT_IDS) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "DOCUMENT_IDS_LIMIT_EXCEEDED max=" + IngestionJobService.MAX_BATCH_DOCUMENT_IDS
            );
        }

        List<UUID> parsed = new ArrayList<>();
        for (String rawId : rawIds) {
            String trimmed = rawId.trim();
            if (trimmed.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "DOCUMENT_ID_INVALID");
            }
            parsed.add(parseUuid(trimmed, "DOCUMENT_ID_INVALID"));
        }
        return parsed;
    }

    public record IngestionJobResponse(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID documentId,
            String status,
            int pagesProcessed,
            Integer pagesTotal,
            String errorMessage,
            int attemptCount,
            String lockedBy,
            OffsetDateTime lockedAt,
            OffsetDateTime finishedAt,
            String parserVersion,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        static IngestionJobResponse from(IngestionJob job) {
            return new IngestionJobResponse(
                    job.getId(),
                    job.getTenantId(),
                    job.getCaseId(),
                    job.getDocumentId(),
                    job.getStatus(),
                    job.getPagesProcessed() == null ? 0 : job.getPagesProcessed(),
                    job.getPagesTotal(),
                    job.getErrorMessage(),
                    job.getAttemptCount() == null ? 0 : job.getAttemptCount(),
                    job.getLockedBy(),
                    job.getLockedAt(),
                    job.getFinishedAt(),
                    job.getParserVersion(),
                    job.getCreatedAt(),
                    job.getUpdatedAt()
            );
        }
    }
}
