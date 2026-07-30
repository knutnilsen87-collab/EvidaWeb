package no.saksrom.api.policy;

import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PolicyControllerTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");

    @Test
    void defaultPolicyIsLocalFirstAndNoProviderCalls() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        ProviderPolicyService providerPolicyService = mock(ProviderPolicyService.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("LAWYER"))
        );
        when(providerPolicyService.effective(TENANT_ID)).thenReturn(
                new ProviderPolicyService.EffectiveProviderPolicy(
                        false, false, false, 0, ProviderPolicyService.AUTHORITY, null, null
                )
        );

        var response = new PolicyController(
                props,
                providerPolicyService,
                currentUserService,
                new AuthorizationService()
        ).effectivePolicy();

        assertTrue(response.localFirst());
        assertFalse(response.rawDocumentUploadAllowed());
        assertFalse(response.aiProviderCallsEnabled());
        assertEquals(ProviderPolicyService.AUTHORITY, response.providerPolicy().authority());
    }

    @Test
    void tenantAdminCanUpdateAuthoritativeProviderPolicy() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(true),
                EvidaProperties.Documents.of(false),
                null
        );
        ProviderPolicyService providerPolicyService = mock(ProviderPolicyService.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        AuthenticatedUser admin = new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("TENANT_ADMIN"));
        when(currentUserService.currentUser()).thenReturn(admin);

        var controller = new PolicyController(
                props,
                providerPolicyService,
                currentUserService,
                new AuthorizationService()
        );
        controller.updateProviderPolicy(new PolicyController.ProviderPolicyUpdateRequest(true, "SEC-123"));

        verify(providerPolicyService).update(admin, true, "SEC-123");
    }
}
