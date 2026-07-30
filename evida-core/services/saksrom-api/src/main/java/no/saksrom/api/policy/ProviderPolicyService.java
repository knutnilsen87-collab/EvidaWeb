package no.saksrom.api.policy;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ProviderPolicyService {
    public static final String AUTHORITY = "backend-provider-policy";
    private static final Pattern CHANGE_TICKET = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._/-]{2,79}");

    private final EvidaProperties properties;
    private final ProviderPolicyRepository repository;
    private final AuditService auditService;

    public ProviderPolicyService(
            EvidaProperties properties,
            ProviderPolicyRepository repository,
            AuditService auditService
    ) {
        this.properties = properties;
        this.repository = repository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public EffectiveProviderPolicy effective(UUID tenantId) {
        ProviderPolicy stored = repository.findById(tenantId).orElse(null);
        boolean tenantApproved = stored != null && stored.isExternalProviderApproved();
        boolean globalKillSwitchOpen = properties.ai().providerCallsEnabled();
        return new EffectiveProviderPolicy(
                globalKillSwitchOpen && tenantApproved,
                globalKillSwitchOpen,
                tenantApproved,
                stored == null ? 0 : stored.getVersion(),
                AUTHORITY,
                stored == null ? null : stored.getChangeTicket(),
                stored == null ? null : stored.getUpdatedAt()
        );
    }

    @Transactional
    public EffectiveProviderPolicy update(
            AuthenticatedUser actor,
            boolean externalProviderApproved,
            String changeTicket
    ) {
        String ticket = validateTicket(changeTicket);
        if (externalProviderApproved && !properties.ai().providerCallsEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "GLOBAL_PROVIDER_KILL_SWITCH_CLOSED"
            );
        }

        ProviderPolicy policy = repository.findById(actor.tenantId()).orElse(null);
        boolean previousApproved = policy != null && policy.isExternalProviderApproved();
        OffsetDateTime now = OffsetDateTime.now();
        if (policy == null) {
            policy = new ProviderPolicy(
                    actor.tenantId(),
                    externalProviderApproved,
                    ticket,
                    actor.userId(),
                    now
            );
        } else {
            policy.update(externalProviderApproved, ticket, actor.userId(), now);
        }
        ProviderPolicy saved = repository.saveAndFlush(policy);

        auditService.record(
                actor.tenantId(),
                null,
                actor.userId(),
                "PROVIDER_POLICY_CHANGED",
                "PROVIDER_POLICY",
                actor.tenantId(),
                "{\"authority\":\"" + AUTHORITY
                        + "\",\"previousApproved\":" + previousApproved
                        + ",\"externalProviderApproved\":" + externalProviderApproved
                        + ",\"changeTicket\":\"" + ticket + "\"}"
        );
        return new EffectiveProviderPolicy(
                properties.ai().providerCallsEnabled() && saved.isExternalProviderApproved(),
                properties.ai().providerCallsEnabled(),
                saved.isExternalProviderApproved(),
                saved.getVersion(),
                AUTHORITY,
                saved.getChangeTicket(),
                saved.getUpdatedAt()
        );
    }

    private String validateTicket(String changeTicket) {
        String ticket = changeTicket == null ? "" : changeTicket.trim();
        if (!CHANGE_TICKET.matcher(ticket).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_CHANGE_TICKET");
        }
        return ticket;
    }

    public record EffectiveProviderPolicy(
            boolean aiProviderCallsEnabled,
            boolean globalProviderKillSwitchOpen,
            boolean tenantProviderApproved,
            long policyVersion,
            String authority,
            String changeTicket,
            OffsetDateTime updatedAt
    ) {}
}
