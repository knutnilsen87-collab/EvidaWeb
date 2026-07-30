package no.saksrom.api.security;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthorizationServiceTest {
    private final AuthorizationService service = new AuthorizationService();

    @Test
    void viewerCanReadButCannotUploadDeleteOrAskAi() {
        AuthenticatedUser viewer = user("VIEWER");

        assertDoesNotThrow(() -> service.requirePermission(viewer, Permission.DOCUMENT_READ));
        assertDoesNotThrow(() -> service.requirePermission(viewer, Permission.SOURCE_READ));
        assertThrows(ResponseStatusException.class, () -> service.requirePermission(viewer, Permission.DOCUMENT_UPLOAD));
        assertThrows(ResponseStatusException.class, () -> service.requirePermission(viewer, Permission.DOCUMENT_DELETE));
        assertThrows(ResponseStatusException.class, () -> service.requirePermission(viewer, Permission.SAKSROM_ASK));
    }

    @Test
    void lawyerCanRunCaseWorkflowButCannotAdminTenant() {
        AuthenticatedUser lawyer = user("LAWYER");

        assertDoesNotThrow(() -> service.requirePermission(lawyer, Permission.CASE_CREATE));
        assertDoesNotThrow(() -> service.requirePermission(lawyer, Permission.CASE_DELETE));
        assertDoesNotThrow(() -> service.requirePermission(lawyer, Permission.DOCUMENT_APPROVE));
        assertDoesNotThrow(() -> service.requirePermission(lawyer, Permission.SAKSROM_ASK));
        assertThrows(ResponseStatusException.class, () -> service.requirePermission(lawyer, Permission.ADMIN_TENANT));
    }

    @Test
    void auditorCanVerifyAuditButCannotReadClientDocuments() {
        AuthenticatedUser auditor = user("AUDITOR");

        assertDoesNotThrow(() -> service.requirePermission(auditor, Permission.AUDIT_VERIFY));
        assertThrows(ResponseStatusException.class, () -> service.requirePermission(auditor, Permission.DOCUMENT_READ));
    }

    private AuthenticatedUser user(String role) {
        return new AuthenticatedUser(
                UUID.fromString("00000000-0000-0000-0000-000000000101"),
                UUID.fromString("00000000-0000-0000-0000-000000000102"),
                role.toLowerCase() + "@evida.test",
                Set.of(role)
        );
    }
}
