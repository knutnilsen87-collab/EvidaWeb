package no.saksrom.api.policy;

import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PolicyController {
    private final EvidaProperties properties;
    private final ProviderPolicyService providerPolicyService;
    private final CurrentUserService currentUserService;
    private final AuthorizationService authorizationService;

    public PolicyController(
            EvidaProperties properties,
            ProviderPolicyService providerPolicyService,
            CurrentUserService currentUserService,
            AuthorizationService authorizationService
    ) {
        this.properties = properties;
        this.providerPolicyService = providerPolicyService;
        this.currentUserService = currentUserService;
        this.authorizationService = authorizationService;
    }

    @GetMapping("/api/v1/policy/effective")
    public EffectivePolicy effectivePolicy() {
        AuthenticatedUser user = currentUserService.currentUser();
        ProviderPolicyService.EffectiveProviderPolicy providerPolicy = providerPolicyService.effective(user.tenantId());
        return new EffectivePolicy(
                true,
                properties.documents().rawUploadAllowed(),
                providerPolicy.aiProviderCallsEnabled(),
                providerPolicy
        );
    }

    @PutMapping("/api/v1/policy/ai-provider")
    public ProviderPolicyService.EffectiveProviderPolicy updateProviderPolicy(
            @RequestBody ProviderPolicyUpdateRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        authorizationService.requirePermission(user, Permission.ADMIN_TENANT);
        return providerPolicyService.update(
                user,
                request.externalProviderApproved(),
                request.changeTicket()
        );
    }

    public record EffectivePolicy(
            boolean localFirst,
            boolean rawDocumentUploadAllowed,
            boolean aiProviderCallsEnabled,
            ProviderPolicyService.EffectiveProviderPolicy providerPolicy
    ) {}

    public record ProviderPolicyUpdateRequest(
            boolean externalProviderApproved,
            String changeTicket
    ) {}
}
