package no.saksrom.api.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenantContextFilterTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000901");
    private static final UUID OTHER_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000902");

    @Test
    void setsTenantContextWhenHeaderMatchesAuthenticatedUser() throws ServletException, IOException {
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, UUID.randomUUID(), "jurist@firma.no", Set.of("USER"))
        );
        var filter = new TenantContextFilter(currentUserService);
        var request = new MockHttpServletRequest("GET", "/api/v1/cases");
        request.addHeader(CurrentUserService.EVIDA_TENANT_HEADER, TENANT_ID.toString());
        var response = new MockHttpServletResponse();
        var tenantInsideChain = new AtomicReference<UUID>();

        filter.doFilter(request, response, (servletRequest, servletResponse) ->
                tenantInsideChain.set(TenantContext.currentTenant().orElseThrow())
        );

        assertEquals(TENANT_ID, tenantInsideChain.get());
        assertTrue(TenantContext.currentTenant().isEmpty());
        assertEquals(200, response.getStatus());
    }

    @Test
    void rejectsCrossTenantHeaderMismatch() throws ServletException, IOException {
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, UUID.randomUUID(), "jurist@firma.no", Set.of("USER"))
        );
        var filter = new TenantContextFilter(currentUserService);
        var request = new MockHttpServletRequest("GET", "/api/v1/cases");
        request.addHeader(CurrentUserService.EVIDA_TENANT_HEADER, OTHER_TENANT_ID.toString());
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (servletRequest, servletResponse) ->
                fail("Request chain must not continue for cross-tenant mismatch")
        );

        assertEquals(403, response.getStatus());
        assertTrue(TenantContext.currentTenant().isEmpty());
    }

    @Test
    void fallsBackToAuthenticatedTenantWhenHeaderIsMissing() throws ServletException, IOException {
        var currentUserService = mock(CurrentUserService.class);
        when(currentUserService.currentUser()).thenReturn(
                new AuthenticatedUser(TENANT_ID, UUID.randomUUID(), "jurist@firma.no", Set.of("USER"))
        );
        var filter = new TenantContextFilter(currentUserService);
        var request = new MockHttpServletRequest("GET", "/api/v1/cases");
        var response = new MockHttpServletResponse();
        var tenantInsideChain = new AtomicReference<UUID>();

        filter.doFilter(request, response, (servletRequest, servletResponse) ->
                tenantInsideChain.set(TenantContext.currentTenant().orElseThrow())
        );

        assertEquals(TENANT_ID, tenantInsideChain.get());
        assertEquals(200, response.getStatus());
    }
}
