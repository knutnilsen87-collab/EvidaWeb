package no.saksrom.api.casefile;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface CaseFileRepository extends JpaRepository<CaseFile, UUID> {
    List<CaseFile> findByTenantIdAndStatusNotOrderByCreatedAtDesc(UUID tenantId, String status);
    java.util.Optional<CaseFile> findByIdAndTenantId(UUID id, UUID tenantId);
}
