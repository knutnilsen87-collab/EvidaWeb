package no.saksrom.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SecurityModeValidatorTest {
    @Test
    void productionProfileRejectsLocalDevMode() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment().withProperty("spring.profiles.active", "prod");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void devProfileAllowsLocalDevMode() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        var validator = new SecurityModeValidator(props, environment);

        assertDoesNotThrow(validator::validateSecurityMode);
    }

    @Test
    void productionProfileRequiresJwtTrustConfiguration() {
        var props = new EvidaProperties(
                EvidaProperties.Security.of(false),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void productionProfileAllowsConfiguredJwtIssuer() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("https://app.evida.example"), true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "https://issuer.example.test")
                .withProperty("evida.storage.encryption-attested", "true")
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa,otp")
                .withProperty("evida.security.allowed-roles", "LAWYER,VIEWER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertDoesNotThrow(validator::validateSecurityMode);
    }

    @Test
    void productionProfileRejectsWildcardCorsOrigin() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("*"), true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "https://issuer.example.test")
                .withProperty("evida.storage.encryption-attested", "true")
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void productionProfileRejectsMissingMalwareScanner() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("https://app.evida.example"), false),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "https://issuer.example.test")
                .withProperty("evida.storage.encryption-attested", "true")
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void productionProfileRejectsUnattestedStorageEncryption() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("https://app.evida.example"), true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "https://issuer.example.test")
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void productionProfileRejectsMissingMfaEnforcement() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("https://app.evida.example"), true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "https://issuer.example.test")
                .withProperty("evida.storage.encryption-attested", "true")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }

    @Test
    void productionProfileRejectsHttpIssuer() {
        var props = new EvidaProperties(
                new EvidaProperties.Security(false, List.of("https://app.evida.example"), true),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
        var environment = new MockEnvironment()
                .withProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri", "http://issuer.example.test")
                .withProperty("evida.storage.encryption-attested", "true")
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        environment.setActiveProfiles("prod");

        var validator = new SecurityModeValidator(props, environment);

        assertThrows(IllegalStateException.class, validator::validateSecurityMode);
    }
}
