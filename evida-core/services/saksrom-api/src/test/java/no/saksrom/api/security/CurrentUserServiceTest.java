package no.saksrom.api.security;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
