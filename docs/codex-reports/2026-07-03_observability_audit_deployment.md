# Observability, audit and deployment readiness

Date: 2026-07-03

## Scope

Phase 07 made the local Court Engine flow operable and auditable enough for a staging-candidate gate. It does not claim full production operations readiness.

## Implemented

- Added request correlation through `RequestIdFilter`.
  - Accepts incoming `X-Request-ID`.
  - Generates a UUID when missing.
  - Adds `X-Request-ID` to every response.
  - Stores the value in SLF4J MDC as `requestId`.
- Enabled actuator health exposure for health/info/metrics/flyway, with health probes configured.
- Added or verified audit persistence for critical local lifecycle actions:
  - `CASE_CREATED`
  - `DOCUMENT_UPLOADED`
  - `DOCUMENT_APPROVED_FOR_INGESTION`
  - `DOCUMENT_REJECTED`
  - `DOCUMENT_INGEST_STARTED`
  - `SOURCE_UNIT_CREATED`
  - `DOCUMENT_INGEST_SUCCEEDED`
  - `DOCUMENT_INGEST_FAILED`
  - `DOCUMENT_ARCHIVED`
  - `DOCUMENT_DELETED`
  - `SAKSROM_QUESTION_ASKED`
  - `SAKSROM_ANSWER_CREATED`
- Hardened audit verification:
  - Audit verification follows the stored hash chain instead of relying on timestamp ordering.
  - Audit payload is stored as stable text via `V008__audit_event_payload_text.sql`, avoiding JSONB normalization changing the hashed payload.
- Added deployment/operations documentation:
  - `docs/deployment/environment.md`
  - `docs/deployment/deploy-runbook.md`
  - `docs/deployment/rollback-runbook.md`
  - `docs/deployment/backup-restore-runbook.md`

## Verification

- Backend tests: `mvnw.cmd test` passed, 43 tests.
- Backend package: `mvnw.cmd -DskipTests package` passed.
- Web typecheck: `npm run lint` passed.
- Web tests: `npm run test -- --run` passed, 19 files / 60 tests.
- Web build: `npm run build` passed.
- Runtime smoke: `scripts/codex_phase05_court_smoke.ps1` passed:
  - case created
  - document uploaded/listed/detailed/downloaded
  - document approved for ingestion
  - document ingested to source units
  - source search returned real source unit
  - Saksrom answer was source-bound
  - Court Engine summary completed
  - wrong tenant returned `403`
  - document archived
  - audit verification returned `auditValid=true`
  - case audit chain had 15 events
  - client audit events covered citation opened, export created, admin action and logout
  - global auth/security audit verification returned `globalAuditValid=true`
  - global audit chain had 2 events
  - response returned `X-Request-ID: smoke-request-id`

## Smoke Evidence

Latest local smoke result:

```json
{
  "status": "PASS",
  "caseId": "48135274-ca77-4604-8cd4-8e3b1e942f93",
  "documentId": "dc6fa303-e3c3-4287-b23f-19d5fd841925",
  "sourceUnitCount": 7,
  "searchResults": 1,
  "askSourceBound": true,
  "askSourceUnitId": "doc_dc6fa303_p0001_b0001",
  "analysisStatus": "completed",
  "summaryKeyFindings": 1,
  "wrongTenantStatus": "403",
  "archiveStatus": "ARCHIVED",
  "auditValid": true,
  "auditEventCount": 15,
  "requestIdHeader": "smoke-request-id",
  "clientAuditEvents": 4,
  "authTenant": "00000000-0000-0000-0000-000000000101",
  "globalAuditValid": true,
  "globalAuditEventCount": 2
}
```

## Remaining Gaps

- `USER_LOGIN`, `USER_LOGOUT`, `CITATION_OPENED`, `EXPORT_CREATED`, `ADMIN_ACTION`, and `SECURITY_DENY` now have local/staging audit paths, but full production surface coverage still requires real login/logout flows, export implementation and admin/security workflows.
- Audit API currently verifies a chain; it is not a full tenant-scoped audit search/list UI.
- Structured logging format is MDC-ready but not wired to a production JSON log encoder.
- Metrics and alerting strategy are documented but not deployed to a real monitoring stack.
- Backup/restore and rollback runbooks exist, but restore and rollback are not proven in staging/production.

## Result

Phase 07 is complete for local/staging-candidate readiness. It remains blocked for commercial release until production deployment, alerting, restore, rollback and complete event coverage are proven.
