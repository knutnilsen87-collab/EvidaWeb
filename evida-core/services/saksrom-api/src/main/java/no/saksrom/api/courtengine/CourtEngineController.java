package no.saksrom.api.courtengine;

import no.saksrom.api.document.DocumentController;
import no.saksrom.api.document.DocumentQuarantineService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class CourtEngineController {
    private static final long MAX_FILE_SIZE_BYTES = 100L * 1024L * 1024L;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("pdf", "txt", "doc", "docx", "png", "jpg", "jpeg");
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "application/pdf",
            "text/plain",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/png",
            "image/jpeg"
    );

    private final CurrentUserService currentUserService;
    private final DocumentQuarantineService quarantineService;
    private final CourtEngineService courtEngineService;

    public CourtEngineController(
            CurrentUserService currentUserService,
            DocumentQuarantineService quarantineService,
            CourtEngineService courtEngineService
    ) {
        this.currentUserService = currentUserService;
        this.quarantineService = quarantineService;
        this.courtEngineService = courtEngineService;
    }

    @PostMapping("/files/upload")
    public FileUploadResponse uploadFiles(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "file", required = false) MultipartFile singleFile
    ) throws Exception {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        UUID documentCaseId = parseUuidOrNull(caseId);
        List<MultipartFile> uploads = normalizeFiles(files, singleFile);
        List<String> fileIds = new ArrayList<>();

        for (MultipartFile file : uploads) {
            String validationFailure = validateUpload(file);
            if (validationFailure != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, validationFailure);
            }
            DocumentController.DocumentUploadResponse response = quarantineService.saveToQuarantine(
                    file,
                    tenantId,
                    user,
                    documentCaseId
            );
            fileIds.add(response.id().toString());
        }

        return new FileUploadResponse(fileIds);
    }

    @PostMapping("/analysis/start")
    public CourtEngineService.AnalysisStartResponse startAnalysis(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody AnalysisStartRequest request
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader, currentUserService.currentUser());
        return courtEngineService.startAnalysis(tenantId, request.caseId(), request.fileIds());
    }

    @GetMapping("/cases/{caseId}/summary")
    public ResponseEntity<OperativeSummaryResponse> getSummary(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @PathVariable String caseId
    ) {
        UUID tenantId = requireMatchingTenant(tenantHeader, currentUserService.currentUser());
        return ResponseEntity.ok(courtEngineService.getSummary(tenantId, caseId));
    }

    private UUID requireMatchingTenant(String tenantHeader, AuthenticatedUser user) {
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        return requestedTenant;
    }

    private List<MultipartFile> normalizeFiles(MultipartFile[] files, MultipartFile singleFile) {
        List<MultipartFile> uploads = new ArrayList<>();
        if (files != null) {
            uploads.addAll(List.of(files));
        }
        if (singleFile != null) {
            uploads.add(singleFile);
        }
        if (uploads.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ingen filer mottatt.");
        }
        return uploads;
    }

    private String validateUpload(MultipartFile file) {
        if (file.isEmpty()) {
            return "UPLOAD_REJECTED_EMPTY_FILE";
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            return "UPLOAD_REJECTED_FILE_TOO_LARGE";
        }
        String extension = extension(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            return "UPLOAD_REJECTED_EXTENSION";
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            return "UPLOAD_REJECTED_MIME_TYPE";
        }
        return null;
    }

    private String extension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    private UUID parseUuid(String value, String errorCode) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode, e);
        }
    }

    private UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    public record FileUploadResponse(List<String> fileIds) {}

    public record AnalysisStartRequest(String caseId, List<String> fileIds) {}
}
