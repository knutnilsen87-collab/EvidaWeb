package no.saksrom.api.canvas;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CaseCanvasRepository extends JpaRepository<CaseCanvas, UUID> {
    Optional<CaseCanvas> findByTenantIdAndCaseId(UUID tenantId, UUID caseId);
}
