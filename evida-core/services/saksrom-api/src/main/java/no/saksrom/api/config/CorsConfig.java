package no.saksrom.api.config;

import no.saksrom.api.security.CurrentUserService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class CorsConfig {
    @Bean
    CorsConfigurationSource corsConfigurationSource(EvidaProperties properties, Environment environment) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins(properties, environment));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(
                "Authorization",
                "Content-Type",
                CurrentUserService.EVIDA_TENANT_HEADER,
                CurrentUserService.EVIDA_AUTHENTICATED_TENANT_HEADER,
                CurrentUserService.EVIDA_USER_HEADER,
                CurrentUserService.EVIDA_EMAIL_HEADER,
                CurrentUserService.EVIDA_ROLES_HEADER,
                "X-Evida-Case-ID"
        ));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    private List<String> allowedOrigins(EvidaProperties properties, Environment environment) {
        List<String> configured = properties.security().allowedOrigins();
        java.util.List<String> origins = new java.util.ArrayList<>();
        if (configured != null) {
            for (String origin : configured) {
                if (origin != null && !origin.isBlank()) {
                    origins.add(origin.trim());
                }
            }
        }
        // Must use the same local-dev detection as SecurityConfig; a bound-property-only check
        // here caused 403 "Invalid CORS request" on every browser POST when local dev was
        // activated via env var or dev profile (see LocalDevMode).
        if (LocalDevMode.isActive(properties, environment)) {
            if (!origins.contains("http://127.0.0.1:5173")) {
                origins.add("http://127.0.0.1:5173");
            }
            if (!origins.contains("http://localhost:5173")) {
                origins.add("http://localhost:5173");
            }
        }
        return List.copyOf(origins);
    }
}
