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
import java.util.LinkedHashSet;
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

        return new AuthenticatedUser(
                claimUuid(jwt, "tenant_id"),
                claimUuid(jwt, "user_id"),
                email(jwt),
                jwtRoles(jwt)
        );
    }

    private AuthenticatedUser localDevUser() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return new AuthenticatedUser(DEV_TENANT_ID, DEV_USER_ID, Set.of("OWNER", "ADMIN", "AUDITOR", "SECURITY_ADMIN"));
        }

        String tenant = firstHeader(attributes, EVIDA_AUTHENTICATED_TENANT_HEADER);
        String user = firstHeader(attributes, EVIDA_USER_HEADER, USER_HEADER);
        String email = firstHeader(attributes, EVIDA_EMAIL_HEADER);
        String roles = firstHeader(attributes, EVIDA_ROLES_HEADER, ROLES_HEADER);
        return new AuthenticatedUser(
                parseUuidOrDefault(tenant, DEV_TENANT_ID),
                parseUuidOrDefault(user, DEV_USER_ID),
                email == null || email.isBlank() ? "dev@evida.local" : email,
                parseRoles(roles)
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
                parsed.add(String.valueOf(role));
            }
            return parsed;
        }
        String scope = jwt.getClaimAsString("scope");
        return parseRoles(scope);
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

    private Set<String> parseRoles(String value) {
        if (value == null || value.isBlank()) {
            return Set.of("OWNER", "ADMIN", "AUDITOR", "SECURITY_ADMIN");
        }
        return Arrays.stream(value.split("[,\\s]+"))
                .map(String::trim)
                .filter(role -> !role.isBlank())
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
