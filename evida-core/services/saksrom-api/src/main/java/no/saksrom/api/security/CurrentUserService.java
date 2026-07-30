package no.saksrom.api.security;

import no.saksrom.api.config.EvidaProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class CurrentUserService {
    public static final String EVIDA_TENANT_HEADER = "X-Evida-Tenant-ID";
    public static final String EVIDA_AUTHENTICATED_TENANT_HEADER = "X-Evida-Authenticated-Tenant-ID";
    public static final String EVIDA_USER_HEADER = "X-Evida-User-ID";
    public static final String EVIDA_EMAIL_HEADER = "X-Evida-User-Email";
    public static final String EVIDA_ROLES_HEADER = "X-Evida-Roles";

    public static final String TENANT_HEADER = "X-Saksrom-Tenant-Id";
    public static final String USER_HEADER = "X-Saksrom-User-Id";
    public static final String ROLES_HEADER = "X-Saksrom-Roles";

    private static final UUID DEV_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID DEV_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");
    private static final Set<String> DEV_DEFAULT_ROLES = Set.of("OWNER", "ADMIN", "AUDITOR", "SECURITY_ADMIN");

    private final EvidaProperties properties;
    private final Environment environment;

    @Autowired
    public CurrentUserService(EvidaProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public CurrentUserService(EvidaProperties properties) {
        this(properties, new StandardEnvironment());
    }

    public AuthenticatedUser currentUser() {
        if (properties.security().localDevMode() || isDevProfile()) {
            return localDevUser();
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            throw new IllegalStateException("Authenticated JWT principal is required");
        }

        validateMfa(jwt);
        Set<String> roles = authorizedJwtRoles(jwt);
        return new AuthenticatedUser(
                claimUuid(jwt, "tenant_id"),
                claimUuid(jwt, "user_id"),
                email(jwt),
                roles
        );
    }

    private AuthenticatedUser localDevUser() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return new AuthenticatedUser(DEV_TENANT_ID, DEV_USER_ID, DEV_DEFAULT_ROLES);
        }

        String tenant = firstHeader(attributes, EVIDA_AUTHENTICATED_TENANT_HEADER);
        String user = firstHeader(attributes, EVIDA_USER_HEADER, USER_HEADER);
        String email = firstHeader(attributes, EVIDA_EMAIL_HEADER);
        String roles = firstHeader(attributes, EVIDA_ROLES_HEADER, ROLES_HEADER);
        return new AuthenticatedUser(
                parseUuidOrDefault(tenant, DEV_TENANT_ID),
                parseUuidOrDefault(user, DEV_USER_ID),
                email == null || email.isBlank() ? "dev@evida.local" : email,
                roles == null || roles.isBlank() ? DEV_DEFAULT_ROLES : parseValues(roles)
        );
    }

    private String firstHeader(ServletRequestAttributes attributes, String... names) {
        for (String name : names) {
            String value = attributes.getRequest().getHeader(name);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private UUID claimUuid(Jwt jwt, String claim) {
        String value = jwt.getClaimAsString(claim);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("JWT claim is required: " + claim);
        }
        return UUID.fromString(value);
    }

    private Set<String> jwtRoles(Jwt jwt) {
        Object roles = jwt.getClaims().get("roles");
        if (roles instanceof Iterable<?> iterable) {
            Set<String> parsed = new LinkedHashSet<>();
            for (Object role : iterable) {
                parsed.add(String.valueOf(role).trim().toUpperCase(Locale.ROOT));
            }
            return parsed;
        }
        if (roles instanceof String roleString) {
            return parseValues(roleString);
        }
        String scope = jwt.getClaimAsString("scope");
        return parseValues(scope);
    }

    private Set<String> authorizedJwtRoles(Jwt jwt) {
        Set<String> presented = jwtRoles(jwt);
        Set<String> allowed = configuredValues("evida.security.allowed-roles");
        if (allowed.isEmpty()) {
            return presented;
        }
        Set<String> recognized = presented.stream()
                .map(role -> role.toUpperCase(Locale.ROOT))
                .filter(allowed::contains)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (recognized.isEmpty()) {
            throw new IllegalStateException("JWT must contain at least one configured EVIDA role");
        }
        return recognized;
    }

    private void validateMfa(Jwt jwt) {
        if (!environment.getProperty("evida.security.mfa-required", Boolean.class, false)) {
            return;
        }
        Set<String> acceptedAmr = configuredValues("evida.security.mfa-accepted-amr");
        Set<String> acceptedAcr = configuredValues("evida.security.mfa-accepted-acr");
        Set<String> presentedAmr = claimValues(jwt.getClaims().get("amr"));
        String acr = jwt.getClaimAsString("acr");
        boolean amrMatch = presentedAmr.stream().anyMatch(acceptedAmr::contains);
        boolean acrMatch = acr != null && acceptedAcr.contains(acr.trim().toUpperCase(Locale.ROOT));
        if (!amrMatch && !acrMatch) {
            throw new IllegalStateException("JWT does not prove required multi-factor authentication");
        }
    }

    private Set<String> configuredValues(String propertyName) {
        return parseValues(environment.getProperty(propertyName));
    }

    private Set<String> claimValues(Object claim) {
        if (claim instanceof Collection<?> values) {
            return values.stream()
                    .map(String::valueOf)
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .map(value -> value.toUpperCase(Locale.ROOT))
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        }
        return parseValues(claim == null ? null : String.valueOf(claim));
    }

    private String email(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        return email == null || email.isBlank() ? "unknown@evida.local" : email;
    }

    private UUID parseUuidOrDefault(String value, UUID fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return UUID.fromString(value);
    }

    private Set<String> parseValues(String value) {
        if (value == null || value.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(value.split("[,\\s]+"))
                .map(String::trim)
                .filter(role -> !role.isBlank())
                .map(role -> role.toUpperCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private boolean isDevProfile() {
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
