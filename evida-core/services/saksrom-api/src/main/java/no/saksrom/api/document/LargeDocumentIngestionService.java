package no.saksrom.api.document;

import no.saksrom.api.audit.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class LargeDocumentIngestionService {
    public static final int LARGE_DOCUMENT_THRESHOLD_PAGES = 1_000;
    public static final int DEFAULT_SECTION_SIZE_PAGES = 250;

    private final DocumentRepository documentRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final DocumentParser documentParser;
    private final AuditService auditService;
    private final Path quarantineRoot;

    public LargeDocumentIngestionService() {
        this.documentRepository = null;
        this.sourceUnitRepository = null;
        this.documentParser = null;
        this.auditService = null;
        this.quarantineRoot = null;
    }

    @Autowired
    public LargeDocumentIngestionService(
            DocumentRepository documentRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            DocumentParser documentParser,
            AuditService auditService,
            @Value("${evida.storage.quarantine-root:./data/quarantine}") String quarantineRoot
    ) {
        this.documentRepository = documentRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.documentParser = documentParser;
        this.auditService = auditService;
        this.quarantineRoot = Path.of(quarantineRoot).toAbsolutePath().normalize();
    }

    LargeDocumentIngestionService(
            DocumentRepository documentRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            DocumentParser documentParser,
            Path quarantineRoot
    ) {
        this.documentRepository = documentRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.documentParser = documentParser;
        this.auditService = null;
        this.quarantineRoot = quarantineRoot.toAbsolutePath().normalize();
    }

    @Transactional
    public IngestionResult ingestDocument(UUID documentId, UUID tenantId) {
        if (synchronousIngestionDisabled()) {
            throw new ResponseStatusException(
                    HttpStatus.GONE,
                    "Synchronous ingestion is disabled. Use ingestion_jobs worker flow."
            );
        }
        ensureConfigured();

        Document document = documentRepository.findByIdAndTenantId(documentId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet."));

        if (!Document.STATUS_APPROVED_PENDING_INGESTION.equals(document.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dokument må være godkjent for ingestion først.");
        }

        document.markIngesting();
        documentRepository.save(document);
        audit("DOCUMENT_INGEST_STARTED", document, "{\"parser\":\"pending\"}");

        try {
            Path filePath = resolveStoragePath(document);
            ParsedDocument parsed = documentParser.parse(document, filePath);

            if (parsed.pages().isEmpty()) {
                return fail(document, "NO_PAGES_EXTRACTED", parsed.parserName(), false, false);
            }
            if (parsed.ocrRequired() && !parsed.ocrPerformed()) {
                return fail(document, "OCR_REQUIRED_NOT_CONFIGURED", parsed.parserName(), true, false);
            }

            List<DocumentSourceUnit> units = toSourceUnits(document, parsed);
            if (units.isEmpty()) {
                return fail(document, "NO_SOURCE_UNITS_CREATED", parsed.parserName(), parsed.ocrRequired(), parsed.ocrPerformed());
            }

            sourceUnitRepository.deleteByTenantIdAndDocumentId(document.getTenantId(), document.getId());
            sourceUnitRepository.saveAll(units);
            audit("SOURCE_UNIT_CREATED", document, "{\"sourceUnitCount\":" + units.size() + ",\"parser\":\"" + escape(parsed.parserName()) + "\"}");
            documentRepository.save(document);
            audit("DOCUMENT_INGEST_SUCCEEDED", document, "{\"sourceUnitCount\":" + units.size() + ",\"parser\":\"" + escape(parsed.parserName()) + "\"}");

            return new IngestionResult(
                    document.getId(),
                    document.getTenantId(),
                    document.getCaseId(),
                    units.size(),
                    Document.STATUS_SOURCE_READY,
                    null,
                    parsed.ocrRequired(),
                    parsed.ocrPerformed(),
                    parsed.parserName()
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RuntimeException e) {
            return fail(document, e.getMessage(), "unknown", false, false);
        }
    }

    @Transactional(readOnly = true)
    public List<DocumentSourceUnit> sourceUnits(UUID documentId, UUID tenantId) {
        ensureConfigured();
        requireVisibleDocument(documentId, tenantId);
        return sourceUnitRepository.findByTenantIdAndDocumentIdOrderByPageNumberAscSourceUnitIdAsc(tenantId, documentId);
    }

    @Transactional(readOnly = true)
    public List<DocumentSourceUnit> sourceUnitWindow(UUID documentId, UUID tenantId, int page, int radius) {
        ensureConfigured();
        requireVisibleDocument(documentId, tenantId);
        int normalizedPage = Math.max(1, page);
        int normalizedRadius = Math.max(0, radius);
        int fromPage = Math.max(1, normalizedPage - normalizedRadius);
        int toPage = normalizedPage + normalizedRadius;
        return sourceUnitRepository.findByTenantIdAndDocumentIdAndPageNumberBetweenOrderByPageNumberAscSourceUnitIdAsc(
                tenantId,
                documentId,
                fromPage,
                toPage
        );
    }

    private void ensureConfigured() {
        if (documentRepository == null || sourceUnitRepository == null || documentParser == null || quarantineRoot == null) {
            throw new IllegalStateException("Document ingestion dependencies are not configured.");
        }
    }

    private boolean synchronousIngestionDisabled() {
        return true;
    }

    private Document requireVisibleDocument(UUID documentId, UUID tenantId) {
        return documentRepository.findByIdAndTenantId(documentId, tenantId)
                .filter(document -> !Document.STATUS_DELETED.equals(document.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet."));
    }

    private Path resolveStoragePath(Document document) {
        Path filePath = quarantineRoot.resolve(document.getStoragePath()).normalize();
        if (!filePath.startsWith(quarantineRoot)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storage path");
        }
        if (!Files.exists(filePath)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Stored document not found");
        }
        return filePath;
    }

    private List<DocumentSourceUnit> toSourceUnits(Document document, ParsedDocument parsed) {
        List<DocumentSourceUnit> units = new ArrayList<>();
        for (PageUnit page : parsed.pages()) {
            int blockIndex = 1;
            for (TextBlock block : page.blocks()) {
                if (block.text() == null || block.text().isBlank()) {
                    continue;
                }
                units.add(new DocumentSourceUnit(
                        UUID.randomUUID(),
                        document.getTenantId(),
                        document.getCaseId(),
                        document.getId(),
                        sourceUnitId(document.getId(), page.pageNumber(), blockIndex),
                        page.pageNumber(),
                        "TEXT_BLOCK",
                        block.text(),
                        block.charStart(),
                        block.charEnd(),
                        block.bboxJson(),
                        block.confidence()
                ));
                blockIndex++;
            }
        }
        return units;
    }

    private IngestionResult fail(
            Document document,
            String errorCode,
            String parserName,
            boolean ocrRequired,
            boolean ocrPerformed
    ) {
        String normalizedError = errorCode == null || errorCode.isBlank() ? "INGESTION_FAILED" : errorCode;
        document.markIngestionFailed(normalizedError);
        documentRepository.save(document);
        audit("DOCUMENT_INGEST_FAILED", document, "{\"errorCode\":\"" + escape(normalizedError) + "\",\"parser\":\"" + escape(parserName) + "\"}");
        return new IngestionResult(
                document.getId(),
                document.getTenantId(),
                document.getCaseId(),
                0,
                Document.STATUS_INGESTION_FAILED,
                normalizedError,
                ocrRequired,
                ocrPerformed,
                parserName
        );
    }

    public DocumentIngestionPlan plan(UUID documentId, int pageCount) {
        boolean largeDocument = pageCount >= LARGE_DOCUMENT_THRESHOLD_PAGES;
        List<SourceSection> sections = new ArrayList<>();

        for (int start = 1; start <= pageCount; start += DEFAULT_SECTION_SIZE_PAGES) {
            int end = Math.min(pageCount, start + DEFAULT_SECTION_SIZE_PAGES - 1);
            sections.add(new SourceSection(
                    "sec_%05d_%05d".formatted(start, end),
                    start,
                    end,
                    "QUARANTINE"
            ));
        }

        return new DocumentIngestionPlan(
                documentId,
                pageCount,
                largeDocument,
                "PAGE_SOURCE_UNITS",
                sections
        );
    }

    public String sourceUnitId(UUID documentId, int pageNumber) {
        return sourceUnitId(documentId, pageNumber, 1);
    }

    public String sourceUnitId(UUID documentId, int pageNumber, int blockIndex) {
        if (pageNumber < 1) {
            throw new IllegalArgumentException("pageNumber must be >= 1");
        }
        if (blockIndex < 1) {
            throw new IllegalArgumentException("blockIndex must be >= 1");
        }
        return "doc_%s_p%04d_b%04d".formatted(
                documentId.toString().substring(0, 8),
                pageNumber,
                blockIndex
        );
    }

    private void audit(String eventType, Document document, String payloadJson) {
        if (auditService == null) {
            return;
        }
        auditService.record(
                document.getTenantId(),
                document.getCaseId(),
                null,
                eventType,
                "DOCUMENT",
                document.getId(),
                payloadJson
        );
    }

    private String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public record DocumentIngestionPlan(
            UUID documentId,
            int pageCount,
            boolean largeDocument,
            String sourceUnitMode,
            List<SourceSection> sections
    ) {}

    public record SourceSection(
            String id,
            int startPage,
            int endPage,
            String status
    ) {}

    public record IngestionResult(
            UUID documentId,
            UUID tenantId,
            UUID caseId,
            int sourceUnitCount,
            String status,
            String errorCode,
            boolean ocrRequired,
            boolean ocrPerformed,
            String parserName
    ) {}
}
