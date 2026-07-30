package no.saksrom.api.enterprise;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.policy.ProviderPolicyService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/enterprise")
public class EnterpriseController {
    private final EvidaProperties properties;
    private final ProviderPolicyService providerPolicyService;
    private final CurrentUserService currentUserService;

    public EnterpriseController(
            EvidaProperties properties,
            ProviderPolicyService providerPolicyService,
            CurrentUserService currentUserService
    ) {
        this.properties = properties;
        this.providerPolicyService = providerPolicyService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/readiness")
    public EnterpriseReadiness readiness(@RequestParam(required = false) UUID tenantId) {
        AuthenticatedUser user = currentUserService.currentUser();
        if (tenantId != null && !tenantId.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "TENANT_SCOPE_MISMATCH");
        }
        ProviderPolicyService.EffectiveProviderPolicy providerPolicy =
                providerPolicyService.effective(user.tenantId());
        boolean productionBlocked = properties.security().localDevMode();
        return new EnterpriseReadiness(
                user.tenantId(),
                true,
                properties.security().localDevMode(),
                properties.documents().rawUploadAllowed(),
                providerPolicy.aiProviderCallsEnabled(),
                productionBlocked,
                productionBlocked
                        ? "Disable local-dev mode and configure OAuth2/JWT before production."
                        : "Enterprise control plane is policy-gated."
        );
    }

    @PostMapping("/devices/evaluate")
    public DeviceActivationDecision evaluateDevice(@Valid @RequestBody DeviceActivationRequest request) {
        boolean allowed = request.deviceFingerprintHash().length() >= 32;
        return new DeviceActivationDecision(
                UUID.randomUUID(),
                request.tenantId(),
                request.userId(),
                allowed ? "ALLOWED" : "DENIED",
                allowed ? "Device fingerprint accepted for activation." : "Device fingerprint hash is too short.",
                OffsetDateTime.now()
        );
    }

    @PostMapping("/licenses/evaluate")
    public LicenseDecision evaluateLicense(@Valid @RequestBody LicenseEvaluationRequest request) {
        boolean active = request.seats() > 0 && request.assignedSeats() <= request.seats();
        return new LicenseDecision(
                request.tenantId(),
                active ? "ACTIVE" : "BLOCKED",
                request.seats(),
                request.assignedSeats(),
                Math.max(0, request.seats() - request.assignedSeats()),
                active ? "License has available capacity." : "License has no available capacity."
        );
    }

    public record EnterpriseReadiness(
            UUID tenantId,
            boolean localFirst,
            boolean localDevMode,
            boolean rawDocumentUploadAllowed,
            boolean aiProviderCallsEnabled,
            boolean productionBlocked,
            String message
    ) {}

    public record DeviceActivationRequest(
            @NotNull UUID tenantId,
            UUID userId,
            @NotBlank String deviceFingerprintHash,
            @NotBlank String appVersion,
            @NotBlank String osName
    ) {}

    public record DeviceActivationDecision(
            UUID activationId,
            UUID tenantId,
            UUID userId,
            String status,
            String message,
            OffsetDateTime evaluatedAt
    ) {}

    public record LicenseEvaluationRequest(
            @NotNull UUID tenantId,
            @Min(0) int seats,
            @Min(0) int assignedSeats
    ) {}

    public record LicenseDecision(
            UUID tenantId,
            String status,
            int seats,
            int assignedSeats,
            int availableSeats,
            String message
    ) {}
}
