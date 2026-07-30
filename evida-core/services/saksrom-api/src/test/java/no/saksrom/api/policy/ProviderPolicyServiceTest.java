package no.saksrom.api.policy;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.config.EvidaProperties;
import no.saksrom.api.security.AuthenticatedUser;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProviderPolicyServiceTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");
    private static final AuthenticatedUser ADMIN =
            new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("TENANT_ADMIN"));

    @Test
    void providerCallsRequireBothGlobalKillSwitchAndTenantApproval() {
        ProviderPolicyRepository repository = mock(ProviderPolicyRepository.class);
        AuditService auditService = mock(AuditService.class);
        when(repository.findById(TENANT_ID)).thenReturn(Optional.empty());
        ProviderPolicyService service = new ProviderPolicyService(properties(false), repository, auditService);

        ProviderPolicyService.EffectiveProviderPolicy policy = service.effective(TENANT_ID);

        assertThat(policy.aiProviderCallsEnabled()).isFalse();
        assertThat(policy.globalProviderKillSwitchOpen()).isFalse();
        assertThat(policy.tenantProviderApproved()).isFalse();
        assertThat(policy.authority()).isEqualTo(ProviderPolicyService.AUTHORITY);
    }

    @Test
    void closedGlobalKillSwitchRejectsTenantEnablement() {
        ProviderPolicyRepository repository = mock(ProviderPolicyRepository.class);
        AuditService auditService = mock(AuditService.class);
        ProviderPolicyService service = new ProviderPolicyService(properties(false), repository, auditService);

        assertThatThrownBy(() -> service.update(ADMIN, true, "SEC-123"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GLOBAL_PROVIDER_KILL_SWITCH_CLOSED");

        verify(repository, never()).saveAndFlush(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void approvedChangeIsPersistedAndAuditedWithoutRawContent() {
        ProviderPolicyRepository repository = mock(ProviderPolicyRepository.class);
        AuditService auditService = mock(AuditService.class);
        when(repository.findById(TENANT_ID)).thenReturn(Optional.empty());
        when(repository.saveAndFlush(org.mockito.ArgumentMatchers.any(ProviderPolicy.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        ProviderPolicyService service = new ProviderPolicyService(properties(true), repository, auditService);

        ProviderPolicyService.EffectiveProviderPolicy policy = service.update(ADMIN, true, "SEC-123");

        assertThat(policy.aiProviderCallsEnabled()).isTrue();
        assertThat(policy.tenantProviderApproved()).isTrue();
        verify(auditService).record(
                eq(TENANT_ID),
                isNull(),
                eq(USER_ID),
                eq("PROVIDER_POLICY_CHANGED"),
                eq("PROVIDER_POLICY"),
                eq(TENANT_ID),
                contains("\"changeTicket\":\"SEC-123\"")
        );
    }

    private EvidaProperties properties(boolean providerCallsEnabled) {
        return new EvidaProperties(
                EvidaProperties.Security.of(true),
                EvidaProperties.Ai.of(providerCallsEnabled),
                EvidaProperties.Documents.of(false),
                null
        );
    }
}
