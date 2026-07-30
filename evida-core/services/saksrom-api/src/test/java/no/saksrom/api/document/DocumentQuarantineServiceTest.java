package no.saksrom.api.document;

import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.audit.AuditService;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class DocumentQuarantineServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID OTHER_CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001102");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001003");

    @TempDir
    Path quarantineRoot;

    @Test
    void caseBoundUploadPersistsQuarantineDocumentWithTenantAndCase() throws Exception {
        var repository = mock(DocumentRepository.class);
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(eq(TENANT_ID), eq(CASE_ID), anyString(), anyList()))
                .thenReturn(List.of());
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository, quarantineRoot.toString());
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "test".getBytes(StandardCharsets.UTF_8));
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));

        var response = service.saveToQuarantine(file, TENANT_ID, user, CASE_ID);
        String expectedSha = sha256("test");

        assertEquals(Document.STATUS_QUARANTINE, response.status());
        assertEquals(TENANT_ID, response.tenantId());
        assertEquals(CASE_ID, response.caseId());
        assertEquals(4L, response.size());
        assertEquals("application/pdf", response.contentType());
        assertEquals(expectedSha, response.sha256());
        assertNotNull(response.storagePath());
        assertTrue(Files.exists(quarantineRoot.resolve(response.storagePath())));
        assertEquals("test", Files.readString(quarantineRoot.resolve(response.storagePath())));
        assertEquals(TENANT_ID + "/" + expectedSha.substring(0, 2) + "/" + expectedSha, response.storagePath());
        verify(repository).save(argThat(document ->
                TENANT_ID.equals(document.getTenantId())
                        && CASE_ID.equals(document.getCaseId())
                        && USER_ID.equals(document.getCreatedBy())
                        && "case.pdf".equals(document.getFilename())
                        && "case.pdf".equals(document.getOriginalFilename())
                        && "application/pdf".equals(document.getMimeType())
                        && document.getFileSize() == 4L
                        && Document.STATUS_QUARANTINE.equals(document.getStatus())
                        && document.getStoragePath().equals(TENANT_ID + "/" + expectedSha.substring(0, 2) + "/" + expectedSha)
                        && document.getFileHash().equals(document.getSha256())
        ));
    }

    @Test
    void tenantLevelUploadPersistsMetadataAndWritesFileWithoutCase() throws Exception {
        var repository = mock(DocumentRepository.class);
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.findByTenantIdAndCaseIdIsNullAndSha256AndStatusNotInOrderByCreatedAtDesc(eq(TENANT_ID), anyString(), anyList()))
                .thenReturn(List.of());
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository, quarantineRoot.toString());
        var file = new MockMultipartFile("file", "..\\bad name.txt", "text/plain", "hello".getBytes(StandardCharsets.UTF_8));
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));

        var response = service.saveToQuarantine(file, TENANT_ID, user, null);
        String expectedSha = sha256("hello");

        assertEquals(Document.STATUS_QUARANTINE, response.status());
        assertNull(response.caseId());
        assertEquals("bad_name.txt", response.filename());
        assertEquals(TENANT_ID + "/" + expectedSha.substring(0, 2) + "/" + expectedSha, response.storagePath());
        assertFalse(response.storagePath().contains("bad_name.txt"));
        assertTrue(Files.exists(quarantineRoot.resolve(response.storagePath())));
        assertEquals("hello", Files.readString(quarantineRoot.resolve(response.storagePath())));
    }

    @Test
    void uploadFilenameSanitizationIsIndependentOfHostPathSeparator() {
        var repository = mock(DocumentRepository.class);
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.findByTenantIdAndCaseIdIsNullAndSha256AndStatusNotInOrderByCreatedAtDesc(eq(TENANT_ID), anyString(), anyList()))
                .thenReturn(List.of());
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository, quarantineRoot.toString());
        var file = new MockMultipartFile("file", "../../unsafe name.txt", "text/plain", "safe".getBytes(StandardCharsets.UTF_8));
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));

        var response = service.saveToQuarantine(file, TENANT_ID, user, null);

        assertEquals("unsafe_name.txt", response.filename());
    }

    @Test
    void duplicateUploadSameTenantAndSameCaseReturnsExistingMetadata() throws Exception {
        var repository = mock(DocumentRepository.class);
        String expectedSha = sha256("duplicate");
        var existing = new Document(
                UUID.fromString("00000000-0000-0000-0000-000000001301"),
                TENANT_ID,
                CASE_ID,
                USER_ID,
                "case.pdf",
                "case.pdf",
                "application/pdf",
                9L,
                1,
                expectedSha,
                TENANT_ID + "/" + expectedSha.substring(0, 2) + "/" + expectedSha,
                "QUARANTINE_LOCAL"
        );
        when(repository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(eq(TENANT_ID), eq(CASE_ID), eq(expectedSha), anyList()))
                .thenReturn(List.of(existing));
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository, quarantineRoot.toString());
        var file = new MockMultipartFile("file", "copy.pdf", "application/pdf", "duplicate".getBytes(StandardCharsets.UTF_8));
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));

        var response = service.saveToQuarantine(file, TENANT_ID, user, CASE_ID);

        assertEquals(existing.getId(), response.id());
        assertEquals(Document.STATUS_QUARANTINE, response.status());
        assertEquals(expectedSha, response.sha256());
        verify(repository, never()).save(any(Document.class));
    }

    @Test
    void duplicateUploadSameTenantDifferentCaseReusesBlobButCreatesCaseMetadata() throws Exception {
        var repository = mock(DocumentRepository.class);
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.findByTenantIdAndCaseIdAndSha256AndStatusNotInOrderByCreatedAtDesc(any(), any(), anyString(), anyList()))
                .thenReturn(List.of());
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository, quarantineRoot.toString());
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));
        var first = new MockMultipartFile("file", "first.pdf", "application/pdf", "same blob".getBytes(StandardCharsets.UTF_8));
        var second = new MockMultipartFile("file", "second.pdf", "application/pdf", "same blob".getBytes(StandardCharsets.UTF_8));

        var firstResponse = service.saveToQuarantine(first, TENANT_ID, user, CASE_ID);
        var secondResponse = service.saveToQuarantine(second, TENANT_ID, user, OTHER_CASE_ID);

        assertEquals(CASE_ID, firstResponse.caseId());
        assertEquals(OTHER_CASE_ID, secondResponse.caseId());
        assertEquals(firstResponse.sha256(), secondResponse.sha256());
        assertEquals(firstResponse.storagePath(), secondResponse.storagePath());
        assertEquals(Document.STATUS_QUARANTINE, secondResponse.status());

        ArgumentCaptor<Document> captor = ArgumentCaptor.forClass(Document.class);
        verify(repository, times(2)).save(captor.capture());
        assertEquals(List.of(CASE_ID, OTHER_CASE_ID), captor.getAllValues().stream().map(Document::getCaseId).toList());
    }

    @Test
    void rejectAndArchiveUseTenantScopedLookup() {
        var repository = mock(DocumentRepository.class);
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository);
        UUID documentId = UUID.fromString("00000000-0000-0000-0000-000000001202");
        var document = document(documentId);
        when(repository.findByIdAndTenantId(documentId, TENANT_ID)).thenReturn(java.util.Optional.of(document));
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var rejected = service.rejectDocument(documentId, TENANT_ID, "Feil dokument");

        assertEquals(Document.STATUS_REJECTED, rejected.status());
        assertEquals("Feil dokument", document.getRejectionReason());
        verify(repository).findByIdAndTenantId(documentId, TENANT_ID);
    }

    @Test
    void archiveUsesTenantScopedLookupAndSetsArchiveStatus() {
        var repository = mock(DocumentRepository.class);
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository);
        UUID documentId = UUID.fromString("00000000-0000-0000-0000-000000001203");
        var document = document(documentId);
        when(repository.findByIdAndTenantId(documentId, TENANT_ID)).thenReturn(java.util.Optional.of(document));
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var archived = service.archiveDocument(documentId, TENANT_ID);

        assertEquals(Document.STATUS_ARCHIVED, archived.status());
        verify(repository).findByIdAndTenantId(documentId, TENANT_ID);
    }

    @Test
    void listDocumentsExcludesDeletedAndArchivedStatusesByDefault() {
        var repository = mock(DocumentRepository.class);
        var service = new DocumentQuarantineService(new LargeDocumentIngestionService(), repository);

        service.listDocuments(TENANT_ID, null);

        verify(repository).findByTenantIdAndStatusNotInOrderByCreatedAtDesc(
                eq(TENANT_ID),
                eq(java.util.List.of(Document.STATUS_DELETED, Document.STATUS_ARCHIVED, Document.STATUS_SUPERSEDED))
        );
    }

    @Test
    void replacementCreatesNewActiveVersionInvalidatesOldSourcesAndAudits() throws Exception {
        var repository = mock(DocumentRepository.class);
        var sourceUnits = mock(DocumentSourceUnitRepository.class);
        var audit = mock(AuditService.class);
        var storage = new LocalDocumentStorageService(new DevBypassMalwareScanner(), quarantineRoot);
        var service = new DocumentQuarantineService(
                new LargeDocumentIngestionService(),
                repository,
                storage,
                null,
                sourceUnits,
                audit
        );
        UUID previousId = UUID.fromString("00000000-0000-0000-0000-000000001204");
        Document previous = document(previousId);
        when(repository.findByIdAndTenantIdForUpdate(previousId, TENANT_ID)).thenReturn(java.util.Optional.of(previous));
        when(repository.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var user = new AuthenticatedUser(TENANT_ID, USER_ID, "jurist@firma.no", Set.of("USER"));
        var replacementFile = new MockMultipartFile(
                "file",
                "case-v2.txt",
                "text/plain",
                "nytt og endret dokumentinnhold".getBytes(StandardCharsets.UTF_8)
        );

        var response = service.replaceDocument(
                previousId,
                replacementFile,
                TENANT_ID,
                user,
                10_000
        );

        assertEquals(2, response.versionNumber());
        assertEquals(previousId, response.supersedesDocumentId());
        assertTrue(response.activeVersion());
        assertEquals(Document.STATUS_SUPERSEDED, previous.getStatus());
        assertFalse(previous.isActiveVersion());
        assertEquals(response.id(), previous.getSupersededByDocumentId());
        verify(repository, times(2)).flush();
        verify(sourceUnits).deleteByTenantIdAndDocumentId(TENANT_ID, previousId);
        verify(audit).record(
                eq(TENANT_ID),
                eq(CASE_ID),
                eq(USER_ID),
                eq("SOURCE_OBJECTS_INVALIDATED"),
                eq("DOCUMENT"),
                eq(previousId),
                contains(response.id().toString())
        );
        verify(audit).record(
                eq(TENANT_ID),
                eq(CASE_ID),
                eq(USER_ID),
                eq("DOCUMENT_REPLACED"),
                eq("DOCUMENT"),
                eq(response.id()),
                contains("\"versionNumber\":2")
        );
    }

    private Document document(UUID documentId) {
        return new Document(
                documentId,
                TENANT_ID,
                CASE_ID,
                USER_ID,
                "case.pdf",
                "case.pdf",
                "application/pdf",
                4L,
                1,
                "hash",
                "quarantine/path",
                "QUARANTINE_LOCAL"
        );
    }

    private String sha256(String value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
