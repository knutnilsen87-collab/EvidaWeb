package no.saksrom.api.config;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.security.TenantContextFilter;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.core.env.Environment;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * P0 security:
 * - local-dev mode allows API testing without external IdP.
 * - production must disable local-dev mode and configure OAuth2/JWT.
 */
@Configuration
public class SecurityConfig {

    private final EvidaProperties properties;
    private final Environment environment;

    public SecurityConfig(EvidaProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            CurrentUserService currentUserService,
            AuditService auditService
    ) throws Exception {
        TenantContextFilter tenantContextFilter = new TenantContextFilter(currentUserService, auditService);

        boolean localDevMode = LocalDevMode.isActive(properties, environment);

        if (localDevMode) {
            return http
                    .csrf(csrf -> csrf.disable())
                    .cors(Customizer.withDefaults())
                    .headers(headers -> headers
                            .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'; frame-ancestors 'none'"))
                            .frameOptions(frame -> frame.deny())
                            .contentTypeOptions(Customizer.withDefaults())
                    )
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .addFilterAfter(tenantContextFilter, BearerTokenAuthenticationFilter.class)
                    .build();
        }

        return http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'; frame-ancestors 'none'"))
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(Customizer.withDefaults())
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health").permitAll()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterAfter(tenantContextFilter, BearerTokenAuthenticationFilter.class)
                .build();
    }
}
