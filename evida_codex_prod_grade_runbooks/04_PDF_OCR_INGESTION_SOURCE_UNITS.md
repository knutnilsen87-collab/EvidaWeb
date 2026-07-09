
Phase 04 — PDF/OCR Ingestion + Source Units
Objective

Turn uploaded documents into source-ready legal evidence units.

Required flow:

APPROVED_FOR_INGESTION
→ INGESTING
→ parse PDF / OCR when needed
→ create page/source units
→ store text + page metadata + coordinates when available
→ SOURCE_READY

Never mark a document as VERIFIED or SOURCE_READY unless ingestion actually produced usable source units.

Scope

In scope:

real PDF text extraction
OCR interface or local placeholder that is explicit and not green
source unit persistence
page-level source unit API
ingestion state machine
ingestion failure handling
frontend source-ready states
tests and smoke

Out of scope:

advanced vector search
final RAG answer quality
legal reasoning engine
DOCX export
production-scale distributed ingestion
Dependencies

Prefer:

Apache PDFBox for text extraction.
Tesseract/Tess4J only if OCR is already acceptable in environment.
Otherwise add OCR abstraction and explicit OCR_REQUIRED_NOT_CONFIGURED.

Do not silently pretend OCR succeeded.

Data model

If no source-unit table exists, add migration.

