package no.saksrom.api.security;

import no.saksrom.api.audit.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Autowired
    public AuthController(CurrentUserService currentUserService, AuditService auditService) {
        this.currentUserService = currentUserService;
        this.auditService = auditService;
    }

    AuthController(CurrentUserService currentUserService) {
        this.currentUserService = currentUserService;
        this.auditService = null;
    }

    @GetMapping("/me")
    public AuthenticatedUserDto me() {
        AuthenticatedUser user = currentUserService.currentUser();
        if (auditService != null) {
            auditService.record(
                    user.tenantId(),
                    null,
                    user.userId(),
                    "USER_LOGIN",
                    "USER",
                    user.userId(),
                    "{\"roles\":" + user.roles().size() + "}"
            );
        }
        return new AuthenticatedUserDto(user.userId(), user.email(), user.tenantId(), user.roles());
    }

    public record AuthenticatedUserDto(
            UUID id,
            String email,
            UUID tenantId,
            Set<String> roles
    ) {}
}
