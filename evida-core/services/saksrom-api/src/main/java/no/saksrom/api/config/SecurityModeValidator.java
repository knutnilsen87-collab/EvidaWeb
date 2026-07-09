package no.saksrom.api.config;

import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Fails closed if a production profile is started with local-dev security.
 */
@Component
public class SecurityModeValidator {
    private final EvidaProperties properties;
    private final Environment environment;

    public SecurityModeValidator(EvidaProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @PostConstruct
    void validateSecurityMode() {
        if (properties.security().localDevMode() && isProductionProfile()) {
            throw new IllegalStateException("local-dev-mode cannot be enabled in production");
        }
        if (!properties.security().localDevMode() && isProductionProfile() && !hasJwtTrustConfiguration()) {
            throw new IllegalStateException("production profile requires JWT issuer-uri or jwk-set-uri");
        }
        if (isProductionProfile() && !hasSafeAllowedOrigins()) {
            throw new IllegalStateException("production profile requires explicit non-wildcard allowed origins");
        }
        if (isProductionProfile() && !properties.security().malwareScannerConfigured()) {
            throw new IllegalStateException("production profile requires configured malware scanner");
        }
    }

    private boolean isProductionProfile() {
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(profile -> profile.equalsIgnoreCase("prod") || profile.equalsIgnoreCase("production"));
    }

    private boolean hasJwtTrustConfiguration() {
        return hasText(environment.getProperty("spring.security.oauth2.resourceserver.jwt.issuer-uri"))
                || hasText(environment.getProperty("spring.security.oauth2.resourceserver.jwt.jwk-set-uri"));
    }

    private boolean hasSafeAllowedOrigins() {
        if (properties.security().allowedOrigins() == null || properties.security().allowedOrigins().isEmpty()) {
            return false;
        }
        return properties.security().allowedOrigins().stream()
                .map(String::trim)
                .filter(this::hasText)
                .noneMatch(origin -> "*".equals(origin));
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
