package no.saksrom.api.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IngestionJobRepository extends JpaRepository<IngestionJob, UUID> {
    List<IngestionJob> findTop2ByStatusOrderByCreatedAtAsc(String status);

    Optional<IngestionJob> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<IngestionJob> findFirstByTenantIdAndDocumentIdAndStatusInOrderByCreatedAtDesc(
            UUID tenantId,
            UUID documentId,
            Collection<String> statuses
    );

    Optional<IngestionJob> findFirstByTenantIdAndDocumentIdOrderByCreatedAtDesc(UUID tenantId, UUID documentId);

    List<IngestionJob> findByTenantIdAndCaseIdAndStatusOrderByCreatedAtDesc(UUID tenantId, UUID caseId, String status);

    List<IngestionJob> findByTenantIdAndCaseIdOrderByCreatedAtDesc(UUID tenantId, UUID caseId);

    List<IngestionJob> findByTenantIdAndStatusOrderByCreatedAtDesc(UUID tenantId, String status);

    List<IngestionJob> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    @Query("""
            select j from IngestionJob j
            where j.tenantId = :tenantId
              and j.documentId in :documentIds
              and (:caseId is null or j.caseId = :caseId)
              and (:status is null or j.status = :status)
            order by j.documentId asc, j.createdAt desc
            """)
    List<IngestionJob> findBatchLatestCandidates(
            @Param("tenantId") UUID tenantId,
            @Param("documentIds") Collection<UUID> documentIds,
            @Param("caseId") UUID caseId,
            @Param("status") String status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from IngestionJob j where j.id = :id and j.tenantId = :tenantId")
    Optional<IngestionJob> findByIdAndTenantIdForUpdate(@Param("id") UUID id, @Param("tenantId") UUID tenantId);

    @Modifying
    @Query(value = """
            update ingestion_jobs
            set status = 'RUNNING',
                locked_at = CURRENT_TIMESTAMP,
                locked_by = :workerId,
                attempt_count = attempt_count + 1,
                updated_at = CURRENT_TIMESTAMP
            where id = :jobId
              and status = 'PENDING'
            """, nativeQuery = true)
    int claimPendingJob(@Param("jobId") UUID jobId, @Param("workerId") String workerId);

    List<IngestionJob> findTop50ByStatusAndLockedAtBeforeOrderByLockedAtAsc(String status, OffsetDateTime lockedBefore);

    /**
     * Stale-RUNNING recovery (DEFECT-P5-2). Conditional on status and the heartbeat timestamp,
     * so a job whose worker refreshed locked_at between candidate lookup and reset is left alone.
     * attempt_count is intentionally untouched: it counts worker claims, and the next claim
     * increments it through {@link #claimPendingJob}.
     */
    @Modifying
    @Query(value = """
            update ingestion_jobs
            set status = 'PENDING',
                locked_by = NULL,
                locked_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            where id = :jobId
              and status = 'RUNNING'
              and locked_at is not null
              and locked_at < :staleBefore
            """, nativeQuery = true)
    int resetStaleRunningJob(@Param("jobId") UUID jobId, @Param("staleBefore") OffsetDateTime staleBefore);
}
