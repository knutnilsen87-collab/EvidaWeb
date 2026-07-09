package no.saksrom.api.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(
        name = "document_source_units",
        indexes = {
                @Index(name = "idx_source_units_tenant_document", columnList = "tenant_id, document_id"),
                @Index(name = "idx_source_units_document_page", columnList = "document_id, page_number")
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_source_units_document_unit", columnNames = {"document_id", "source_unit_id"}),
                @UniqueConstraint(name = "uq_source_units_document_page_parser", columnNames = {"document_id", "page_number", "parser_version"})
        }
)
public class DocumentSourceUnit {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "case_id", updatable = false)
    private UUID caseId;

    @Column(name = "document_id", nullable = false, updatable = false)
    private UUID documentId;

    @Column(name = "source_unit_id", nullable = false)
    private String sourceUnitId;

    @Column(name = "page_number", nullable = false)
    private Integer pageNumber;

    @Column(name = "parser_version", nullable = false)
    private String parserVersion = "v1";

    @Column(name = "unit_type", nullable = false)
    private String unitType;

    @Column(name = "text_content", nullable = false, columnDefinition = "TEXT")
    private String textContent;

    @Column(name = "char_start")
    private Integer charStart;

    @Column(name = "char_end")
    private Integer charEnd;

    @Column(name = "bbox_json", columnDefinition = "TEXT")
    private String bboxJson;

    @Column(name = "extraction_confidence")
    private Double extractionConfidence;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected DocumentSourceUnit() {}

    public DocumentSourceUnit(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID documentId,
            String sourceUnitId,
            Integer pageNumber,
            String unitType,
            String textContent,
            Integer charStart,
            Integer charEnd,
            String bboxJson,
            Double extractionConfidence
    ) {
        this(id, tenantId, caseId, documentId, sourceUnitId, pageNumber, "v1", unitType, textContent, charStart, charEnd, bboxJson, extractionConfidence);
    }

    public DocumentSourceUnit(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID documentId,
            String sourceUnitId,
            Integer pageNumber,
            String parserVersion,
            String unitType,
            String textContent,
            Integer charStart,
            Integer charEnd,
            String bboxJson,
            Double extractionConfidence
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.caseId = caseId;
        this.documentId = documentId;
        this.sourceUnitId = sourceUnitId;
        this.pageNumber = pageNumber;
        this.parserVersion = parserVersion == null || parserVersion.isBlank() ? "v1" : parserVersion;
        this.unitType = unitType;
        this.textContent = textContent;
        this.charStart = charStart;
        this.charEnd = charEnd;
        this.bboxJson = bboxJson;
        this.extractionConfidence = extractionConfidence;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getCaseId() { return caseId; }
    public UUID getDocumentId() { return documentId; }
    public String getSourceUnitId() { return sourceUnitId; }
    public Integer getPageNumber() { return pageNumber; }
    public String getParserVersion() { return parserVersion; }
    public String getUnitType() { return unitType; }
    public String getTextContent() { return textContent; }
    public Integer getCharStart() { return charStart; }
    public Integer getCharEnd() { return charEnd; }
    public String getBboxJson() { return bboxJson; }
    public Double getExtractionConfidence() { return extractionConfidence; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
