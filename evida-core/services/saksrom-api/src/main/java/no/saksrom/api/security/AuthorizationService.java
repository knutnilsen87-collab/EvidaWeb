package no.saksrom.api.security;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

@Component
public class AuthorizationService {
    private static final Map<String, Set<Permission>> ROLE_PERMISSIONS = Map.of(
            "TENANT_ADMIN", EnumSet.allOf(Permission.class),
            "SYSTEM_ADMIN", EnumSet.allOf(Permission.class),
            "LAWYER", EnumSet.of(
                    Permission.DOCUMENT_UPLOAD,
                    Permission.DOCUMENT_LIST,
                    Permission.DOCUMENT_READ,
                    Permission.DOCUMENT_APPROVE,
                    Permission.DOCUMENT_REJECT,
                    Permission.DOCUMENT_DELETE,
                    Permission.SOURCE_READ,
                    Permission.SAKSROM_ASK,
                    Permission.CASE_CREATE,
                    Permission.CASE_READ,
                    Permission.CASE_CANVAS_READ,
                    Permission.CASE_CANVAS_WRITE,
                    Permission.CASE_DELETE,
                    Permission.EXPORT_CREATE
            ),
            "CASE_WORKER", EnumSet.of(
                    Permission.DOCUMENT_UPLOAD,
                    Permission.DOCUMENT_LIST,
                    Permission.DOCUMENT_READ,
                    Permission.SOURCE_READ,
                    Permission.SAKSROM_ASK,
                    Permission.CASE_READ,
                    Permission.CASE_CANVAS_READ,
                    Permission.CASE_CANVAS_WRITE
            ),
            "AUDITOR", EnumSet.of(Permission.AUDIT_VERIFY),
            "SECURITY_ADMIN", EnumSet.of(Permission.AUDIT_VERIFY, Permission.ADMIN_TENANT),
            "VIEWER", EnumSet.of(
                    Permission.DOCUMENT_LIST,
                    Permission.DOCUMENT_READ,
                    Permission.SOURCE_READ,
                    Permission.CASE_READ,
                    Permission.CASE_CANVAS_READ
            ),
            "OWNER", EnumSet.allOf(Permission.class),
            "ADMIN", EnumSet.allOf(Permission.class),
            "USER", EnumSet.of(
                    Permission.DOCUMENT_UPLOAD,
                    Permission.DOCUMENT_LIST,
                    Permission.DOCUMENT_READ,
                    Permission.SOURCE_READ,
                    Permission.SAKSROM_ASK,
                    Permission.CASE_READ,
                    Permission.CASE_CANVAS_READ,
                    Permission.CASE_CANVAS_WRITE
            )
    );

    public Set<Permission> permissionsFor(AuthenticatedUser user) {
        EnumSet<Permission> permissions = EnumSet.noneOf(Permission.class);
        for (String role : user.roles()) {
            permissions.addAll(ROLE_PERMISSIONS.getOrDefault(role, Set.of()));
        }
        return permissions;
    }

    public void requirePermission(AuthenticatedUser user, Permission permission) {
        if (!permissionsFor(user).contains(permission)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Missing permission: " + permission);
        }
    }
}
