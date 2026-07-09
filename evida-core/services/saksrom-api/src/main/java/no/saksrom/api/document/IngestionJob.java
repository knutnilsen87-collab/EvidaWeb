package no.saksrom.api.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "ingestion_jobs")
public class IngestionJob {
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_RUNNING = "RUNNING";
    public static final String STATUS_COMPLETED = "COMPLETED";
    public static final String STATUS_COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS";
    public static final String STATUS_FAILED = "FAILED";
    public static final String DEFAULT_PARSER_VERSION = "v1";

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "case_id", updatable = false)
    private UUID caseId;

    @Column(name = "document_id", nullable = false, updatable = false)
    private UUID documentId;

    @Column(nullable = false)
    private String status = STATUS_PENDING;

    @Column(name = "pages_processed", nullable = false)
    private Integer pagesProcessed = 0;

    @Column(name = "pages_total")
    private Integer pagesTotal;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Column(name = "locked_by")
    private String lockedBy;

    @Column(name = "locked_at")
    private OffsetDateTime lockedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "parser_version", nullable = false)
    private String parserVersion = DEFAULT_PARSER_VERSION;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected IngestionJob() {}

    public IngestionJob(UUID id, UUID tenantId, UUID caseId, UUID documentId, String parserVersion) {
        this.id = id;
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.documentId = documentId;
        this.parserVersion = parserVersion == null || parserVersion.isBlank() ? DEFAULT_PARSER_VERSION : parserVersion;
        this.status = STATUS_PENDING;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getCaseId() { return caseId; }
    public UUID getDocumentId() { return documentId; }
    public String getStatus() { return status; }
    public Integer getPagesProcessed() { return pagesProcessed; }
    public Integer getPagesTotal() { return pagesTotal; }
    public String getErrorMessage() { return errorMessage; }
    public Integer getAttemptCount() { return attemptCount; }
    public String getLockedBy() { return lockedBy; }
    public OffsetDateTime getLockedAt() { return lockedAt; }
    public OffsetDateTime getFinishedAt() { return finishedAt; }
    public String getParserVersion() { return parserVersion; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void markPendingForRetry() {
        if (!STATUS_FAILED.equals(status) && !STATUS_COMPLETED_WITH_WARNINGS.equals(status)) {
            throw new IllegalStateException("Only FAILED or COMPLETED_WITH_WARNINGS ingestion jobs can be retried");
        }
        this.status = STATUS_PENDING;
        this.errorMessage = null;
        this.lockedBy = null;
        this.lockedAt = null;
        this.finishedAt = null;
    }

    public void updateProgress(int pagesProcessed, int pagesTotal) {
        this.pagesProcessed = Math.max(0, pagesProcessed);
        this.pagesTotal = Math.max(0, pagesTotal);
        // Heartbeat: page progress proves the worker is alive, so stale-RUNNING recovery
        // must not reset this job while it keeps making progress.
        this.lockedAt = OffsetDateTime.now();
    }

    public void markCompleted(int pagesProcessed, int pagesTotal) {
        this.status = STATUS_COMPLETED;
        this.pagesProcessed = pagesProcessed;
        this.pagesTotal = pagesTotal;
        this.errorMessage = null;
        this.finishedAt = OffsetDateTime.now();
    }

    public void markCompletedWithWarnings(int pagesProcessed, int pagesTotal, String warningMessage) {
        this.status = STATUS_COMPLETED_WITH_WARNINGS;
        this.pagesProcessed = Math.max(0, pagesProcessed);
        this.pagesTotal = Math.max(0, pagesTotal);
        this.errorMessage = warningMessage == null || warningMessage.isBlank()
                ? "PARTIAL_SOURCE_READY"
                : warningMessage;
        this.finishedAt = OffsetDateTime.now();
    }

    public void markFailed(String errorMessage) {
        this.status = STATUS_FAILED;
        this.errorMessage = errorMessage == null || errorMessage.isBlank() ? "INGESTION_FAILED" : errorMessage;
        this.finishedAt = OffsetDateTime.now();
    }
}
