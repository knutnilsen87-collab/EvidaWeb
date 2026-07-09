package no.saksrom.api.courtengine;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OperativeSummaryRepository extends JpaRepository<OperativeSummaryEntity, UUID> {
    Optional<OperativeSummaryEntity> findByTenantIdAndCaseId(UUID tenantId, String caseId);
}
