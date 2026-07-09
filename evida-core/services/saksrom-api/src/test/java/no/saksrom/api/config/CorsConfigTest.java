package no.saksrom.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression guard for the post-upload 403 defect: the CORS allowlist must use the same
 * local-dev detection as the security chain. When local dev is active only via the dev
 * profile (bound property false), browser POSTs used to fail with 403 "Invalid CORS request"
 * even though the API itself was permitAll.
 */
class CorsConfigTest {

    @Test
    void devProfileAddsLocalDevOriginsEvenWhenPropertyIsFalse() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        List<String> origins = allowedOrigins(properties(false, List.of()), environment);

        assertTrue(origins.contains("http://127.0.0.1:5173"), "dev profile must allow the local dev origin");
        assertTrue(origins.contains("http://localhost:5173"), "dev profile must allow the localhost variant");
    }

    @Test
    void productionModeUsesOnlyConfiguredOrigins() {
        MockEnvironment environment = new MockEnvironment();

        List<String> origins = allowedOrigins(
                properties(false, List.of("https://app.evida.no")),
                environment
        );

        assertEquals(List.of("https://app.evida.no"), origins,
                "production must not receive implicit local dev origins");
    }

    @Test
    void productionModeWithNoConfiguredOriginsStaysEmpty() {
        MockEnvironment environment = new MockEnvironment();

        List<String> origins = allowedOrigins(properties(false, List.of()), environment);

        assertTrue(origins.isEmpty(), "no implicit origins outside local dev");
    }

    @Test
    void localDevPropertyAddsDevOriginsWithoutDuplicatingConfiguredOnes() {
        MockEnvironment environment = new MockEnvironment();

        List<String> origins = allowedOrigins(
                properties(true, List.of("http://127.0.0.1:5173", "https://staging.evida.no")),
                environment
        );

        assertEquals(1, origins.stream().filter("http://127.0.0.1:5173"::equals).count());
        assertTrue(origins.contains("https://staging.evida.no"));
        assertTrue(origins.contains("http://localhost:5173"));
    }

    private List<String> allowedOrigins(EvidaProperties properties, MockEnvironment environment) {
        UrlBasedCorsConfigurationSource source = (UrlBasedCorsConfigurationSource)
                new CorsConfig().corsConfigurationSource(properties, environment);
        CorsConfiguration config = source.getCorsConfigurations().get("/api/**");
        assertNotNull(config, "CORS must be registered for /api/**");
        List<String> origins = config.getAllowedOrigins();
        return origins == null ? List.of() : origins;
    }

    private EvidaProperties properties(boolean localDevMode, List<String> allowedOrigins) {
        return new EvidaProperties(
                new EvidaProperties.Security(localDevMode, allowedOrigins, false),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                new EvidaProperties.Parser()
        );
    }
}
