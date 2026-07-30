package no.saksrom.api.casefile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.Permission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cases")
public class CaseFileController {
    private final CaseFileService service;
    private final CurrentUserService currentUserService;
    private final AuthorizationService authorizationService;

    public CaseFileController(
            CaseFileService service,
            CurrentUserService currentUserService,
            AuthorizationService authorizationService
    ) {
        this.service = service;
        this.currentUserService = currentUserService;
        this.authorizationService = authorizationService;
    }

    @PostMapping
    public CaseFileDto createCase(@Valid @RequestBody CreateCaseRequest request) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.CASE_CREATE);
        return service.createCase(request, user);
    }

    @GetMapping
    public List<CaseFileDto> listCases() {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.CASE_READ);
        return service.listCases(user);
    }

    @DeleteMapping("/{caseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCase(@PathVariable UUID caseId) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.CASE_DELETE);
        service.deleteCase(caseId, user);
    }

    public record CreateCaseRequest(
            @NotBlank String title
    ) {}

    public record CaseFileDto(
            UUID id,
            UUID tenantId,
            String title,
            String status,
            boolean localFirst
    ) {}
}
