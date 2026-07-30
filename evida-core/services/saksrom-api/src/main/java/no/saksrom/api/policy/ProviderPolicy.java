package no.saksrom.api.policy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "provider_policies")
public class ProviderPolicy {
    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "external_provider_approved", nullable = false)
    private boolean externalProviderApproved;

    @Column(name = "change_ticket", nullable = false)
    private String changeTicket;

    @Column(name = "updated_by", nullable = false)
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ProviderPolicy() {}

    public ProviderPolicy(
            UUID tenantId,
            boolean externalProviderApproved,
            String changeTicket,
            UUID updatedBy,
            OffsetDateTime updatedAt
    ) {
        this.tenantId = tenantId;
        this.externalProviderApproved = externalProviderApproved;
        this.changeTicket = changeTicket;
        this.updatedBy = updatedBy;
        this.updatedAt = updatedAt;
    }

    public void update(boolean approved, String ticket, UUID actorUserId, OffsetDateTime timestamp) {
        this.externalProviderApproved = approved;
        this.changeTicket = ticket;
        this.updatedBy = actorUserId;
        this.updatedAt = timestamp;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public boolean isExternalProviderApproved() {
        return externalProviderApproved;
    }

    public String getChangeTicket() {
        return changeTicket;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }
}
