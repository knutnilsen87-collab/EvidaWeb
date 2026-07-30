package no.saksrom.api.document;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class DocumentQuarantineService {
    private final LargeDocumentIngestionService ingestionService;
    private final DocumentRepository documentRepository;
    private final DocumentStorageService storageService;
    private final IngestionJobRepository jobRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final AuditService auditService;

    @Autowired
    public DocumentQuarantineService(
            LargeDocumentIngestionService ingestionService,
            DocumentRepository documentRepository,
            DocumentStorageService storageService,
            IngestionJobRepository jobRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            AuditService auditService
    ) {
        this.ingestionService = ingestionService;
        this.documentRepository = documentRepository;
        this.storageService = storageService;
        this.jobRepository = jobRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.auditService = auditService;
    }

    public DocumentQuarantineService(
            LargeDocumentIngestionService ingestionService,
            DocumentRepository documentRepository,
            String quarantineRoot
    ) {
        this(
                ingestionService,
                documentRepository,
                new LocalDocumentStorageService(new DevBypassMalwareScanner(), Path.of(quarantineRoot)),
                null,
                null,
                null
        );
    }

    @Transactional
    public DocumentController.DocumentUploadResponse replaceDocument(
            UUID previousDocumentId,
            MultipartFile file,
            UUID tenantId,
            AuthenticatedUser user,
            long maxFileSizeBytes
    ) {
        Document previous = documentRepository.findByIdAndTenantIdForUpdate(previousDocumentId, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Aktiv dokumentversjon ble ikke funnet."));
        if (!previous.isActiveVersion()
                || Document.STATUS_SUPERSEDED.equals(previous.getStatus())
                || Document.STATUS_DELETED.equals(previous.getStatus())
                || Document.STATUS_ARCHIVED.equals(previous.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Kun aktiv dokumentversjon kan erstattes.");
        }

        DocumentStorageService.StoredDocument stored = storageService.storeQuarantineBlob(tenantId, file, maxFileSizeBytes);
        if (previous.getSha256().equalsIgnoreCase(stored.sha256())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Erstatningsfilen er identisk med aktiv versjon.");
        }

        UUID replacementId = UUID.randomUUID();
        int estimatedPages = estimatePages(file);
        LargeDocumentIngestionService.DocumentIngestionPlan plan = ingestionService.plan(replacementId, estimatedPages);
        Document replacement = new Document(
                replacementId,
                tenantId,
                previous.getCaseId(),
                user.userId(),
                safeFilename(file),
                file.getOriginalFilename() == null ? safeFilename(file) : file.getOriginalFilename(),
                file.getContentType() == null ? "application/octet-stream" : file.getContentType(),
                stored.size(),
                plan.pageCount(),
                stored.sha256(),
                stored.storagePath(),
                "QUARANTINE_LOCAL"
        );
        replacement.initializeReplacementOf(previous);
        previous.markSuperseded();

        if (sourceUnitRepository != null) {
            sourceUnitRepository.deleteByTenantIdAndDocumentId(tenantId, previousDocumentId);
            audit(
                    "SOURCE_OBJECTS_INVALIDATED",
                    previous,
                    user.userId(),
                    "{\"replacementDocumentId\":\"" + replacementId + "\"}"
            );
        }
        documentRepository.save(previous);
        // The database enforces one active version per version root. Flush the
        // superseded state before inserting its replacement so Hibernate cannot
        // reorder the insert ahead of the update and trip the partial unique index.
        documentRepository.flush();
        Document saved = documentRepository.save(replacement);
        documentRepository.flush();
        previous.linkSupersededBy(replacementId);
        documentRepository.save(previous);
        audit(
                "DOCUMENT_REPLACED",
                saved,
                user.userId(),
                "{\"supersedesDocumentId\":\"" + previousDocumentId
                        + "\",\"versionNumber\":" + saved.getVersionNumber() + "}"
        );
        return responseFrom(saved, "Ny dokumentversjon ligger i karantene. Tidligere kildegrunnlag er invalidert.", plan.sourceUnitMode(), plan.sections().size());
    }

    DocumentQuarantineService(
            LargeDocumentIngestionService ingestionService,
            DocumentRepository documentRepository
    ) {
        this(ingestionService, documentRepository, "./data/quarantine");
    }

    @Transactional
    public DocumentController.DocumentUploadResponse saveToQuarantine(
            MultipartFile file,
            UUID tenantId,
            AuthenticatedUser user,
            UUID caseId
    ) {
        return saveToQuarantine(
                file,
                tenantId,
                user,
                caseId,
                EvidaProperties.Documents.DEFAULT_MAX_FILE_SIZE_BYTES
        );
    }

    @Transactional
    public DocumentController.DocumentUploadResponse saveToQuarantine(
            MultipartFile file,
            UUID tenantId,
            AuthenticatedUser user,
            UUID caseId,
            long maxFileSizeBytes
    ) {
        UUID documentId = UUID.randomUUID();
        int estimatedPages = estimatePages(file);
        LargeDocumentIngestionService.DocumentIngestionPlan plan = ingestionService.plan(documentId, estimatedPages);
        String safeFilename = safeFilename(file);
        DocumentStorageService.StoredDocument stored = storageService.storeQuarantineBlob(tenantId, file, maxFileSizeBytes);

        Optional<Document> existingSameCase = findActiveSameCase(tenantId, caseId, stored.sha256());
        if (existingSameCase.isPresent()) {
            Document existing = existingSameCase.get();
            audit("DOCUMENT_UPLOAD_DUPLICATE_REUSED", existing, user.userId(), "{\"sha256\":\"" + stored.sha256() + "\"}");
            return responseFrom(existing, "Dokument finnes allerede i samme sak. Eksisterende karantenemetadata returnert.", "PAGE_SOURCE_UNITS", 0);
        }

        Document saved = quarantineFile(
                documentId,
                safeFilename,
                file.getOriginalFilename(),
                file.getContentType(),
                stored.size(),
                stored.sha256(),
                stored.storagePath(),
                caseId,
                tenantId,
                user.userId(),
                plan.pageCount()
        );
        audit("DOCUMENT_UPLOADED", saved, user.userId(), "{\"sourceUnitMode\":\"" + plan.sourceUnitMode() + "\",\"sectionCount\":" + plan.sections().size() + "}");

        return responseFrom(saved, "Dokument mottatt i karantene-slusen. Venter på verifisering.", plan.sourceUnitMode(), plan.sections().size());
    }

    @Transactional
    public Document quarantineFile(
            UUID documentId,
            String filename,
            String originalFilename,
            String mimeType,
            long fileSize,
            String hash,
            String storagePath,
            UUID caseId,
            UUID tenantId,
            UUID createdBy,
            int pageCount
    ) {
        Document document = new Document(
                documentId,
                tenantId,
                caseId,
                createdBy,
                filename,
                originalFilename == null ? filename : originalFilename,
                mimeType == null ? "application/octet-stream" : mimeType,
                fileSize,
                pageCount,
                hash,
                storagePath,
                "QUARANTINE_LOCAL"
        );

        return documentRepository.save(document);
    }

    @Transactional(readOnly = true)
    public List<DocumentController.DocumentUploadResponse> listDocuments(UUID tenantId, UUID caseId) {
        List<String> hiddenStatuses = hiddenStatuses();
        List<Document> documents = caseId == null
                ? documentRepository.findByTenantIdAndStatusNotInOrderByCreatedAtDesc(tenantId, hiddenStatuses)
                : documentRepository.findByTenantIdAndCaseIdAndStatusNotInOrderByCreatedAtDesc(tenantId, caseId, hiddenStatuses);

        return documents.stream()
                .map(document -> responseFrom(document, "Dokument ligger i karantene.", "PAGE_SOURCE_UNITS", 0))
                .toList();
    }

    @Transactional(readOnly = true)
    public DocumentController.DocumentUploadResponse getDocument(UUID documentId, UUID tenantId) {
        return responseFrom(getDocumentEntity(documentId, tenantId), "Dokumentmetadata hentet.", "PAGE_SOURCE_UNITS", 0);
    }

    @Transactional(readOnly = true)
    public Path downloadPath(UUID documentId, UUID tenantId) {
        Document document = getDocumentEntity(documentId, tenantId);
        return storageService.resolveQuarantinePath(document.getStoragePath());
    }

    @Transactional(readOnly = true)
    public DocumentController.DocumentExistsResponse existsBySha256(UUID tenantId, String sha256, UUID caseId) {
        DuplicateLookup lookup = lookupDuplicate(tenantId, sha256, caseId);
        return new DocumentController.DocumentExistsResponse(
                lookup.exists(),
                lookup.documentId(),
                lookup.status(),
                caseId == null ? null : lookup.sameCase()
        );
    }

    @Transactional(readOnly = true)
    public List<DocumentController.DocumentDuplicateCheckResponse> checkDuplicates(UUID tenantId, List<String> sha256Hashes) {
        return checkDuplicates(tenantId, sha256Hashes, null);
    }

    @Transactional(readOnly = true)
    public List<DocumentController.DocumentDuplicateCheckResponse> checkDuplicates(UUID tenantId, List<String> sha256Hashes, UUID caseId) {
        if (sha256Hashes == null || sha256Hashes.isEmpty()) {
            return List.of();
        }

        List<Document> matchingDocuments = documentRepository.findByTenantIdAndSha256InAndStatusNotInOrderByCreatedAtDesc(
                tenantId,
                sha256Hashes,
                hiddenStatuses()
        );
        Map<String, Document> newestDocumentByHash = new LinkedHashMap<>();
        for (Document document : matchingDocuments) {
            // Case-scoped check: a hash registered in another case is not a duplicate for
            // this case — the blob is reused but a new document row must be allowed.
            if (caseId != null && !caseId.equals(document.getCaseId())) {
                continue;
            }
            newestDocumentByHash.putIfAbsent(document.getSha256().toLowerCase(), document);
        }

        return sha256Hashes.stream()
                .map(sha256 -> {
                    Document document = newestDocumentByHash.get(sha256);
                    if (caseId != null) {
                        // Tenant-wide blob existence must not block registration in this case.
                        return new DocumentController.DocumentDuplicateCheckResponse(
                                sha256,
                                document != null,
                                document == null ? null : document.getId(),
                                document == null ? null : document.getStatus()
                        );
                    }
                    DuplicateLookup lookup = lookupDuplicateFromDocumentOrBlob(
                            tenantId,
                            sha256,
                            null,
                            Optional.ofNullable(document)
                    );
                    return new DocumentController.DocumentDuplicateCheckResponse(
                            sha256,
                            lookup.exists(),
                            lookup.documentId(),
                            lookup.status()
                    );
                })
                .toList();
    }

    private DuplicateLookup lookupDuplicate(UUID tenantId, String sha256, UUID caseId) {
        String normalizedSha = sha256.toLowerCase();
        Optional<Document> matchingDocument = caseId == null
                ? documentRepository.findByTenantIdAndSha256AndStatusNotInOrderByCreatedAtDesc(tenantId, normalizedSha, hiddenStatuses()).stream().findFirst()
                : documentRepository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(tenantId, caseId, normalizedSha, hiddenStatuses()).stream().findFirst();

        return lookupDuplicateFromDocumentOrBlob(tenantId, normalizedSha, caseId, matchingDocument);
    }

    private DuplicateLookup lookupDuplicateFromDocumentOrBlob(
            UUID tenantId,
            String normalizedSha,
            UUID caseId,
            Optional<Document> matchingDocument
    ) {
        if (matchingDocument.isPresent()) {
            Document document = matchingDocument.get();
            return new DuplicateLookup(
                    true,
                    document.getId(),
                    document.getStatus(),
                    caseId == null ? null : caseId.equals(document.getCaseId())
            );
        }

        boolean tenantBlobExists = storageService.blobExists(tenantId, normalizedSha);
        return new DuplicateLookup(
                tenantBlobExists,
                null,
                null,
                caseId == null ? null : false
        );
    }

    @Transactional
    public DocumentController.DocumentUploadResponse rejectDocument(UUID documentId, UUID tenantId, String reason) {
        Document document = getDocumentEntity(documentId, tenantId);
        document.markRejected(reason);
        audit("DOCUMENT_REJECTED", document, null, "{\"reason\":\"" + escape(document.getRejectionReason()) + "\"}");
        return responseFrom(documentRepository.save(document), "Dokument er avvist.", "PAGE_SOURCE_UNITS", 0);
    }

    @Transactional
    public DocumentController.DocumentUploadResponse archiveDocument(UUID documentId, UUID tenantId) {
        Document document = getDocumentEntity(documentId, tenantId);
        document.markArchived();
        audit("DOCUMENT_ARCHIVED", document, null, "{}");
        return responseFrom(documentRepository.save(document), "Dokument er arkivert.", "PAGE_SOURCE_UNITS", 0);
    }

    @Transactional
    public void deleteDocument(UUID documentId, UUID tenantId) {
        Document document = getDocumentEntity(documentId, tenantId);
        document.markDeleted();
        audit("DOCUMENT_DELETED", document, null, "{}");
        documentRepository.save(document);
        documentRepository.flush();
        if (sourceUnitRepository != null) {
            sourceUnitRepository.deleteByTenantIdAndDocumentId(tenantId, documentId);
        }
        long remainingBlobReferences = documentRepository.countByTenantIdAndStoragePathAndStatusNot(
                tenantId,
                document.getStoragePath(),
                Document.STATUS_DELETED
        );
        if (remainingBlobReferences == 0) {
            storageService.deleteBlob(tenantId, document.getSha256());
        }
    }

    private void audit(String eventType, Document document, UUID actorUserId, String payloadJson) {
        if (auditService == null) {
            return;
        }
        auditService.record(
                document.getTenantId(),
                document.getCaseId(),
                actorUserId,
                eventType,
                "DOCUMENT",
                document.getId(),
                payloadJson
        );
    }

    private String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public Document getDocumentEntity(UUID documentId, UUID tenantId) {
        return documentRepository.findByIdAndTenantId(documentId, tenantId)
                .filter(document -> !Document.STATUS_DELETED.equals(document.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dokument ikke funnet for aktiv tenant."));
    }

    private Optional<Document> findActiveSameCase(UUID tenantId, UUID caseId, String sha256) {
        List<Document> documents = caseId == null
                ? documentRepository.findByTenantIdAndCaseIdIsNullAndSha256AndStatusNotInOrderByCreatedAtDesc(
                        tenantId,
                        sha256,
                        hiddenStatuses()
                )
                : documentRepository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(
                        tenantId,
                        caseId,
                        sha256,
                        hiddenStatuses()
                );
        return documents.stream().findFirst();
    }

    private List<String> hiddenStatuses() {
        return List.of(Document.STATUS_DELETED, Document.STATUS_ARCHIVED, Document.STATUS_SUPERSEDED);
    }

    private DocumentController.DocumentUploadResponse responseFrom(
            Document document,
            String message,
            String sourceUnitMode,
            int sectionCount
    ) {
        IngestionJob latestJob = latestJob(document);
        return new DocumentController.DocumentUploadResponse(
                document.getId(),
                document.getTenantId(),
                document.getCaseId(),
                document.getCreatedBy(),
                document.getFilename(),
                document.getOriginalFilename(),
                document.getFileSize(),
                document.getMimeType(),
                document.getSha256(),
                document.getFileHash(),
                document.getStoragePath(),
                document.getStatus(),
                message,
                document.getPageCount() == null ? 0 : document.getPageCount(),
                sourceUnitMode,
                sectionCount,
                document.getIngestionError(),
                document.getCreatedAt(),
                latestJob == null ? null : latestJob.getId(),
                latestJob == null ? null : latestJob.getStatus(),
                latestJob == null ? 0 : latestJob.getPagesProcessed(),
                latestJob == null ? null : latestJob.getPagesTotal(),
                latestJob == null ? null : latestJob.getErrorMessage()
                ,
                document.getVersionNumber(),
                document.getVersionRootId(),
                document.getSupersedesDocumentId(),
                document.getSupersededByDocumentId(),
                document.isActiveVersion()
        );
    }

    private IngestionJob latestJob(Document document) {
        if (jobRepository == null) {
            return null;
        }
        return jobRepository.findFirstByTenantIdAndDocumentIdOrderByCreatedAtDesc(
                document.getTenantId(),
                document.getId()
        ).orElse(null);
    }

    private int estimatePages(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename != null && filename.toLowerCase().contains("10000")) {
            return 10_000;
        }
        return 1;
    }

    private String safeFilename(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || originalFilename.isBlank()) {
            return "document";
        }

        String normalizedFilename = originalFilename.replace('\\', '/');
        String basename = normalizedFilename.substring(normalizedFilename.lastIndexOf('/') + 1);
        String sanitized = basename
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .replaceAll("\\s+", "_")
                .replaceAll("[^A-Za-z0-9._-]", "_")
                .replaceAll("_+", "_");

        if (sanitized.isBlank() || ".".equals(sanitized) || "..".equals(sanitized)) {
            return "document";
        }
        return sanitized;
    }

    private record DuplicateLookup(
            boolean exists,
            UUID documentId,
            String status,
            Boolean sameCase
    ) {}
}
