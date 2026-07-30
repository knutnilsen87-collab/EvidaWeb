package no.saksrom.api.audit;

import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AuditControllerTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID OTHER_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000202");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");
    private static final UUID CASE_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    @Test
    void verifyRejectsTenantMismatch() {
        AuditService service = mock(AuditService.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("AUDITOR")));
        AuditController controller = new AuditController(service, currentUserService);

        assertThatThrownBy(() -> controller.verify(new AuditController.VerifyAuditRequest(OTHER_TENANT_ID, CASE_ID)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("TENANT_MISMATCH");

        verifyNoInteractions(service);
    }

    @Test
    void verifyAuditsVerificationRunWithoutRawContent() {
        AuditService service = mock(AuditService.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("AUDITOR")));
        when(service.verify(TENANT_ID, CASE_ID)).thenReturn(new AuditService.AuditVerification(true, 7, null, null, null));
        AuditController controller = new AuditController(service, currentUserService);

        AuditService.AuditVerification result = controller.verify(new AuditController.VerifyAuditRequest(TENANT_ID, CASE_ID));

        assertThat(result.valid()).isTrue();
        verify(service).record(
                eq(TENANT_ID),
                eq(CASE_ID),
                eq(USER_ID),
                eq("AUDIT_VERIFICATION_RUN"),
                eq("AUDIT"),
                isNull(),
                eq("{\"valid\":true,\"eventCount\":7}")
        );
    }
}
