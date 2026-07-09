package no.saksrom.api.courtengine;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "operative_summaries",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_operative_summaries_tenant_case",
                columnNames = {"tenant_id", "case_id"}
        )
)
public class OperativeSummaryEntity {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "case_id", nullable = false)
    private String caseId;

    @Column(name = "analysis_status", nullable = false)
    private String analysisStatus;

    @Column(name = "summary_json", nullable = false, columnDefinition = "TEXT")
    private String summaryJson;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected OperativeSummaryEntity() {}

    public OperativeSummaryEntity(UUID id, UUID tenantId, String caseId) {
        this.id = id;
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.analysisStatus = "processing";
        this.summaryJson = "{}";
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getCaseId() { return caseId; }
    public String getAnalysisStatus() { return analysisStatus; }
    public String getSummaryJson() { return summaryJson; }
    public String getErrorMessage() { return errorMessage; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void markProcessing() {
        this.analysisStatus = "processing";
        this.errorMessage = null;
    }

    public void markCompleted(String summaryJson) {
        this.analysisStatus = "completed";
        this.summaryJson = summaryJson;
        this.errorMessage = null;
    }

    public void markFailed(String errorMessage) {
        this.analysisStatus = "failed";
        this.errorMessage = errorMessage;
    }
}
