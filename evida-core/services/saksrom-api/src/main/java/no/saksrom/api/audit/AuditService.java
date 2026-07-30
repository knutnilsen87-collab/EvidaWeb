package no.saksrom.api.audit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class AuditService {
    private final AuditEventRepository repository;

    public AuditService(AuditEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public AuditEvent record(
            UUID tenantId,
            UUID caseId,
            UUID actorUserId,
            String eventType,
            String entityType,
            UUID entityId,
            String payloadJson
    ) {
        repository.acquireTenantAuditLock(tenantId);
        String previousHash = repository
                .findTopByTenantIdAndCaseIdOrderByCreatedAtDesc(tenantId, caseId)
                .map(AuditEvent::getEventHash)
                .orElse(null);

        String eventHash = AuditHash.calculate(
                tenantId, caseId, actorUserId, eventType, entityType, entityId, payloadJson, previousHash
        );

        AuditEvent event = new AuditEvent(
                UUID.randomUUID(),
                tenantId,
                caseId,
                actorUserId,
                eventType,
                entityType,
                entityId,
                payloadJson,
                previousHash,
                eventHash,
                OffsetDateTime.now()
        );

        return repository.save(event);
    }

    @Transactional(readOnly = true)
    public AuditVerification verify(UUID tenantId, UUID caseId) {
        List<AuditEvent> events = repository.findByTenantIdAndCaseIdOrderByCreatedAtAsc(tenantId, caseId);
        List<AuditEvent> remaining = new ArrayList<>(events);
        String previous = null;

        while (!remaining.isEmpty()) {
            AuditEvent event = nextEvent(remaining, previous);
            if (event == null) {
                return new AuditVerification(false, events.size(), null, previous, null);
            }

            String expected = AuditHash.calculate(
                    event.getTenantId(),
                    event.getCaseId(),
                    event.getActorUserId(),
                    event.getEventType(),
                    event.getEntityType(),
                    event.getEntityId(),
                    event.getEventPayload(),
                    previous
            );

            if (!expected.equals(event.getEventHash())) {
                return new AuditVerification(false, events.size(), event.getId().toString(), expected, event.getEventHash());
            }

            previous = event.getEventHash();
            remaining.remove(event);
        }

        return new AuditVerification(true, events.size(), null, null, null);
    }

    private AuditEvent nextEvent(List<AuditEvent> events, String previousHash) {
        AuditEvent match = null;
        for (AuditEvent event : events) {
            boolean matches = previousHash == null
                    ? event.getPreviousEventHash() == null
                    : previousHash.equals(event.getPreviousEventHash());
            if (!matches) {
                continue;
            }
            if (match != null) {
                return null;
            }
            match = event;
        }
        return match;
    }

    public record AuditVerification(
            boolean valid,
            int eventCount,
            String failedEventId,
            String expectedHash,
            String actualHash
    ) {}
}
