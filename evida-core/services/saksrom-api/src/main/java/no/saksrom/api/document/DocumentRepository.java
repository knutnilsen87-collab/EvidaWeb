package no.saksrom.api.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<Document, UUID> {
    Optional<Document> findByIdAndTenantId(UUID id, UUID tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Document d where d.id = :id and d.tenantId = :tenantId")
    Optional<Document> findByIdAndTenantIdForUpdate(@Param("id") UUID id, @Param("tenantId") UUID tenantId);

    List<Document> findByTenantIdAndCaseIdAndStatusOrderByCreatedAtDesc(
            UUID tenantId,
            UUID caseId,
            String status
    );

    List<Document> findByTenantIdAndStatusNotInOrderByCreatedAtDesc(UUID tenantId, List<String> statuses);

    List<Document> findByTenantIdAndCaseIdAndStatusNotInOrderByCreatedAtDesc(
            UUID tenantId,
            UUID caseId,
            List<String> statuses
    );

    List<Document> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    List<Document> findByTenantIdAndCaseIdOrderByCreatedAtDesc(UUID tenantId, UUID caseId);

    List<Document> findByTenantIdAndSha256AndStatusNotInOrderByCreatedAtDesc(
            UUID tenantId,
            String sha256,
            List<String> statuses
    );

    List<Document> findByTenantIdAndSha256InAndStatusNotInOrderByCreatedAtDesc(
            UUID tenantId,
            List<String> sha256,
            List<String> statuses
    );

    List<Document> findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(
            UUID tenantId,
            UUID caseId,
            String sha256,
            List<String> statuses
    );

    List<Document> findByTenantIdAndCaseIdIsNullAndSha256AndStatusNotInOrderByCreatedAtDesc(
            UUID tenantId,
            String sha256,
            List<String> statuses
    );

    long countByTenantIdAndStoragePathAndStatusNot(UUID tenantId, String storagePath, String status);
}
