package no.saksrom.api.enterprise;

import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.policy.ProviderPolicyService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EnterpriseControllerTest {
    @Test
    void readinessBlocksProductionWhenLocalDevModeIsEnabled() {
        UUID tenantId = UUID.randomUUID();
        var providerPolicyService = mock(ProviderPolicyService.class);
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(tenantId, UUID.randomUUID(), "admin@evida.local", Set.of("ADMIN"))
        );
        when(providerPolicyService.effective(tenantId)).thenReturn(new ProviderPolicyService.EffectiveProviderPolicy(
                false, false, false, 0, ProviderPolicyService.AUTHORITY, null, null
        ));
        var controller = controller(providerPolicyService, currentUserService);

        var readiness = controller.readiness(tenantId);

        assertTrue(readiness.localFirst());
        assertTrue(readiness.productionBlocked());
        assertFalse(readiness.rawDocumentUploadAllowed());
        assertFalse(readiness.aiProviderCallsEnabled());
        assertEquals(tenantId, readiness.tenantId());
    }

    @Test
    void readinessRejectsCrossTenantQuery() {
        UUID authenticatedTenantId = UUID.randomUUID();
        var providerPolicyService = mock(ProviderPolicyService.class);
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(authenticatedTenantId, UUID.randomUUID(), "admin@evida.local", Set.of("ADMIN"))
        );

        var exception = assertThrows(
                ResponseStatusException.class,
                () -> controller(providerPolicyService, currentUserService).readiness(UUID.randomUUID())
        );

        assertEquals(403, exception.getStatusCode().value());
    }

    @Test
    void deviceActivationRequiresStrongFingerprintHash() {
        var controller = controller(mock(ProviderPolicyService.class), mock(CurrentUserService.class));

        var denied = controller.evaluateDevice(new EnterpriseController.DeviceActivationRequest(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "short",
                "0.1.0",
                "windows"
        ));
        var allowed = controller.evaluateDevice(new EnterpriseController.DeviceActivationRequest(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "0123456789abcdef0123456789abcdef",
                "0.1.0",
                "windows"
        ));

        assertEquals("DENIED", denied.status());
        assertEquals("ALLOWED", allowed.status());
    }

    @Test
    void licenseEvaluationReportsCapacity() {
        var controller = controller(mock(ProviderPolicyService.class), mock(CurrentUserService.class));

        var decision = controller.evaluateLicense(new EnterpriseController.LicenseEvaluationRequest(
                UUID.randomUUID(),
                10,
                3
        ));

        assertEquals("ACTIVE", decision.status());
        assertEquals(7, decision.availableSeats());
    }

    private EnterpriseController controller(
            ProviderPolicyService providerPolicyService,
            CurrentUserService currentUserService
    ) {
        return new EnterpriseController(
                new EvidaProperties(
                        EvidaProperties.Security.of(true),
                        EvidaProperties.Ai.of(false),
                        EvidaProperties.Documents.of(false),
                        null
                ),
                providerPolicyService,
                currentUserService
        );
    }
}
