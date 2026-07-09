package no.saksrom.api.security;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AuthControllerTest {
    @Test
    void meReturnsAuthenticatedUserAndTenant() {
        var request = new MockHttpServletRequest();
        request.addHeader(CurrentUserService.EVIDA_TENANT_HEADER, "00000000-0000-0000-0000-000000000701");
        request.addHeader(CurrentUserService.EVIDA_AUTHENTICATED_TENANT_HEADER, "00000000-0000-0000-0000-000000000701");
        request.addHeader(CurrentUserService.EVIDA_USER_HEADER, "00000000-0000-0000-0000-000000000702");
        request.addHeader(CurrentUserService.EVIDA_EMAIL_HEADER, "jurist@firma.no");
        request.addHeader(CurrentUserService.EVIDA_ROLES_HEADER, "USER AUDITOR");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        try {
            var service = new CurrentUserService(new EvidaProperties(
                    EvidaProperties.Security.of(true),
                    EvidaProperties.Ai.of(false),
                    EvidaProperties.Documents.of(false),
                    null
            ));
            var controller = new AuthController(service);

            var me = controller.me();

            assertEquals(UUID.fromString("00000000-0000-0000-0000-000000000701"), me.tenantId());
            assertEquals(UUID.fromString("00000000-0000-0000-0000-000000000702"), me.id());
            assertEquals("jurist@firma.no", me.email());
            assertEquals(true, me.roles().contains("AUDITOR"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }
}
