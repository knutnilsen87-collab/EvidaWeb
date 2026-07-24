package no.saksrom.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EvidaPropertiesBindingTest {

    @Test
    void bindsMalwareScannerRuntimeConfigurationToCanonicalSecurityConstructor() {
        var environment = new MockEnvironment()
                .withProperty("evida.security.local-dev-mode", "true")
                .withProperty("evida.security.malware-scanner-configured", "true")
                .withProperty("evida.security.malware-scan-enabled", "true")
                .withProperty("evida.security.malware-scan-host", "127.0.0.1")
                .withProperty("evida.security.malware-scan-port", "3310")
                .withProperty("evida.security.malware-scan-timeout-millis", "5000");

        EvidaProperties properties = Binder.get(environment)
                .bind("evida", Bindable.of(EvidaProperties.class))
                .orElseThrow(() -> new IllegalStateException("Evida properties were not bound"));

        assertTrue(properties.security().malwareScannerConfigured());
        assertTrue(properties.security().malwareScanEnabled());
        assertEquals("127.0.0.1", properties.security().malwareScanHost());
        assertEquals(3310, properties.security().malwareScanPort());
        assertEquals(5000, properties.security().malwareScanTimeoutMillis());
    }
}
