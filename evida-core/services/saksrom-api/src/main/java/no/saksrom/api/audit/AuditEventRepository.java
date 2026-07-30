package no.saksrom.api.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuditEventRepository extends JpaRepository<AuditEvent, UUID> {
    @Query(value = "select id from tenants where id = :tenantId for update", nativeQuery = true)
    UUID acquireTenantAuditLock(@Param("tenantId") UUID tenantId);

    Optional<AuditEvent> findTopByTenantIdAndCaseIdOrderByCreatedAtDesc(UUID tenantId, UUID caseId);
    List<AuditEvent> findByTenantIdAndCaseIdOrderByCreatedAtAsc(UUID tenantId, UUID caseId);
}
