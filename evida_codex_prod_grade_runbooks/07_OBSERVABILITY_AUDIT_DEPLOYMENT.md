
Phase 07 — Observability, Audit Trail, Deployment, Rollback
Objective

Make EVIDA operable and auditable.

Commercial release requires answering:

Who did what, when, in which tenant, in which case, to which document/source/export, with what outcome?
Scope

In scope:

audit event model
audit logging for document/source/Saksrom/export actions
request correlation ID
structured logging guidance
health endpoints
deployment config
backup/restore runbook
rollback runbook
environment variable documentation

Out of scope:

full SIEM integration
enterprise dashboard
complex metrics UI
Audit events

Minimum event types:

USER_LOGIN
USER_LOGOUT
CASE_CREATED
DOCUMENT_UPLOADED
DOCUMENT_REJECTED
DOCUMENT_APPROVED_FOR_INGESTION
DOCUMENT_INGEST_STARTED
DOCUMENT_INGEST_SUCCEEDED
DOCUMENT_INGEST_FAILED
DOCUMENT_ARCHIVED
DOCUMENT_DELETED
SOURCE_UNIT_CREATED
SAKSROM_QUESTION_ASKED
SAKSROM_ANSWER_CREATED
CITATION_OPENED
EXPORT_CREATED
ADMIN_ACTION
SECURITY_DENY
Audit table migration
CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    occurred_at TIMESTAMP NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    case_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    outcome VARCHAR(50) NOT NULL,
    request_id VARCHAR(255),
    ip_address VARCHAR(255),
    user_agent TEXT,
    metadata_json TEXT
);

CREATE INDEX idx_audit_tenant_time ON audit_events (tenant_id, occurred_at);
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_request ON audit_events (request_id);
Entity stub
@Entity
@Table(name = "audit_events")
public class AuditEvent {
    @Id
    private UUID id;

    private Instant occurredAt;
    private String tenantId;
    private String userId;
    private String caseId;
    private String eventType;
    private String entityType;
    private String entityId;
    private String outcome;
    private String requestId;

    @Lob
    private String ipAddress;

    @Lob
    private String userAgent;

    @Lob
    private String metadataJson;
}
Audit service stub
@Service
public class AuditService {
    private final AuditEventRepository repository;

    public void record(AuditEventCommand command) {
        AuditEvent event = new AuditEvent();
        event.setId(UUID.randomUUID());
        event.setOccurredAt(Instant.now());
        event.setTenantId(command.tenantId());
        event.setUserId(command.userId());
        event.setCaseId(command.caseId());
        event.setEventType(command.eventType());
        event.setEntityType(command.entityType());
        event.setEntityId(command.entityId());
        event.setOutcome(command.outcome());
        event.setRequestId(command.requestId());
        event.setMetadataJson(command.metadataJson());
        repository.save(event);
    }
}

Use in services after successful state changes and on security denies where feasible.

Request ID filter
@Component
public class RequestIdFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Request-ID";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = Optional.ofNullable(request.getHeader(HEADER))
                .filter(id -> !id.isBlank())
                .orElse(UUID.randomUUID().toString());

        MDC.put("requestId", requestId);
        response.setHeader(HEADER, requestId);

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("requestId");
        }
    }
}
Health endpoints

If Spring Actuator exists, configure:

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      probes:
        enabled: true

Required:

GET /actuator/health
GET /actuator/health/readiness
GET /actuator/health/liveness

If Actuator is not present, document why and add backlog.

Environment documentation

Create:

docs/deployment/environment.md

Required variables:

EVIDA_PROFILE
EVIDA_DATABASE_URL
EVIDA_DATABASE_USERNAME
EVIDA_DATABASE_PASSWORD
EVIDA_QUARANTINE_ROOT
EVIDA_OBJECT_STORAGE_BUCKET
EVIDA_OBJECT_STORAGE_REGION
EVIDA_ALLOWED_ORIGINS
EVIDA_OIDC_ISSUER
EVIDA_OIDC_CLIENT_ID
EVIDA_OIDC_CLIENT_SECRET
EVIDA_RATE_LIMIT_CONFIG
EVIDA_MALWARE_SCANNER_MODE

Mark each as:

required in local
required in staging
required in production
secret yes/no
default value
Deployment runbook

Create:

docs/deployment/deploy-runbook.md

Sections:

# Deploy Runbook

## Prerequisites

## Build backend

## Build web

## Run migrations

## Configure storage

## Configure auth

## Health checks

## Smoke tests

## Rollback

## Known failure modes
Rollback runbook

Create:

docs/deployment/rollback-runbook.md

Must include:

app rollback
migration rollback or forward-fix strategy
object storage rollback/retention
feature flag fallback
how to disable ingestion
how to disable AI/Saksrom
how to put upload into read-only mode
Backup/restore runbook

Create:

docs/deployment/backup-restore-runbook.md

Must include:

database backup
object storage backup
restore test
RPO/RTO placeholder
tenant-level restore caveats
Tests

Backend:

audit event written on upload
audit event written on approve/reject
audit event written on ingestion success/failure
request id is returned
audit list is tenant isolated if API exists

Smoke:

Upload document.
Approve ingestion.
Ingest.
Ask Saksrom.
Confirm audit rows exist.
Confirm request IDs appear in logs/response.
Report
docs/codex-reports/2026-07-02_observability_audit_deployment.md
Success criteria

succeeded only if:

audit events persist for critical actions
request IDs exist
deployment env docs exist
rollback runbook exists
backup/restore runbook exists
health check strategy exists
tests/smoke pass where implemented
Next phase

Run:

08_PROD_GRADE_DOD_AND_RELEASE_GATE.md
