package no.saksrom.api.document;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class LocalDocumentStorageService implements DocumentStorageService {
    private static final Pattern SAFE_TENANT_SEGMENT = Pattern.compile("[0-9a-fA-F-]{36}");
    private static final int BUFFER_SIZE = 8192;

    private final MalwareScanner malwareScanner;
    private final Path quarantineRoot;

    @Autowired
    public LocalDocumentStorageService(
            MalwareScanner malwareScanner,
            @Value("${evida.storage.quarantine-root:./data/quarantine}") String quarantineRoot
    ) {
        this(malwareScanner, Path.of(quarantineRoot));
    }

    LocalDocumentStorageService(MalwareScanner malwareScanner, Path quarantineRoot) {
        this.malwareScanner = malwareScanner;
        this.quarantineRoot = quarantineRoot.toAbsolutePath().normalize();
    }

    @Override
    public StoredDocument storeQuarantineBlob(UUID tenantId, MultipartFile file, long maxFileSizeBytes) {
        String tenantSegment = safeTenantSegment(tenantId);
        Path tempDirectory = resolveUnderRoot(tenantSegment, ".tmp");
        Path tempFile = null;

        try {
            validateDeclaredSize(file, maxFileSizeBytes);
            MalwareScanResult scan = scanBeforeStorage(file);
            if (!scan.clean()) {
                throw switch (scan.status()) {
                    case INFECTED -> new UploadSecurityException("MALWARE_DETECTED", HttpStatus.BAD_REQUEST);
                    case SCAN_UNAVAILABLE -> new UploadSecurityException("MALWARE_SCAN_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
                    case SCAN_FAILED -> new UploadSecurityException("MALWARE_SCAN_FAILED", HttpStatus.SERVICE_UNAVAILABLE);
                    case CLEAN -> new IllegalStateException("Unexpected clean malware scan rejection");
                };
            }

            Files.createDirectories(tempDirectory);
            tempFile = Files.createTempFile(tempDirectory, "upload-", ".tmp");

            StreamedBlob streamed = streamToTempFile(file, tempFile, maxFileSizeBytes);

            String prefix = streamed.sha256().substring(0, 2);
            Path finalDirectory = resolveUnderRoot(tenantSegment, prefix);
            Path finalFile = resolveUnderRoot(tenantSegment, prefix, streamed.sha256());
            Files.createDirectories(finalDirectory);

            boolean reused = Files.exists(finalFile);
            if (reused) {
                Files.deleteIfExists(tempFile);
            } else {
                moveIntoPlace(tempFile, finalFile);
                tempFile = null;
            }

            verifyStoredHash(finalFile, streamed.sha256());
            return new StoredDocument(
                    streamed.sha256(),
                    streamed.size(),
                    quarantineRoot.relativize(finalFile).toString().replace("\\", "/"),
                    reused
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException e) {
            throw new IllegalStateException("Could not write document to quarantine storage", e);
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                    // Best-effort cleanup only; final quarantine files are never left partial.
                }
            }
        }
    }

    private void validateDeclaredSize(MultipartFile file, long maxFileSizeBytes) {
        if (file.getSize() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UPLOAD_REJECTED_EMPTY_FILE");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UPLOAD_REJECTED_FILE_TOO_LARGE");
        }
    }

    private MalwareScanResult scanBeforeStorage(MultipartFile file) throws IOException {
        try (InputStream input = file.getInputStream()) {
            return malwareScanner.scan(input);
        }
    }

    @Override
    public boolean blobExists(UUID tenantId, String sha256) {
        String normalizedSha = normalizeSha256(sha256);
        Path candidate = resolveUnderRoot(safeTenantSegment(tenantId), normalizedSha.substring(0, 2), normalizedSha);
        return Files.isRegularFile(candidate);
    }

    @Override
    public void deleteBlob(UUID tenantId, String sha256) {
        String normalizedSha = normalizeSha256(sha256);
        Path candidate = resolveUnderRoot(safeTenantSegment(tenantId), normalizedSha.substring(0, 2), normalizedSha);
        try {
            Files.deleteIfExists(candidate);
        } catch (IOException e) {
            throw new IllegalStateException("Could not delete quarantined document blob", e);
        }
    }

    @Override
    public Path resolveQuarantinePath(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storage path");
        }
        Path resolved = quarantineRoot.resolve(storagePath).normalize();
        if (!resolved.startsWith(quarantineRoot)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storage path");
        }
        if (!Files.exists(resolved)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Stored document not found");
        }
        return resolved;
    }

    private StreamedBlob streamToTempFile(MultipartFile file, Path tempFile, long maxFileSizeBytes) throws IOException {
        MessageDigest digest = sha256Digest();
        long size = 0;
        byte[] buffer = new byte[BUFFER_SIZE];

        try (InputStream input = file.getInputStream(); OutputStream output = Files.newOutputStream(tempFile)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                size += read;
                if (size > maxFileSizeBytes) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UPLOAD_REJECTED_FILE_TOO_LARGE");
                }
                digest.update(buffer, 0, read);
                output.write(buffer, 0, read);
            }
        }

        return new StreamedBlob(HexFormat.of().formatHex(digest.digest()), size);
    }

    private void moveIntoPlace(Path tempFile, Path finalFile) throws IOException {
        try {
            Files.move(tempFile, finalFile, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicMoveFailure) {
            Files.move(tempFile, finalFile);
        }
    }

    private void verifyStoredHash(Path finalFile, String expectedSha256) throws IOException {
        MessageDigest digest = sha256Digest();
        byte[] buffer = new byte[BUFFER_SIZE];

        try (InputStream input = Files.newInputStream(finalFile)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }

        String actualSha256 = HexFormat.of().formatHex(digest.digest());
        if (!expectedSha256.equals(actualSha256)) {
            throw new IllegalStateException("Stored document hash mismatch");
        }
    }

    private MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private Path resolveUnderRoot(String first, String... more) {
        Path resolved = quarantineRoot.resolve(Path.of(first, more)).normalize();
        if (!resolved.startsWith(quarantineRoot)) {
            throw new IllegalArgumentException("Invalid quarantine storage path");
        }
        return resolved;
    }

    private String safeTenantSegment(UUID tenantId) {
        String tenantSegment = tenantId.toString();
        if (!SAFE_TENANT_SEGMENT.matcher(tenantSegment).matches()) {
            throw new IllegalArgumentException("Invalid tenant storage segment");
        }
        return tenantSegment;
    }

    private String normalizeSha256(String sha256) {
        if (sha256 == null || !sha256.matches("(?i)[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Invalid sha256");
        }
        return sha256.toLowerCase();
    }

    private record StreamedBlob(String sha256, long size) {}
}
