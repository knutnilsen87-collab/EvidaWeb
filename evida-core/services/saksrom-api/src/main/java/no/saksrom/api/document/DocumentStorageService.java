package no.saksrom.api.document;

import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.UUID;

public interface DocumentStorageService {
    StoredDocument storeQuarantineBlob(UUID tenantId, MultipartFile file, long maxFileSizeBytes);

    boolean blobExists(UUID tenantId, String sha256);

    void deleteBlob(UUID tenantId, String sha256);

    Path resolveQuarantinePath(String storagePath);

    record StoredDocument(
            String sha256,
            long size,
            String storagePath,
            boolean reusedExistingBlob
    ) {}
}
