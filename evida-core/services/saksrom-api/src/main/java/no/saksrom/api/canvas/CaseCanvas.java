package no.saksrom.api.canvas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "case_canvases")
public class CaseCanvas {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "case_id", nullable = false, updatable = false)
    private UUID caseId;

    @Column(name = "canvas_json", nullable = false, columnDefinition = "TEXT")
    private String canvasJson;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "updated_by", nullable = false)
    private UUID updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CaseCanvas() {}

    public CaseCanvas(UUID tenantId, UUID caseId, UUID actorUserId, String canvasJson) {
        this.id = UUID.randomUUID();
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.canvasJson = canvasJson;
        this.createdBy = actorUserId;
        this.updatedBy = actorUserId;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = this.createdAt;
    }

    public void replace(String canvasJson, UUID actorUserId) {
        this.canvasJson = canvasJson;
        this.updatedBy = actorUserId;
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getCaseId() { return caseId; }
    public String getCanvasJson() { return canvasJson; }
    public long getVersion() { return version; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
