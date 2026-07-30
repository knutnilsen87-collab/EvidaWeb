package no.saksrom.api.document;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.Permission;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import java.io.InputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping({"/api/v1/documents", "/api/documents"})
public class DocumentController {
    private static final Pattern SHA256_PATTERN = Pattern.compile("(?i)[0-9a-f]{64}");
    private static final int MAX_DUPLICATE_CHECK_HASHES = 100;

    private final EvidaProperties properties;
    private final CurrentUserService currentUserService;
    private final DocumentQuarantineService quarantineService;
    private final LargeDocumentIngestionService ingestionService;
    private final IngestionJobService ingestionJobService;
    private final UploadSecurityService uploadSecurityService;
    private final AuditService auditService;
    private final AuthorizationService authorizationService;

    @Autowired
    public DocumentController(
            EvidaProperties properties,
            CurrentUserService currentUserService,
            DocumentQuarantineService quarantineService,
            LargeDocumentIngestionService ingestionService,
            IngestionJobService ingestionJobService,
            UploadSecurityService uploadSecurityService,
            AuditService auditService,
            AuthorizationService authorizationService
    ) {
        this.properties = properties;
        this.currentUserService = currentUserService;
        this.quarantineService = quarantineService;
        this.ingestionService = ingestionService;
        this.ingestionJobService = ingestionJobService;
        this.uploadSecurityService = uploadSecurityService;
        this.auditService = auditService;
        this.authorizationService = authorizationService;
    }

    public DocumentController(
            EvidaProperties properties,
            CurrentUserService currentUserService,
            DocumentQuarantineService quarantineService,
            LargeDocumentIngestionService ingestionService,
            IngestionJobService ingestionJobService,
            UploadSecurityService uploadSecurityService,
            AuditService auditService
    ) {
        this(
                properties,
                currentUserService,
                quarantineService,
                ingestionService,
                ingestionJobService,
                uploadSecurityService,
                auditService,
                new AuthorizationService()
        );
    }

    public DocumentController(
            EvidaProperties properties,
            CurrentUserService currentUserService,
            DocumentQuarantineService quarantineService,
            LargeDocumentIngestionService ingestionService,
            IngestionJobService ingestionJobService
    ) {
        this(
                properties,
                currentUserService,
                quarantineService,
                ingestionService,
                ingestionJobService,
                new UploadSecurityService(properties),
                null,
                new AuthorizationService()
        );
    }

