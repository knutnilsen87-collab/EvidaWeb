package no.saksrom.api.audit;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "audit_events")
public class AuditEvent {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "case_id")
    private UUID caseId;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id")
    private UUID entityId;

    @Column(name = "event_payload", nullable = false, columnDefinition = "TEXT")
    private String eventPayload;

    @Column(name = "previous_event_hash")
    private String previousEventHash;

    @Column(name = "event_hash", nullable = false)
    private String eventHash;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected AuditEvent() {}

    public AuditEvent(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID actorUserId,
            String eventType,
            String entityType,
            UUID entityId,
            String eventPayload,
            String previousEventHash,
            String eventHash,
            OffsetDateTime createdAt
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.actorUserId = actorUserId;
        this.eventType = eventType;
        this.entityType = entityType;
        this.entityId = entityId;
        this.eventPayload = eventPayload;
        this.previousEventHash = previousEventHash;
        this.eventHash = eventHash;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getCaseId() { return caseId; }
    public UUID getActorUserId() { return actorUserId; }
    public String getEventType() { return eventType; }
    public String getEntityType() { return entityType; }
    public UUID getEntityId() { return entityId; }
    public String getEventPayload() { return eventPayload; }
    public String getPreviousEventHash() { return previousEventHash; }
    public String getEventHash() { return eventHash; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
