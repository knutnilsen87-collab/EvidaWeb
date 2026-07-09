package no.saksrom.api.policy;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PolicyControllerTest {
    @Test
    void defaultPolicyIsLocalFirstAndNoProviderCalls() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );

        var response = new PolicyController(props).effectivePolicy();

        assertTrue(response.localFirst());
        assertFalse(response.rawDocumentUploadAllowed());
        assertFalse(response.aiProviderCallsEnabled());
    }
}
