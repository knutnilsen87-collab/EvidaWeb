package no.saksrom.api.audit;

import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {
    private static final Set<String> ALLOWED_CLIENT_EVENTS = Set.of(
            "USER_LOGOUT",
            "CITATION_OPENED",
            "EXPORT_CREATED",
            "ADMIN_ACTION"
    );

    private final AuditService service;
    private final CurrentUserService currentUserService;

    public AuditController(AuditService service, CurrentUserService currentUserService) {
        this.service = service;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/verify")
    public AuditService.AuditVerification verify(@RequestBody VerifyAuditRequest request) {
        return service.verify(request.tenantId(), request.caseId());
    }

    @PostMapping("/client-event")
    public ClientAuditResponse recordClientEvent(@RequestBody ClientAuditRequest request) {
        if (!ALLOWED_CLIENT_EVENTS.contains(request.eventType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "AUDIT_EVENT_TYPE_NOT_ALLOWED");
        }
        AuthenticatedUser user = currentUserService.currentUser();
        AuditEvent event = service.record(
                user.tenantId(),
                request.caseId(),
                user.userId(),
                request.eventType(),
                sanitize(request.entityType(), "CLIENT"),
                request.entityId(),
                request.metadataJson() == null || request.metadataJson().isBlank() ? "{}" : request.metadataJson()
        );
        return new ClientAuditResponse(event.getId(), event.getEventType());
    }

    private String sanitize(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.replaceAll("[^A-Z0-9_]", "_");
    }

    public record VerifyAuditRequest(UUID tenantId, UUID caseId) {}

    public record ClientAuditRequest(
            String eventType,
            UUID caseId,
            String entityType,
            UUID entityId,
            String metadataJson
    ) {}

    public record ClientAuditResponse(UUID id, String eventType) {}
}
