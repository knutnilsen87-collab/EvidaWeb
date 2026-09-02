package no.saksrom.api.canvas;

import jakarta.validation.Valid;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cases/{caseId}/canvas")
public class CaseCanvasController {
    private final CaseCanvasService service;
    private final CurrentUserService currentUserService;
    private final AuthorizationService authorizationService;

    public CaseCanvasController(CaseCanvasService service, CurrentUserService currentUserService, AuthorizationService authorizationService) {
        this.service = service;
        this.currentUserService = currentUserService;
        this.authorizationService = authorizationService;
    }

    @GetMapping
    public CaseCanvasDtos.CaseCanvasResponse get(@PathVariable UUID caseId) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.CASE_CANVAS_READ);
        return service.get(caseId, user);
    }

    @PutMapping
    public CaseCanvasDtos.CaseCanvasResponse save(
            @PathVariable UUID caseId,
            @Valid @RequestBody CaseCanvasDtos.SaveCanvasRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.CASE_CANVAS_WRITE);
        return service.save(caseId, request, user);
    }
}
