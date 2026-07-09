package no.saksrom.api.enterprise;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class EnterpriseControllerTest {
    @Test
    void readinessBlocksProductionWhenLocalDevModeIsEnabled() {
        var controller = new EnterpriseController(new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        ));

        var readiness = controller.readiness(UUID.randomUUID());

        assertTrue(readiness.localFirst());
        assertTrue(readiness.productionBlocked());
        assertFalse(readiness.rawDocumentUploadAllowed());
        assertFalse(readiness.aiProviderCallsEnabled());
    }

    @Test
    void deviceActivationRequiresStrongFingerprintHash() {
        var controller = new EnterpriseController(new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        ));

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
        var controller = new EnterpriseController(new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        ));

        var decision = controller.evaluateLicense(new EnterpriseController.LicenseEvaluationRequest(
                UUID.randomUUID(),
                10,
                3
        ));

        assertEquals("ACTIVE", decision.status());
        assertEquals(7, decision.availableSeats());
    }
}
