package no.saksrom.api.document;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class LocalDocumentStorageServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID OTHER_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001002");

    @TempDir
    Path quarantineRoot;

    @Test
    void storesBlobUnderTenantAndContentAddressedPath() throws Exception {
        var storage = storage();
        var file = new MockMultipartFile("file", "../../evil.pdf", "application/pdf", "legal text".getBytes(StandardCharsets.UTF_8));
        String expectedSha = sha256("legal text");

        var stored = storage.storeQuarantineBlob(TENANT_ID, file, 1024);

        assertEquals(expectedSha, stored.sha256());
        assertEquals("legal text".length(), stored.size());
        assertEquals(TENANT_ID + "/" + expectedSha.substring(0, 2) + "/" + expectedSha, stored.storagePath());
        assertFalse(stored.storagePath().contains("evil.pdf"));
        assertTrue(storage.resolveQuarantinePath(stored.storagePath()).startsWith(quarantineRoot.toAbsolutePath().normalize()));
        assertEquals("legal text", Files.readString(quarantineRoot.resolve(stored.storagePath())));
    }

    @Test
    void duplicateBlobForSameTenantIsReusedWithoutRewritingFinalFile() throws Exception {
        var storage = storage();
        var first = new MockMultipartFile("file", "case.pdf", "application/pdf", "same".getBytes(StandardCharsets.UTF_8));
        var second = new MockMultipartFile("file", "copy.pdf", "application/pdf", "same".getBytes(StandardCharsets.UTF_8));

        var firstStored = storage.storeQuarantineBlob(TENANT_ID, first, 1024);
        Path finalPath = quarantineRoot.resolve(firstStored.storagePath());
        long firstModified = Files.getLastModifiedTime(finalPath).toMillis();
        var secondStored = storage.storeQuarantineBlob(TENANT_ID, second, 1024);

        assertFalse(firstStored.reusedExistingBlob());
        assertTrue(secondStored.reusedExistingBlob());
        assertEquals(firstStored.storagePath(), secondStored.storagePath());
        assertEquals(firstModified, Files.getLastModifiedTime(finalPath).toMillis());
    }

    @Test
    void blobExistsIsTenantIsolated() {
        var storage = storage();
        var file = new MockMultipartFile("file", "case.txt", "text/plain", "tenant secret".getBytes(StandardCharsets.UTF_8));

        var stored = storage.storeQuarantineBlob(TENANT_ID, file, 1024);

        assertTrue(storage.blobExists(TENANT_ID, stored.sha256()));
        assertFalse(storage.blobExists(OTHER_TENANT_ID, stored.sha256()));
    }

    @Test
    void deletesOnlyTheTenantScopedContentAddressedBlob() {
        var storage = storage();
        var tenantFile = new MockMultipartFile("file", "case.txt", "text/plain", "tenant secret".getBytes(StandardCharsets.UTF_8));
        var otherTenantFile = new MockMultipartFile("file", "case.txt", "text/plain", "tenant secret".getBytes(StandardCharsets.UTF_8));
        var tenantStored = storage.storeQuarantineBlob(TENANT_ID, tenantFile, 1024);
        storage.storeQuarantineBlob(OTHER_TENANT_ID, otherTenantFile, 1024);

        storage.deleteBlob(TENANT_ID, tenantStored.sha256());

        assertFalse(storage.blobExists(TENANT_ID, tenantStored.sha256()));
        assertTrue(storage.blobExists(OTHER_TENANT_ID, tenantStored.sha256()));
    }

    @Test
    void rejectsEmptyFileDuringStreaming() {
        var storage = storage();
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", new byte[0]);

        var error = assertThrows(ResponseStatusException.class, () -> storage.storeQuarantineBlob(TENANT_ID, file, 1024));

        assertEquals(400, error.getStatusCode().value());
        assertEquals("UPLOAD_REJECTED_EMPTY_FILE", error.getReason());
    }

    @Test
    void acceptsNormalLegalPdfSizeUnderEvidaLimit() {
        // DEFECT-P5-1 regression companion: a 2.1MB PDF is a normal legal document and must
        // pass EVIDA's streaming validation when under the configured max (100MB policy).
        var storage = storage();
        byte[] normalLegalPdfSize = new byte[2_100_000];
        java.util.Arrays.fill(normalLegalPdfSize, (byte) 'a');
        var file = new MockMultipartFile("file", "stevning.pdf", "application/pdf", normalLegalPdfSize);

        var stored = storage.storeQuarantineBlob(TENANT_ID, file, 104_857_600L);

        assertEquals(2_100_000L, stored.size());
        assertFalse(stored.reusedExistingBlob());
    }

    @Test
    void rejectsOversizeFileDuringStreaming() {
        var storage = storage();
        var file = new MockMultipartFile("file", "case.pdf", "application/pdf", "abcdef".getBytes(StandardCharsets.UTF_8));

        var error = assertThrows(ResponseStatusException.class, () -> storage.storeQuarantineBlob(TENANT_ID, file, 5));

        assertEquals(400, error.getStatusCode().value());
        assertEquals("UPLOAD_REJECTED_FILE_TOO_LARGE", error.getReason());
    }

    @Test
    void rejectsInfectedFileBeforeFinalStorage() {
        var storage = new LocalDocumentStorageService(file -> MalwareScanResult.infected("test"), quarantineRoot);
        var file = new MockMultipartFile("file", "case.txt", "text/plain", "EICAR test fixture".getBytes(StandardCharsets.UTF_8));

        var error = assertThrows(UploadSecurityException.class, () -> storage.storeQuarantineBlob(TENANT_ID, file, 1024));

        assertEquals("MALWARE_DETECTED", error.code());
        assertEquals(400, error.httpStatus().value());
        assertFalse(Files.exists(quarantineRoot.resolve(TENANT_ID.toString()).resolve(sha256Unchecked("EICAR test fixture").substring(0, 2))));
    }

    @Test
    void failsClosedWhenScannerUnavailableOrFailed() {
        var unavailable = new LocalDocumentStorageService(file -> MalwareScanResult.unavailable("test"), quarantineRoot);
        var failed = new LocalDocumentStorageService(file -> MalwareScanResult.failed("test"), quarantineRoot);
        var file = new MockMultipartFile("file", "case.txt", "text/plain", "tekst".getBytes(StandardCharsets.UTF_8));

        var unavailableError = assertThrows(UploadSecurityException.class, () -> unavailable.storeQuarantineBlob(TENANT_ID, file, 1024));
        var failedError = assertThrows(UploadSecurityException.class, () -> failed.storeQuarantineBlob(TENANT_ID, file, 1024));

        assertEquals("MALWARE_SCAN_UNAVAILABLE", unavailableError.code());
        assertEquals(503, unavailableError.httpStatus().value());
        assertEquals("MALWARE_SCAN_FAILED", failedError.code());
        assertEquals(503, failedError.httpStatus().value());
    }

    private LocalDocumentStorageService storage() {
        return new LocalDocumentStorageService(new DevBypassMalwareScanner(), quarantineRoot);
    }

    private String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private String sha256Unchecked(String value) {
        try {
            return sha256(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
