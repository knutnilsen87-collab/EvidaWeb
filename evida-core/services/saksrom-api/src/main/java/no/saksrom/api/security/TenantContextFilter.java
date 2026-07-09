package no.saksrom.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import no.saksrom.api.audit.AuditService;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

public class TenantContextFilter extends OncePerRequestFilter {
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    public TenantContextFilter(CurrentUserService currentUserService) {
        this(currentUserService, null);
    }

    public TenantContextFilter(CurrentUserService currentUserService, AuditService auditService) {
        this.currentUserService = currentUserService;
        this.auditService = auditService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "/actuator/health".equals(path) || "/error".equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            AuthenticatedUser user = currentUserService.currentUser();
            UUID requestedTenant = requestedTenant(request, user.tenantId());

            if (!requestedTenant.equals(user.tenantId())) {
                auditSecurityDeny(user, requestedTenant, request.getRequestURI(), "TENANT_MISMATCH");
                response.sendError(HttpServletResponse.SC_FORBIDDEN, "Tenant header does not match authenticated user");
                return;
            }

            TenantContext.setCurrentTenant(requestedTenant);
            filterChain.doFilter(request, response);
        } catch (IllegalArgumentException ex) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid tenant header");
        } catch (IllegalStateException ex) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Authenticated user is required");
        } finally {
            TenantContext.clear();
        }
    }

    private void auditSecurityDeny(AuthenticatedUser user, UUID requestedTenant, String path, String reason) {
        if (auditService == null) {
            return;
        }
        auditService.record(
                user.tenantId(),
                null,
                user.userId(),
                "SECURITY_DENY",
                "REQUEST",
                null,
                "{\"reason\":\"" + reason + "\",\"requestedTenant\":\"" + requestedTenant + "\",\"path\":\"" + escape(path) + "\"}"
        );
    }

    private String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private UUID requestedTenant(HttpServletRequest request, UUID fallback) {
        String value = firstHeader(request, CurrentUserService.EVIDA_TENANT_HEADER, CurrentUserService.TENANT_HEADER);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return UUID.fromString(value);
    }

    private String firstHeader(HttpServletRequest request, String... names) {
        for (String name : names) {
            String value = request.getHeader(name);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