    /**
     * P0 utility endpoint for hashing.
     * Production rule: large/raw legal document upload must be policy controlled.
     */
    @PostMapping("/hash")
    public DocumentHashResponse calculateHash(@RequestParam("file") MultipartFile file) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_UPLOAD);
        if (!properties.documents().rawUploadAllowed()) {
            return new DocumentHashResponse(
                    file.getOriginalFilename(),
                    file.getSize(),
                    null,
                    "RAW_UPLOAD_DISABLED_BY_POLICY"
            );
        }

        try {
            validateUpload(file);
        } catch (UploadSecurityException e) {
            return new DocumentHashResponse(
                    file.getOriginalFilename(),
                    file.getSize(),
                    null,
                    e.code()
            );
        }

        try {
            byte[] hash = streamingSha256(file);
            return new DocumentHashResponse(
                    file.getOriginalFilename(),
                    file.getSize(),
                    HexFormat.of().formatHex(hash),
                    "OK"
            );
        } catch (Exception e) {
            throw new IllegalStateException("Could not hash uploaded document", e);
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<DocumentUploadResponse> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestHeader(value = "X-Evida-Case-ID", required = false) String caseHeader
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.DOCUMENT_UPLOAD);
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        UUID caseId = caseHeader == null || caseHeader.isBlank() ? null : parseUuid(caseHeader, "CASE_HEADER_INVALID");

        if (!requestedTenant.equals(user.tenantId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(DocumentUploadResponse.rejected(
                    requestedTenant,
                    file.getOriginalFilename(),
                    file.getSize(),
                    "TENANT_MISMATCH",
                    "Tenant-kontekst stemmer ikke med autentisert bruker."
            ));
        }

        try {
            validateUpload(file);
        } catch (UploadSecurityException e) {
            auditUploadRejected(requestedTenant, caseId, user.userId(), e.code());
            return ResponseEntity.status(e.httpStatus()).body(DocumentUploadResponse.rejected(
                    requestedTenant,
                    file.getOriginalFilename(),
                    file.getSize(),
                    e.code(),
                    uploadSecurityService.safeMessage(e.code())
            ));
        }

        try {
            return ResponseEntity.ok(
                    quarantineService.saveToQuarantine(
                            file,
                            requestedTenant,
                            user,
                            caseId,
                            properties.documents().maxFileSizeBytes()
                    )
            );
        } catch (UploadSecurityException e) {
            auditUploadRejected(requestedTenant, caseId, user.userId(), e.code());
            return ResponseEntity.status(e.httpStatus()).body(DocumentUploadResponse.rejected(
                    requestedTenant,
                    file.getOriginalFilename(),
                    file.getSize(),
                    e.code(),
                    uploadSecurityService.safeMessage(e.code())
            ));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Could not quarantine uploaded document", e);
        }
    }

    @PostMapping("/{documentId}/replace")
    public ResponseEntity<DocumentUploadResponse> replaceDocument(
            @PathVariable UUID documentId,
            @RequestParam("file") MultipartFile file,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.DOCUMENT_UPLOAD);
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        validateUpload(file);
        return ResponseEntity.ok(quarantineService.replaceDocument(
                documentId,
                file,
                requestedTenant,
                user,
                properties.documents().maxFileSizeBytes()
        ));
    }

    @GetMapping
    public List<DocumentUploadResponse> listDocuments(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.DOCUMENT_LIST);
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        UUID requestedCase = caseId == null || caseId.isBlank() ? null : parseUuid(caseId, "CASE_ID_INVALID");

        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }

        return quarantineService.listDocuments(requestedTenant, requestedCase);
    }

    @GetMapping("/exists")
    public DocumentExistsResponse documentExists(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam("sha256") String sha256,
            @RequestParam(value = "caseId", required = false) String caseId
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_LIST);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        if (sha256 == null || !SHA256_PATTERN.matcher(sha256).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SHA256_INVALID");
        }
        UUID requestedCase = caseId == null || caseId.isBlank() ? null : parseUuid(caseId, "CASE_ID_INVALID");
        return quarantineService.existsBySha256(requestedTenant, sha256.toLowerCase(Locale.ROOT), requestedCase);
    }

    @PostMapping("/check-duplicates")
    public List<DocumentDuplicateCheckResponse> checkDuplicates(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody DocumentDuplicateCheckRequest request
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_LIST);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        List<String> hashes = request == null || request.hashes() == null ? List.of() : request.hashes();
        if (hashes.size() > MAX_DUPLICATE_CHECK_HASHES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "HASHES_LIMIT_EXCEEDED max=" + MAX_DUPLICATE_CHECK_HASHES);
        }

        String caseId = request == null ? null : request.caseId();
        UUID requestedCase = caseId == null || caseId.isBlank() ? null : parseUuid(caseId, "CASE_ID_INVALID");

        LinkedHashSet<String> normalizedHashes = new LinkedHashSet<>();
        for (String hash : hashes) {
            if (hash == null || !SHA256_PATTERN.matcher(hash).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SHA256_INVALID");
            }
            normalizedHashes.add(hash.toLowerCase(Locale.ROOT));
        }

        return quarantineService.checkDuplicates(requestedTenant, List.copyOf(normalizedHashes), requestedCase);
    }

    @GetMapping("/{documentId}")
    public DocumentUploadResponse getDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_READ);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        return quarantineService.getDocument(documentId, requestedTenant);
    }

    @GetMapping("/{documentId}/download")
    public ResponseEntity<Resource> downloadDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_READ);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        DocumentUploadResponse metadata = quarantineService.getDocument(documentId, requestedTenant);
        Path path = quarantineService.downloadPath(documentId, requestedTenant);
        Resource resource = new FileSystemResource(path);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + metadata.filename() + "\"")
                .contentType(MediaType.parseMediaType(metadata.contentType() == null ? "application/octet-stream" : metadata.contentType()))
                .body(resource);
    }

    @PostMapping("/{documentId}/approve-ingestion")
    public DocumentUploadResponse approveForIngestion(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_APPROVE);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        ingestionJobService.approve(documentId, requestedTenant);
        return quarantineService.getDocument(documentId, requestedTenant);
    }

    @PostMapping("/ingestion/start-batch")
    public List<BatchStartResult> startBatch(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestBody BatchStartRequest request
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_APPROVE);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        if (request == null || request.documentIds() == null) {
            return List.of();
        }
        UUID requestedCase = (caseId != null && !caseId.isEmpty()) ? UUID.fromString(caseId) : null;
        return request.documentIds().stream()
                .map(id -> {
                    try {
                        UUID docId = UUID.fromString(id);
                        Document doc = quarantineService.getDocumentEntity(docId, requestedTenant);
                        if (requestedCase != null && !requestedCase.equals(doc.getCaseId())) {
                            return new BatchStartResult(id, "FAILED", "Document does not belong to the active case.");
                        }
                        ingestionJobService.approve(docId, requestedTenant);
                        return new BatchStartResult(id, "SUCCESS", null);
                    } catch (Exception e) {
                        return new BatchStartResult(id, "FAILED", e.getMessage());
                    }
                })
                .toList();
    }

    @PostMapping("/{documentId}/reject")
    public DocumentUploadResponse rejectDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody(required = false) RejectDocumentRequest request
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_REJECT);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        return quarantineService.rejectDocument(documentId, requestedTenant, request == null ? null : request.reason());
    }

    @PostMapping("/{documentId}/archive")
    public DocumentUploadResponse archiveDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_REJECT);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        return quarantineService.archiveDocument(documentId, requestedTenant);
    }

    @DeleteMapping("/{documentId}")
    public ResponseEntity<Void> deleteDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_DELETE);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        quarantineService.deleteDocument(documentId, requestedTenant);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{documentId}/ingest")
    public LargeDocumentIngestionService.IngestionResult ingestDocument(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.DOCUMENT_APPROVE);
        requireMatchingTenant(tenantHeader);
        throw new ResponseStatusException(HttpStatus.GONE, "Synchronous ingestion is disabled. Use POST /api/documents/{id}/approve and poll /api/ingestion-jobs/{jobId}.");
    }

    @GetMapping("/{documentId}/source-units")
    public List<SourceUnitResponse> sourceUnits(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.SOURCE_READ);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        return ingestionService.sourceUnits(documentId, requestedTenant).stream()
                .map(SourceUnitResponse::from)
                .toList();
    }

    @GetMapping("/{documentId}/source-units/window")
    public List<SourceUnitResponse> sourceUnitWindow(
            @PathVariable UUID documentId,
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "2") int radius
    ) {
        authorizationService.requirePermission(currentUserService.currentUser(), Permission.SOURCE_READ);
        UUID requestedTenant = requireMatchingTenant(tenantHeader);
        return ingestionService.sourceUnitWindow(documentId, requestedTenant, page, radius).stream()
                .map(SourceUnitResponse::from)
                .toList();
    }

    byte[] streamingSha256(MultipartFile file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = file.getInputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return digest.digest();
    }

    void validateUpload(MultipartFile file) {
        uploadSecurityService.validate(file);
    }

    private void auditUploadRejected(UUID tenantId, UUID caseId, UUID actorUserId, String code) {
        if (auditService == null) {
            return;
        }
        auditService.record(
                tenantId,
                caseId,
                actorUserId,
                "DOCUMENT_UPLOAD_REJECTED",
                "DOCUMENT",
                null,
                "{\"code\":\"" + code + "\"}"
        );
    }

    private UUID parseUuid(String value, String errorCode) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode, e);
        }
    }

    private UUID requireMatchingTenant(String tenantHeader) {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        return requestedTenant;
    }

    public record DocumentHashResponse(
            String filename,
            long size,
            String sha256,
            String status
    ) {}

    public record RejectDocumentRequest(String reason) {}

    public record DocumentUploadResponse(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID createdBy,
            String filename,
            String originalFilename,
            long size,
            String contentType,
            String sha256,
            String fileHash,
            String storagePath,
            String status,
            String message,
            int pageCount,
            String sourceUnitMode,
            int sectionCount,
            String ingestionError,
            OffsetDateTime createdAt,
            UUID ingestionJobId,
            String ingestionJobStatus,
            int ingestionPagesProcessed,
            Integer ingestionPagesTotal,
            String ingestionJobError,
            Integer versionNumber,
            UUID versionRootId,
            UUID supersedesDocumentId,
            UUID supersededByDocumentId,
            boolean activeVersion
    ) {
        static DocumentUploadResponse rejected(
                UUID tenantId,
                String filename,
                long size,
                String status,
                String message
        ) {
            return new DocumentUploadResponse(
                    null,
                    tenantId,
                    null,
                    null,
                    filename,
                    filename,
                    size,
                    null,
                    null,
                    null,
                    null,
                    status,
                    message,
                    0,
                    "NONE",
                    0,
                    null,
                    null,
                    null,
                    null,
                    0,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    false
            );
        }
    }

    public record DocumentExistsResponse(
            boolean exists,
            UUID documentId,
            String status,
            Boolean sameCase
    ) {}

    public record DocumentDuplicateCheckRequest(List<String> hashes, String caseId) {
        public DocumentDuplicateCheckRequest(List<String> hashes) {
            this(hashes, null);
        }
    }

    public record DocumentDuplicateCheckResponse(
            String sha256,
            boolean exists,
            UUID documentId,
            String status
    ) {}

    public record BatchStartRequest(List<String> documentIds) {}
    public record BatchStartResult(String documentId, String status, String error) {}

    public record SourceUnitResponse(
            UUID id,
            UUID tenantId,
            UUID caseId,
            UUID documentId,
            String sourceUnitId,
            int pageNumber,
            String unitType,
            String textContent,
            Integer charStart,
            Integer charEnd,
            String bboxJson,
            Double extractionConfidence,
            String parserVersion,
            OffsetDateTime createdAt
    ) {
        static SourceUnitResponse from(DocumentSourceUnit unit) {
            return new SourceUnitResponse(
                    unit.getId(),
                    unit.getTenantId(),
                    unit.getCaseId(),
                    unit.getDocumentId(),
                    unit.getSourceUnitId(),
                    unit.getPageNumber(),
                    unit.getUnitType(),
                    unit.getTextContent(),
                    unit.getCharStart(),
                    unit.getCharEnd(),
                    unit.getBboxJson(),
                    unit.getExtractionConfidence(),
                    unit.getParserVersion(),
                    unit.getCreatedAt()
            );
        }
    }
}
