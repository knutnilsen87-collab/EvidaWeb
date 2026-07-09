package no.saksrom.api.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "documents")
@FilterDef(name = "documentTenantFilter", parameters = @ParamDef(name = "tenantId", type = UUID.class))
@Filter(name = "documentTenantFilter", condition = "tenant_id = :tenantId")
public class Document {
    public static final String STATUS_QUARANTINE = "QUARANTINE";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_APPROVED_PENDING_INGESTION = "APPROVED_PENDING_INGESTION";
    public static final String STATUS_INGESTING = "INGESTING";
    public static final String STATUS_INGESTION_FAILED = "INGESTION_FAILED";
    public static final String STATUS_PARTIAL_SOURCE_READY = "PARTIAL_SOURCE_READY";
    public static final String STATUS_SOURCE_READY = "SOURCE_READY";
    public static final String STATUS_VERIFIED = "VERIFIED";
    public static final String STATUS_ARCHIVED = "ARCHIVED";
    public static final String STATUS_DELETED = "DELETED";

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "case_id", updatable = false)
    private UUID caseId;

    @Column(nullable = false)
    private String filename;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "mime_type", nullable = false)
    private String mimeType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "page_count")
    private Integer pageCount;

    @Column(nullable = false)
    private String sha256;

    @Column(name = "file_hash", nullable = false)
    private String fileHash;

    @Column(name = "storage_path", nullable = false)
    private String storagePath;

    @Column(name = "storage_policy", nullable = false)
    private String storagePolicy;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(nullable = false)
    private String status = STATUS_QUARANTINE;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "ingestion_error")
    private String ingestionError;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected Document() {}

    public Document(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID createdBy,
            String filename,
            String originalFilename,
            String mimeType,
            Long fileSize,
            Integer pageCount,
            String sha256,
            String storagePath,
            String storagePolicy
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.createdBy = createdBy;
        this.filename = filename;
        this.originalFilename = originalFilename;
        this.mimeType = mimeType;
        this.fileSize = fileSize;
        this.pageCount = pageCount;
        this.sha256 = sha256;
        this.fileHash = sha256;
        this.storagePath = storagePath;
        this.storagePolicy = storagePolicy;
        this.status = STATUS_QUARANTINE;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getCaseId() { return caseId; }
    public UUID getCreatedBy() { return createdBy; }
    public String getFilename() { return filename; }
    public String getOriginalFilename() { return originalFilename; }
    public String getMimeType() { return mimeType; }
    public Long getFileSize() { return fileSize; }
    public Integer getPageCount() { return pageCount; }
    public String getSha256() { return sha256; }
    public String getFileHash() { return fileHash; }
    public String getStoragePath() { return storagePath; }
    public String getStoragePolicy() { return storagePolicy; }
    public String getStatus() { return status; }
    public String getRejectionReason() { return rejectionReason; }
    public String getIngestionError() { return ingestionError; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void markApprovedForIngestion() {
        requireStatus(STATUS_QUARANTINE);
        this.status = STATUS_APPROVED_PENDING_INGESTION;
        this.rejectionReason = null;
        this.ingestionError = null;
    }

    public void markRejected(String reason) {
        requireStatus(STATUS_QUARANTINE);
        this.status = STATUS_REJECTED;
        this.rejectionReason = reason == null || reason.isBlank() ? "Ikke angitt" : reason;
    }

    public void markArchived() {
        if (STATUS_DELETED.equals(status)) {
            throw new IllegalStateException("Deleted documents cannot be archived");
        }
        this.status = STATUS_ARCHIVED;
    }

    public void markDeleted() {
        this.status = STATUS_DELETED;
    }

    public void markIngesting() {
        requireStatus(STATUS_APPROVED_PENDING_INGESTION);
        this.status = STATUS_INGESTING;
        this.ingestionError = null;
    }

    public void markApprovedPendingIngestionFromFailure() {
        if (!STATUS_INGESTION_FAILED.equals(status) && !STATUS_PARTIAL_SOURCE_READY.equals(status)) {
            throw new IllegalStateException("Invalid document transition from " + status + ", expected " + STATUS_INGESTION_FAILED + " or " + STATUS_PARTIAL_SOURCE_READY);
        }
        this.status = STATUS_APPROVED_PENDING_INGESTION;
        this.ingestionError = null;
        this.rejectionReason = null;
    }

    public void markIngestionFailed(String reason) {
        this.status = STATUS_INGESTION_FAILED;
        this.ingestionError = reason == null || reason.isBlank() ? "INGESTION_FAILED" : reason;
    }

    public void markSourceReady() {
        this.status = STATUS_SOURCE_READY;
        this.ingestionError = null;
    }

    public void markPartialSourceReady(String warning) {
        this.status = STATUS_PARTIAL_SOURCE_READY;
        this.ingestionError = warning == null || warning.isBlank() ? "PARTIAL_SOURCE_READY" : warning;
    }

    public void markVerified() {
        requireStatus(STATUS_SOURCE_READY);
        this.status = STATUS_VERIFIED;
    }

    private void requireStatus(String expectedStatus) {
        if (!expectedStatus.equals(status)) {
            throw new IllegalStateException("Invalid document transition from " + status + ", expected " + expectedStatus);
        }
    }
}
