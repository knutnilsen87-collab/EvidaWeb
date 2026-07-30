package no.saksrom.api.casefile;

import jakarta.persistence.*;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "cases")
@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "tenantId", type = UUID.class))
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
public class CaseFile {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "case_number")
    private String caseNumber;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String status;

    @Column(name = "local_first", nullable = false)
    private boolean localFirst = true;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CaseFile() {}

    public CaseFile(UUID tenantId, String title, UUID createdBy) {
        this.id = UUID.randomUUID();
        this.tenantId = tenantId;
        this.title = title;
        this.status = "OPEN";
        this.createdBy = createdBy;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getTitle() { return title; }
    public String getStatus() { return status; }
    public boolean isLocalFirst() { return localFirst; }

    public void markDeleted() {
        this.status = "DELETED";
        this.updatedAt = OffsetDateTime.now();
    }
}
