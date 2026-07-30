package no.saksrom.api.audit;

import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuditServiceTest {
    @Test
    void locksTheTenantCaseChainBeforeReadingAndSavingItsTail() {
        AuditEventRepository repository = mock(AuditEventRepository.class);
        UUID tenantId = UUID.randomUUID();
        UUID caseId = UUID.randomUUID();
        when(repository.findTopByTenantIdAndCaseIdOrderByCreatedAtDesc(tenantId, caseId))
                .thenReturn(Optional.empty());
        when(repository.save(org.mockito.ArgumentMatchers.any(AuditEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AuditEvent event = new AuditService(repository).record(
                tenantId,
                caseId,
                UUID.randomUUID(),
                "DOCUMENT_UPLOADED",
                "DOCUMENT",
                UUID.randomUUID(),
                "{}"
        );

        var ordered = inOrder(repository);
        ordered.verify(repository).acquireTenantAuditLock(tenantId);
        ordered.verify(repository).findTopByTenantIdAndCaseIdOrderByCreatedAtDesc(tenantId, caseId);
        ordered.verify(repository).save(event);
        assertThat(event.getPreviousEventHash()).isNull();
        assertThat(event.getEventHash()).isNotBlank();
    }
}
