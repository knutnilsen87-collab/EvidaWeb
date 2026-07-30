package no.saksrom.api.courtengine;

import no.saksrom.api.document.DocumentController;
import no.saksrom.api.document.DocumentQuarantineService;
import no.saksrom.api.document.UploadSecurityException;
import no.saksrom.api.document.UploadSecurityService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.Permission;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class CourtEngineController {
    private final CurrentUserService currentUserService;
    private final DocumentQuarantineService quarantineService;
    private final CourtEngineService courtEngineService;
    private final UploadSecurityService uploadSecurityService;
    private final AuthorizationService authorizationService;

    @Autowired
    public CourtEngineController(
            CurrentUserService currentUserService,
            DocumentQuarantineService quarantineService,
            CourtEngineService courtEngineService,
            UploadSecurityService uploadSecurityService,
            AuthorizationService authorizationService
    ) {
        this.currentUserService = currentUserService;
        this.quarantineService = quarantineService;
        this.courtEngineService = courtEngineService;
        this.uploadSecurityService = uploadSecurityService;
        this.authorizationService = authorizationService;
    }

    @PostMapping("/files/upload")
    public FileUploadResponse uploadFiles(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "file", required = false) MultipartFile singleFile
    ) throws Exception {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.DOCUMENT_UPLOAD);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        UUID documentCaseId = parseUuidOrNull(caseId);
        List<MultipartFile> uploads = normalizeFiles(files, singleFile);
        List<String> fileIds = new ArrayList<>();

        for (MultipartFile file : uploads) {
            try {
                uploadSecurityService.validate(file);
            } catch (UploadSecurityException e) {
                throw new ResponseStatusException(e.httpStatus(), e.code(), e);
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
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SAKSROM_ASK);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        return courtEngineService.startAnalysis(tenantId, request.caseId(), request.fileIds());
    }

    @GetMapping("/cases/{caseId}/summary")
    public ResponseEntity<OperativeSummaryResponse> getSummary(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @PathVariable String caseId
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.SOURCE_READ);
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
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
