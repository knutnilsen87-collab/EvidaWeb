package no.saksrom.api.security;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CurrentUserServiceTest {
    @Test
    void localDevUserUsesExplicitAuthenticatedTenantHeaderBeforeFallback() {
        var request = new MockHttpServletRequest();
        request.addHeader(CurrentUserService.TENANT_HEADER, "00000000-0000-0000-0000-000000000801");
        request.addHeader(CurrentUserService.EVIDA_TENANT_HEADER, "00000000-0000-0000-0000-000000000802");
        request.addHeader(CurrentUserService.EVIDA_AUTHENTICATED_TENANT_HEADER, "00000000-0000-0000-0000-000000000804");
        request.addHeader(CurrentUserService.EVIDA_USER_HEADER, "00000000-0000-0000-0000-000000000803");
        request.addHeader(CurrentUserService.EVIDA_EMAIL_HEADER, "advokat@firma.no");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        try {
            var service = new CurrentUserService(new EvidaProperties(
                    EvidaProperties.Security.of(true),
                    EvidaProperties.Ai.of(false),
                    EvidaProperties.Documents.of(false),
                    null
            ));

            var user = service.currentUser();

            assertEquals(UUID.fromString("00000000-0000-0000-0000-000000000804"), user.tenantId());
            assertEquals(UUID.fromString("00000000-0000-0000-0000-000000000803"), user.userId());
            assertEquals("advokat@firma.no", user.email());
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    void productionJwtRequiresAcceptedMfaAndRecognizedRole() {
        var environment = new MockEnvironment()
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa,otp")
                .withProperty("evida.security.allowed-roles", "LAWYER,VIEWER");
        var service = new CurrentUserService(productionProperties(), environment);
        Jwt jwt = jwt(Map.of(
                "tenant_id", "00000000-0000-0000-0000-000000000804",
                "user_id", "00000000-0000-0000-0000-000000000803",
                "email", "advokat@firma.no",
                "roles", List.of("LAWYER", "IDP_DEFAULT"),
                "amr", List.of("pwd", "mfa")
        ));
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        try {
            AuthenticatedUser user = service.currentUser();
            assertEquals(Set.of("LAWYER"), user.roles());
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void productionJwtWithoutMfaEvidenceFailsClosed() {
        var environment = new MockEnvironment()
                .withProperty("evida.security.mfa-required", "true")
                .withProperty("evida.security.mfa-accepted-amr", "mfa")
                .withProperty("evida.security.allowed-roles", "LAWYER");
        var service = new CurrentUserService(productionProperties(), environment);
        Jwt jwt = jwt(Map.of(
                "tenant_id", "00000000-0000-0000-0000-000000000804",
                "user_id", "00000000-0000-0000-0000-000000000803",
                "roles", List.of("LAWYER"),
                "amr", List.of("pwd")
        ));
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        try {
            assertThrows(IllegalStateException.class, service::currentUser);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void productionJwtWithoutRecognizedRoleFailsClosed() {
        var environment = new MockEnvironment()
                .withProperty("evida.security.allowed-roles", "LAWYER,VIEWER");
        var service = new CurrentUserService(productionProperties(), environment);
        Jwt jwt = jwt(Map.of(
                "tenant_id", "00000000-0000-0000-0000-000000000804",
                "user_id", "00000000-0000-0000-0000-000000000803",
                "roles", List.of("IDP_DEFAULT")
        ));
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        try {
            assertThrows(IllegalStateException.class, service::currentUser);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void productionJwtWithoutAnyRoleClaimFailsClosedWithoutDevRoleFallback() {
        var environment = new MockEnvironment()
                .withProperty("evida.security.allowed-roles", "OWNER,LAWYER");
        var service = new CurrentUserService(productionProperties(), environment);
        Jwt jwt = jwt(Map.of(
                "tenant_id", "00000000-0000-0000-0000-000000000804",
                "user_id", "00000000-0000-0000-0000-000000000803"
        ));
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        try {
            assertThrows(IllegalStateException.class, service::currentUser);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private EvidaProperties productionProperties() {
        return new EvidaProperties(
                EvidaProperties.Security.of(false),
                EvidaProperties.Ai.of(false),
                EvidaProperties.Documents.of(false),
                null
        );
    }

    private Jwt jwt(Map<String, Object> claims) {
        return new Jwt(
                "token",
                Instant.now().minusSeconds(60),
                Instant.now().plusSeconds(300),
                Map.of("alg", "none"),
                claims
        );
    }

    private JwtAuthenticationToken authenticated(Jwt jwt) {
        return new JwtAuthenticationToken(
                jwt,
                List.of(new SimpleGrantedAuthority("ROLE_AUTHENTICATED"))
        );
    }
}
