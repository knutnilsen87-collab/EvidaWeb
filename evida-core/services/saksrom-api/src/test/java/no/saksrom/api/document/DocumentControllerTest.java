package no.saksrom.api.document;

import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.audit.AuditService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Test;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DocumentControllerTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID OTHER_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001002");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001003");

    @TempDir
    Path quarantineRoot;

    @Test
    void rawUploadIsBlockedByDefaultPolicy() {
        var controller = controller(false);
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "test".getBytes());

        var response = controller.calculateHash(file);

        assertEquals("RAW_UPLOAD_DISABLED_BY_POLICY", response.status());
        assertNull(response.sha256());
    }

    @Test
    void hashingUsesStreamingDigestAndReturnsExpectedSha256() throws Exception {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "case.txt", "text/plain", "abc".getBytes());

        var response = controller.calculateHash(file);

        assertEquals("OK", response.status());
        assertEquals(HexFormat.of().formatHex(controller.streamingSha256(file)), response.sha256());
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", response.sha256());
    }

    @Test
    void uploadValidationRejectsUnsupportedExtensionAndMimeType() {
        var controller = controller(true);
        var badExtension = new MockMultipartFile("file", "case.exe", "application/pdf", "abc".getBytes());
        var badMime = new MockMultipartFile("file", "case.pdf", "application/octet-stream", "abc".getBytes());

        assertEquals("UPLOAD_REJECTED_EXTENSION", controller.calculateHash(badExtension).status());
        assertEquals("UPLOAD_REJECTED_DECLARED_MIME_MISMATCH", controller.calculateHash(badMime).status());
    }

    @Test
    void uploadPlacesDocumentInQuarantineForAuthenticatedTenant() throws Exception {
        var controller = controller(true);
        var file = validPdfFile("case.pdf");

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(TENANT_ID, response.getBody().tenantId());
        assertEquals(USER_ID, response.getBody().createdBy());
        assertEquals("QUARANTINE", response.getBody().status());
        assertEquals("case.pdf", response.getBody().filename());
        assertNotNull(response.getBody().sha256());
        assertFalse(response.getBody().storagePath().contains("case.pdf"));
        assertEquals("PAGE_SOURCE_UNITS", response.getBody().sourceUnitMode());
    }

    @Test
    void uploadRejectsCrossTenantHeaderMismatch() {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "test".getBytes());

        var response = controller.uploadDocument(file, OTHER_TENANT_ID.toString(), null);

        assertEquals(403, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("TENANT_MISMATCH", response.getBody().status());
    }

    @Test
    void uploadRejectsInvalidFileBeforeQuarantine() {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "case.exe", "application/pdf", "test".getBytes());

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("UPLOAD_REJECTED_EXTENSION", response.getBody().status());
    }

    @Test
    void uploadRejectsEmptyFileBeforeQuarantine() {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", new byte[0]);

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("UPLOAD_REJECTED_EMPTY_FILE", response.getBody().status());
    }

    @Test
    void uploadAcceptsOnlyPilotPdfAndTxtIncludingUppercaseExtensions() throws Exception {
        var controller = controller(true);

        var pdfResponse = controller.uploadDocument(validPdfFile("CASE.PDF"), TENANT_ID.toString(), null);
        var txtResponse = controller.uploadDocument(
                new MockMultipartFile("file", "NOTAT.TXT", "text/plain", "Ærlig tekst på norsk".getBytes(StandardCharsets.UTF_8)),
                TENANT_ID.toString(),
                null
        );

        assertEquals(200, pdfResponse.getStatusCode().value());
        assertEquals(200, txtResponse.getStatusCode().value());
    }

    @Test
    void uploadRejectsDocxEvenWhenDeclaredAsDocx() {
        var controller = controller(true);
        byte[] zipHeader = new byte[] {0x50, 0x4b, 0x03, 0x04, 0x14, 0x00};
        var file = new MockMultipartFile(
                "file",
                "prosesskriv.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                zipHeader
        );

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        assertEquals("UPLOAD_REJECTED_EXTENSION", response.getBody().status());
    }

    @Test
    void uploadRejectsSpoofedPdfBeforeQuarantine() {
        var documentRepository = mock(DocumentRepository.class);
        var controller = controller(true, documentRepository);
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "MZ executable".getBytes(StandardCharsets.UTF_8));

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        assertEquals("UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH", response.getBody().status());
        verify(documentRepository, never()).save(any(Document.class));
    }

    @Test
    void uploadRejectionRecordsSafeAuditCodeOnly() {
        var documentRepository = mock(DocumentRepository.class);
        var auditService = mock(AuditService.class);
        var controller = controller(true, documentRepository, auditService);
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "MZ executable".getBytes(StandardCharsets.UTF_8));

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        verify(auditService).record(
                eq(TENANT_ID),
                eq(null),
                eq(USER_ID),
                eq("DOCUMENT_UPLOAD_REJECTED"),
                eq("DOCUMENT"),
                eq(null),
                eq("{\"code\":\"UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH\"}")
        );
    }

    @Test
    void uploadRejectsPdfRenamedTxtAndTxtRenamedPdf() throws Exception {
        var controller = controller(true);
        var pdfAsTxt = new MockMultipartFile("file", "rettsbok.txt", "text/plain", validPdfBytes());
        var txtAsPdf = new MockMultipartFile("file", "notat.pdf", "application/pdf", "Dette er tekst".getBytes(StandardCharsets.UTF_8));

        assertEquals("UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH", controller.uploadDocument(pdfAsTxt, TENANT_ID.toString(), null).getBody().status());
        assertEquals("UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH", controller.uploadDocument(txtAsPdf, TENANT_ID.toString(), null).getBody().status());
    }

    @Test
    void uploadRejectsTruncatedPdfWithPdfSignature() {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "truncated.pdf", "application/pdf", "%PDF-1.7\ntruncated".getBytes(StandardCharsets.UTF_8));

        var response = controller.uploadDocument(file, TENANT_ID.toString(), null);

        assertEquals(400, response.getStatusCode().value());
        assertEquals("UPLOAD_REJECTED_INVALID_PDF", response.getBody().status());
    }

    @Test
    void existsEndpointRejectsInvalidSha256() {
        var controller = controller(true);

        var error = assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> controller.documentExists(TENANT_ID.toString(), "not-a-sha", null)
        );

        assertEquals(400, error.getStatusCode().value());
    }

    @Test
    void existsEndpointIsTenantScoped() {
        var controller = controller(true);
        String missingSha = "a".repeat(64);

        var response = controller.documentExists(TENANT_ID.toString(), missingSha, null);

        assertFalse(response.exists());
        assertNull(response.documentId());
    }

    @Test
    void checkDuplicatesReturnsTenantScopedUniqueResultsInFirstSeenOrder() {
        String existingSha = "a".repeat(64);
        String unknownSha = "b".repeat(64);
        String foreignTenantSha = "c".repeat(64);
        UUID documentId = UUID.fromString("00000000-0000-0000-0000-000000001301");
        var documentRepository = mock(DocumentRepository.class);
        var existing = document(documentId, existingSha, Document.STATUS_QUARANTINE);
        when(documentRepository.findByTenantIdAndSha256InAndStatusNotInOrderByCreatedAtDesc(
                eq(TENANT_ID),
                eq(List.of(existingSha, unknownSha, foreignTenantSha)),
                anyList()
        )).thenReturn(List.of(existing));
        var controller = controller(true, documentRepository);

        var response = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of(
                        existingSha.toUpperCase(),
                        unknownSha,
                        foreignTenantSha,
                        existingSha
                ))
        );

        assertEquals(3, response.size());
        assertEquals(existingSha, response.get(0).sha256());
        assertTrue(response.get(0).exists());
        assertEquals(documentId, response.get(0).documentId());
        assertEquals(Document.STATUS_QUARANTINE, response.get(0).status());
        assertEquals(unknownSha, response.get(1).sha256());
        assertFalse(response.get(1).exists());
        assertNull(response.get(1).documentId());
        assertNull(response.get(1).status());
        assertEquals(foreignTenantSha, response.get(2).sha256());
        assertFalse(response.get(2).exists());
        assertNull(response.get(2).documentId());
        assertNull(response.get(2).status());
    }

    @Test
    void checkDuplicatesIsCaseScopedWhenCaseIdProvided() {
        String sharedSha = "d".repeat(64);
        UUID caseA = UUID.fromString("00000000-0000-0000-0000-000000002001");
        UUID caseB = UUID.fromString("00000000-0000-0000-0000-000000002002");
        UUID documentId = UUID.fromString("00000000-0000-0000-0000-000000001302");
        var documentRepository = mock(DocumentRepository.class);
        var registeredInCaseA = document(documentId, sharedSha, Document.STATUS_QUARANTINE, caseA);
        when(documentRepository.findByTenantIdAndSha256InAndStatusNotInOrderByCreatedAtDesc(
                eq(TENANT_ID),
                eq(List.of(sharedSha)),
                anyList()
        )).thenReturn(List.of(registeredInCaseA));
        var controller = controller(true, documentRepository);

        // Same hash registered in Case A is NOT a duplicate for Case B.
        var caseBResponse = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of(sharedSha), caseB.toString())
        );
        assertEquals(1, caseBResponse.size());
        assertFalse(caseBResponse.get(0).exists());
        assertNull(caseBResponse.get(0).documentId());

        // Same hash registered in Case A IS a duplicate for Case A.
        var caseAResponse = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of(sharedSha), caseA.toString())
        );
        assertEquals(1, caseAResponse.size());
        assertTrue(caseAResponse.get(0).exists());
        assertEquals(documentId, caseAResponse.get(0).documentId());
        assertEquals(Document.STATUS_QUARANTINE, caseAResponse.get(0).status());
    }

    @Test
    void checkDuplicatesWithCaseIdIgnoresTenantWideBlobExistence() {
        var controller = controller(true);
        var file = new MockMultipartFile("file", "case.txt", "text/plain", "shared bytes".getBytes(StandardCharsets.UTF_8));

        // Upload stores a tenant-wide content-addressed blob (repo mock keeps document lookups empty).
        var upload = controller.uploadDocument(file, TENANT_ID.toString(), null);
        assertEquals(200, upload.getStatusCode().value());
        String sha256 = upload.getBody().sha256();

        // Legacy tenant-wide check still reports the blob as existing...
        var tenantWide = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of(sha256))
        );
        assertTrue(tenantWide.get(0).exists());

        // ...but a case-scoped check must not block registration in a case without that hash.
        var caseScoped = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of(sha256), UUID.randomUUID().toString())
        );
        assertFalse(caseScoped.get(0).exists());
    }

    @Test
    void checkDuplicatesRejectsInvalidCaseId() {
        var controller = controller(true);

        var error = assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> controller.checkDuplicates(
                        TENANT_ID.toString(),
                        new DocumentController.DocumentDuplicateCheckRequest(List.of("a".repeat(64)), "not-a-uuid")
                )
        );

        assertEquals(400, error.getStatusCode().value());
        assertEquals("CASE_ID_INVALID", error.getReason());
    }

    @Test
    void uploadRegistersExistingTenantHashAsNewDocumentInAnotherCase() {
        var controller = controller(true);
        UUID caseB = UUID.fromString("00000000-0000-0000-0000-000000002002");
        var file = new MockMultipartFile("file", "fasit.txt", "text/plain", "shared bytes".getBytes(StandardCharsets.UTF_8));

        // First upload seeds the tenant-wide blob (no case).
        var first = controller.uploadDocument(file, TENANT_ID.toString(), null);
        assertEquals(200, first.getStatusCode().value());

        // Same content into Case B must create a Case B document row reusing the blob.
        var second = controller.uploadDocument(file, TENANT_ID.toString(), caseB.toString());
        assertEquals(200, second.getStatusCode().value());
        assertEquals(caseB, second.getBody().caseId());
        assertEquals("QUARANTINE", second.getBody().status());
        assertEquals(first.getBody().sha256(), second.getBody().sha256());
        assertEquals(first.getBody().storagePath(), second.getBody().storagePath());
    }

    @Test
    void checkDuplicatesRejectsMoreThanOneHundredHashes() {
        var controller = controller(true);
        List<String> hashes = IntStream.range(0, 101)
                .mapToObj(index -> String.format("%064x", index))
                .toList();

        var error = assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> controller.checkDuplicates(TENANT_ID.toString(), new DocumentController.DocumentDuplicateCheckRequest(hashes))
        );

        assertEquals(400, error.getStatusCode().value());
        assertTrue(error.getReason().contains("HASHES_LIMIT_EXCEEDED"));
    }

    @Test
    void checkDuplicatesRejectsInvalidSha256() {
        var controller = controller(true);

        var error = assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> controller.checkDuplicates(
                        TENANT_ID.toString(),
                        new DocumentController.DocumentDuplicateCheckRequest(List.of("not-hex"))
                )
        );

        assertEquals(400, error.getStatusCode().value());
        assertEquals("SHA256_INVALID", error.getReason());
    }

    @Test
    void checkDuplicatesAcceptsEmptyList() {
        var controller = controller(true);

        var response = controller.checkDuplicates(
                TENANT_ID.toString(),
                new DocumentController.DocumentDuplicateCheckRequest(List.of())
        );

        assertTrue(response.isEmpty());
    }

    @Test
    void startBatchProcessesEligibleDocuments() {
        var ingestionJobService = mock(IngestionJobService.class);
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("LAWYER"))
        );
        var documentRepository = mock(DocumentRepository.class);

        var controller = new DocumentController(
                new EvidaProperties(
                        EvidaProperties.Security.of(true),
                        EvidaProperties.Ai.of(false),
                        EvidaProperties.Documents.of(true),
                        null
                ),
                currentUserService,
                new DocumentQuarantineService(new LargeDocumentIngestionService(), documentRepository, quarantineRoot.toString()),
                new LargeDocumentIngestionService(),
                ingestionJobService
        );

        UUID docId1 = UUID.randomUUID();
        UUID docId2 = UUID.randomUUID();

        Document doc1 = mock(Document.class);
        Document doc2 = mock(Document.class);
        when(documentRepository.findByIdAndTenantId(docId1, TENANT_ID)).thenReturn(Optional.of(doc1));
        when(documentRepository.findByIdAndTenantId(docId2, TENANT_ID)).thenReturn(Optional.of(doc2));

        var request = new DocumentController.BatchStartRequest(List.of(docId1.toString(), docId2.toString(), "invalid-uuid"));
        var results = controller.startBatch(TENANT_ID.toString(), null, request);

        assertEquals(3, results.size());
        assertEquals("SUCCESS", results.get(0).status());
        assertEquals("SUCCESS", results.get(1).status());
        assertEquals("FAILED", results.get(2).status());
    }

    @Test
    void startBatchRejectsCrossCaseDocuments() {
        var ingestionJobService = mock(IngestionJobService.class);
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("LAWYER"))
        );
        var documentRepository = mock(DocumentRepository.class);

        var controller = new DocumentController(
                new EvidaProperties(
                        EvidaProperties.Security.of(true),
                        EvidaProperties.Ai.of(false),
                        EvidaProperties.Documents.of(true),
                        null
                ),
                currentUserService,
                new DocumentQuarantineService(new LargeDocumentIngestionService(), documentRepository, quarantineRoot.toString()),
                new LargeDocumentIngestionService(),
                ingestionJobService
        );

        UUID docId1 = UUID.randomUUID();
        UUID caseA = UUID.randomUUID();
        UUID caseB = UUID.randomUUID();

        Document doc1 = mock(Document.class);
        when(doc1.getCaseId()).thenReturn(caseA);
        when(documentRepository.findByIdAndTenantId(docId1, TENANT_ID)).thenReturn(Optional.of(doc1));

        var request = new DocumentController.BatchStartRequest(List.of(docId1.toString()));
        var results = controller.startBatch(TENANT_ID.toString(), caseB.toString(), request);

        assertEquals(1, results.size());
        assertEquals("FAILED", results.get(0).status());
        assertTrue(results.get(0).error().contains("does not belong to the active case"));
    }

    private DocumentController controller(boolean rawUploadAllowed) {
        var documentRepository = mock(DocumentRepository.class);
        when(documentRepository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(documentRepository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(any(), any(), anyString(), anyList()))
                .thenReturn(List.of());
        when(documentRepository.findByTenantIdAndCaseIdIsNullAndSha256AndStatusNotInOrderByCreatedAtDesc(any(), anyString(), anyList()))
                .thenReturn(List.of());
        when(documentRepository.findByTenantIdAndSha256AndStatusNotInOrderByCreatedAtDesc(any(), anyString(), anyList()))
                .thenReturn(List.of());
        when(documentRepository.findByTenantIdAndSha256InAndStatusNotInOrderByCreatedAtDesc(any(), anyList(), anyList()))
                .thenReturn(List.of());
        return controller(rawUploadAllowed, documentRepository);
    }

    private DocumentController controller(boolean rawUploadAllowed, DocumentRepository documentRepository) {
        return controller(rawUploadAllowed, documentRepository, null);
    }

    private DocumentController controller(boolean rawUploadAllowed, DocumentRepository documentRepository, AuditService auditService) {
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("LAWYER"))
        );

        return new DocumentController(
                new EvidaProperties(
                        EvidaProperties.Security.of(true),
                        EvidaProperties.Ai.of(false),
                        EvidaProperties.Documents.of(rawUploadAllowed),
                        null
                ),
                currentUserService,
                new DocumentQuarantineService(new LargeDocumentIngestionService(), documentRepository, quarantineRoot.toString()),
                new LargeDocumentIngestionService(),
                mock(IngestionJobService.class),
                new UploadSecurityService(new EvidaProperties(
                        EvidaProperties.Security.of(true),
                        EvidaProperties.Ai.of(false),
                        EvidaProperties.Documents.of(rawUploadAllowed),
                        null
                )),
                auditService
        );
    }

    private Document document(UUID documentId, String sha256, String status) {
        return document(documentId, sha256, status, null);
    }

    private Document document(UUID documentId, String sha256, String status, UUID caseId) {
        var document = new Document(
                documentId,
                TENANT_ID,
                caseId,
                USER_ID,
                "case.pdf",
                "case.pdf",
                "application/pdf",
                4L,
                1,
                sha256,
                TENANT_ID + "/" + sha256.substring(0, 2) + "/" + sha256,
                "QUARANTINE_LOCAL"
        );
        if (Document.STATUS_REJECTED.equals(status)) {
            document.markRejected("rejected");
        } else if (Document.STATUS_ARCHIVED.equals(status)) {
            document.markArchived();
        }
        return document;
    }

    private MockMultipartFile validPdfFile(String filename) throws Exception {
        return new MockMultipartFile("file", filename, "application/pdf", validPdfBytes());
    }

    private byte[] validPdfBytes() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(out);
            return out.toByteArray();
        }
    }
}