CREATE TABLE document_source_units (
    id UUID PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    case_id VARCHAR(255),
    document_id UUID NOT NULL,
    source_unit_id VARCHAR(255) NOT NULL,
    page_number INTEGER NOT NULL,
    unit_type VARCHAR(50) NOT NULL,
    text_content TEXT NOT NULL,
    char_start INTEGER,
    char_end INTEGER,
    bbox_json TEXT,
    extraction_confidence DOUBLE PRECISION,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_source_units_tenant_document
    ON document_source_units (tenant_id, document_id);

CREATE INDEX idx_source_units_document_page
    ON document_source_units (document_id, page_number);

CREATE UNIQUE INDEX uq_source_units_document_unit
    ON document_source_units (document_id, source_unit_id);

Adjust SQL dialect to existing DB.

Entity stub
@Entity
@Table(name = "document_source_units")
public class DocumentSourceUnit {
    @Id
    private UUID id;

    @Column(nullable = false)
    private String tenantId;

    private String caseId;

    @Column(nullable = false)
    private UUID documentId;

    @Column(nullable = false)
    private String sourceUnitId;

    @Column(nullable = false)
    private Integer pageNumber;

    @Column(nullable = false)
    private String unitType;

    @Lob
    @Column(nullable = false)
    private String textContent;

    private Integer charStart;
    private Integer charEnd;

    @Lob
    private String bboxJson;

    private Double extractionConfidence;

    private Instant createdAt;
    private Instant updatedAt;
}
Repository stub
public interface DocumentSourceUnitRepository extends JpaRepository<DocumentSourceUnit, UUID> {
    List<DocumentSourceUnit> findByTenantIdAndDocumentIdOrderByPageNumberAscSourceUnitIdAsc(
            String tenantId,
            UUID documentId
    );

    List<DocumentSourceUnit> findByTenantIdAndDocumentIdAndPageNumberBetweenOrderByPageNumberAscSourceUnitIdAsc(
            String tenantId,
            UUID documentId,
            int fromPage,
            int toPage
    );

    long countByTenantIdAndDocumentId(String tenantId, UUID documentId);
}
Parser contract

Use or extend existing DocumentParser.

public interface DocumentParser {
    ParsedDocument parse(Document document, Path filePath);
}

public record ParsedDocument(
        UUID documentId,
        List<PageUnit> pages,
        boolean ocrRequired,
        boolean ocrPerformed,
        String parserName
) {}

public record PageUnit(
        int pageNumber,
        String text,
        double confidence,
        List<TextBlock> blocks
) {}

public record TextBlock(
        String text,
        Integer charStart,
        Integer charEnd,
        String bboxJson,
        double confidence
) {}
PDFBox parser stub
@Component
public class PdfBoxDocumentParser implements DocumentParser {

    @Override
    public ParsedDocument parse(Document document, Path filePath) {
        try (PDDocument pdf = Loader.loadPDF(filePath.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            List<PageUnit> pages = new ArrayList<>();

            for (int page = 1; page <= pdf.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(pdf).trim();

                if (text.isBlank()) {
                    pages.add(new PageUnit(page, "", 0.0, List.of()));
                } else {
                    pages.add(new PageUnit(page, text, 0.85, List.of(
                            new TextBlock(text, 0, text.length(), null, 0.85)
                    )));
                }
            }

            boolean ocrRequired = pages.stream().anyMatch(p -> p.text().isBlank());

            return new ParsedDocument(
                    document.getId(),
                    pages,
                    ocrRequired,
                    false,
                    "pdfbox"
            );
        } catch (IOException ex) {
            throw new DocumentParsingException("Failed to parse PDF", ex);
        }
    }
}

If using PDFBox 2 instead of 3, replace Loader.loadPDF with PDDocument.load.

Ingestion service
@Transactional
public IngestionResult ingestDocument(UUID documentId, String tenantId, AuthenticatedUser user) {
    validateTenant(tenantId, user);

    Document doc = repository.findByIdAndTenantId(documentId, tenantId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

    requireStatus(doc, DocumentStatus.APPROVED_FOR_INGESTION);

    doc.setStatus(DocumentStatus.INGESTING);
    repository.save(doc);

    try {
        Path file = Path.of(doc.getStoragePath());
        ParsedDocument parsed = parser.parse(doc, file);

        if (parsed.pages().isEmpty()) {
            throw new IngestionFailedException("Parser returned no pages");
        }

        if (parsed.ocrRequired() && !parsed.ocrPerformed()) {
            doc.setStatus(DocumentStatus.INGESTION_FAILED);
            doc.setIngestionError("OCR required but not configured");
            repository.save(doc);
            return IngestionResult.failed(documentId, "OCR_REQUIRED_NOT_CONFIGURED");
        }

        List<DocumentSourceUnit> units = toSourceUnits(doc, parsed);
        sourceUnitRepository.saveAll(units);

        if (units.isEmpty()) {
            throw new IngestionFailedException("No source units created");
        }

        doc.setStatus(DocumentStatus.SOURCE_READY);
        doc.setUpdatedAt(Instant.now());
        repository.save(doc);

        return IngestionResult.succeeded(documentId, units.size());
    } catch (Exception ex) {
        doc.setStatus(DocumentStatus.INGESTION_FAILED);
        doc.setIngestionError(ex.getMessage());
        doc.setUpdatedAt(Instant.now());
        repository.save(doc);
        return IngestionResult.failed(documentId, ex.getMessage());
    }
}

Hard rules:

No source units -> no SOURCE_READY.
OCR required but not configured -> INGESTION_FAILED.
Parser exception -> INGESTION_FAILED.
Source unit ID format
doc_<document-short-id>_p0001_b0001

Example:

String sourceUnitId = "doc_%s_p%04d_b%04d".formatted(
    document.getId().toString().substring(0, 8),
    pageNumber,
    blockIndex
);
API endpoints
POST /api/documents/{id}/ingest
GET  /api/documents/{id}/source-units
GET  /api/documents/{id}/source-units/window?page=10&radius=2
Frontend integration

Required states:

APPROVED_FOR_INGESTION: show "Ready for ingestion"
INGESTING: show progress/pending
INGESTION_FAILED: show explicit error
SOURCE_READY: allow source viewing
VERIFIED: only after later verification

Do not show SOURCE_READY based on mock source units.

API stubs:

export async function ingestDocument(documentId: string, tenantId: string): Promise<IngestionResponse> {
  const response = await fetch(`/api/documents/${documentId}/ingest`, {
    method: 'POST',
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to ingest document: ${response.status}`);
  }

  return response.json();
}

export async function fetchSourceUnits(documentId: string, tenantId: string): Promise<SourceUnit[]> {
  const response = await fetch(`/api/documents/${documentId}/source-units`, {
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source units: ${response.status}`);
  }

  return response.json();
}
Backend tests

Minimum:

ingest approved PDF creates source units
ingest empty/unparseable PDF fails closed
OCR-required scanned PDF does not become SOURCE_READY without OCR
source units are tenant-isolated
SOURCE_READY requires at least one source unit
source unit window returns correct page range
Smoke test
Upload a text-based PDF.
Approve for ingestion.
Call ingest endpoint.
Confirm status becomes SOURCE_READY.
Fetch source units.
Confirm page/source text exists.
Upload blank/scanned PDF or test fixture requiring OCR.
Confirm INGESTION_FAILED if OCR not configured.
Cross-tenant source unit request must fail.
Report
docs/codex-reports/2026-07-02_pdf_ocr_ingestion_source_units.md
Success criteria

succeeded only if:

real PDF text extraction works
source units persist
document status transition is correct
no false SOURCE_READY
OCR-required path fails closed if OCR unavailable
source units are tenant-isolated
tests and smoke pass
Next phase

Run:

05_SOURCE_BOUND_AI_AND_SAKSROM.md
