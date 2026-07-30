package no.saksrom.api.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DocumentSourceUnitRepository extends JpaRepository<DocumentSourceUnit, UUID> {
    List<DocumentSourceUnit> findByTenantIdAndDocumentIdOrderByPageNumberAscSourceUnitIdAsc(
            UUID tenantId,
            UUID documentId
    );

    List<DocumentSourceUnit> findByTenantIdAndDocumentIdAndPageNumberBetweenOrderByPageNumberAscSourceUnitIdAsc(
            UUID tenantId,
            UUID documentId,
            int fromPage,
            int toPage
    );

    long countByTenantIdAndDocumentId(UUID tenantId, UUID documentId);

    long countByTenantIdAndDocumentIdAndParserVersion(UUID tenantId, UUID documentId, String parserVersion);

    boolean existsByTenantIdAndDocumentIdAndPageNumberAndParserVersion(
            UUID tenantId,
            UUID documentId,
            Integer pageNumber,
            String parserVersion
    );

    @Query("""
            select u.pageNumber from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and u.documentId = :documentId
              and u.parserVersion = :parserVersion
            order by u.pageNumber asc
            """)
    List<Integer> findPageNumbersByTenantIdAndDocumentIdAndParserVersion(
            @Param("tenantId") UUID tenantId,
            @Param("documentId") UUID documentId,
            @Param("parserVersion") String parserVersion
    );

    @Query("""
            select distinct u.pageNumber from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and u.documentId = :documentId
            order by u.pageNumber asc
            """)
    List<Integer> findDistinctPageNumbersByTenantIdAndDocumentId(
            @Param("tenantId") UUID tenantId,
            @Param("documentId") UUID documentId
    );

    void deleteByTenantIdAndDocumentId(UUID tenantId, UUID documentId);

    @Query("""
            select u from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and u.sourceUnitId in :sourceUnitIds
            order by u.pageNumber asc, u.sourceUnitId asc
            """)
    List<DocumentSourceUnit> findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(
            @Param("tenantId") UUID tenantId,
            @Param("sourceUnitIds") Collection<String> sourceUnitIds
    );

    List<DocumentSourceUnit> findByTenantIdAndDocumentIdInOrderByDocumentIdAscPageNumberAscSourceUnitIdAsc(
            UUID tenantId,
            Collection<UUID> documentIds
    );

    @Query("""
            select u from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and u.caseId = :caseId
              and u.textContent is not null
              and length(trim(u.textContent)) > 0
            order by u.documentId asc, u.pageNumber asc, u.sourceUnitId asc
            """)
    List<DocumentSourceUnit> findReadyTextByTenantIdAndCaseId(
            @Param("tenantId") UUID tenantId,
            @Param("caseId") UUID caseId,
            Pageable pageable
    );

    @Query("""
            select count(u) from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and (
                    (:caseId is null and u.caseId is null)
                    or u.caseId = :caseId
                  )
              and u.textContent is not null
              and length(trim(u.textContent)) > 0
            """)
    long countReadyTextByTenantIdAndCaseId(
            @Param("tenantId") UUID tenantId,
            @Param("caseId") UUID caseId
    );

    @Query("""
            select u from DocumentSourceUnit u
            where u.tenantId = :tenantId
              and (:caseId is null or u.caseId = :caseId)
              and lower(u.textContent) like lower(concat('%', :query, '%'))
            order by u.pageNumber asc, u.sourceUnitId asc
            """)
    List<DocumentSourceUnit> searchKeyword(
            @Param("tenantId") UUID tenantId,
            @Param("caseId") UUID caseId,
            @Param("query") String query,
            Pageable pageable
    );
}
