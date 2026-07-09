package no.saksrom.api.config;

import org.springframework.core.env.Environment;

/**
 * Single source of truth for whether local-dev behavior is active.
 *
 * SecurityConfig and CorsConfig previously disagreed: the security chain honored the bound
 * property, the EVIDA_LOCAL_DEV_MODE env var, the system property and the dev/local profile,
 * while the CORS allowlist only honored the bound property. That asymmetry produced a mode
 * where the API was permitAll but every browser POST failed with 403 "Invalid CORS request".
 */
final class LocalDevMode {
    private LocalDevMode() {
    }

    static boolean isActive(EvidaProperties properties, Environment environment) {
        if (properties.security().localDevMode()) {
            return true;
        }
        if ("true".equalsIgnoreCase(System.getenv("EVIDA_LOCAL_DEV_MODE"))) {
            return true;
        }
        if ("true".equalsIgnoreCase(System.getProperty("evida.security.local-dev-mode"))) {
            return true;
        }
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
