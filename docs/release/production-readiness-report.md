# EVIDA Production Readiness Report

## Classification

staging_candidate

## Executive summary

EVIDA now has a verified local Court Engine lifecycle: create case, upload document, quarantine, list/detail/download, approve, ingest, create source units, ask a source-bound Saksrom question, generate a Court Engine summary, reject wrong-tenant access, archive the document, and verify the audit hash chain.

EVIDA is not commercial-release-ready. The correct release classification is `staging_candidate` because the local source-bound workflow is real and verified, while production OIDC, deployment, restore, alerting, E2E browser automation, commercial/legal documentation, and full production security gates remain incomplete.

## Evidence

- Backend tests: `evida-core/services/saksrom-api/mvnw.cmd test` passed, 43 tests.
- Backend package: `evida-core/services/saksrom-api/mvnw.cmd -DskipTests package` passed.
- Web typecheck: `npm run lint` passed.
- Web tests: `npm run test -- --run` passed, 19 files / 60 tests.
- Web build: `npm run build` passed.
- Web audit: `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- Local smoke: `scripts/codex_phase05_court_smoke.ps1` passed.
- Status bundle: `status_bundle.txt` and `apps/web/status_bundle.txt` updated.
- Runbook reports:
  - `docs/codex-reports/2026-07-03_upload_e2e_local_quarantine.md`
  - `docs/codex-reports/2026-07-03_backend_verification_and_ci.md`
  - `docs/codex-reports/2026-07-03_document_lifecycle_v1.md`
  - `docs/codex-reports/2026-07-03_pdf_ocr_ingestion_source_units.md`
  - `docs/codex-reports/2026-07-03_source_bound_ai_court_engine_summary.md`
  - `docs/codex-reports/2026-07-03_security_tenant_auth_prod_hardening.md`
  - `docs/codex-reports/2026-07-03_observability_audit_deployment.md`

## Passed gates

- Local backend tests pass.
- Local web lint/tests/build pass.
- Upload smoke passes.
- Ingestion smoke passes.
- Citation/source-bound smoke passes.
- Wrong-tenant smoke passes.
- Audit verification smoke passes.
- Request ID response header is verified.
- Document metadata persists.
- Document list/detail/download are backend-backed.
- Approve/reject/archive/delete endpoints exist and are tenant-scoped.
- PDF text parser extracts source units.
- OCR-required path is explicit and blocks release when OCR is required but unavailable.
- Source-bound Saksrom uses persisted source units.
- No-source behavior is explicit.
- Court Engine summary validation requires sources for documented findings.
- Deployment environment, deploy, rollback, and backup/restore runbooks exist.

## Failed gates

- No production OIDC/IdP is configured.
- No proven production session/token expiry policy.
- RBAC model exists, but full per-endpoint permission enforcement is incomplete.
- Browser E2E framework/command is absent.
- Staging and production environments are not proven.
- Restore and rollback are documented but not tested.
- Real production malware scanner adapter is not configured.
- Rate limiting is documented but not enforced by verified infrastructure.
- Full gitleaks/SCA release scan is not completed in this local run. `gitleaks detect --source . --no-git --redact --exit-code 1` was attempted and timed out after 5 minutes.
- OWASP dependency-check timed out earlier and remains a CI/release requirement.
- Production alerting/monitoring stack is not deployed.
- Commercial onboarding/privacy/DPA/terms/support documentation is incomplete.

## Accepted risks

No commercial-release risks are accepted. Remaining risks are blockers for `commercial_release_ready`.

For local/staging-candidate work only, the following are known limitations:

- Dev/local auth fallback exists and is not allowed in production.
- Dev malware scanner bypass exists and is rejected by production startup validation unless a scanner is configured.
- Some workflow surfaces still have prototype UI behavior outside the verified Court Engine path.
- Browser visual/E2E evidence is not available in this environment.

## Release blockers

- Configure production OIDC/IdP and token/session policy.
- Enforce RBAC on all protected endpoints.
- Add verified rate limiting.
- Replace dev malware scanner bypass with production scanner.
- Add browser E2E lifecycle test.
- Prove staging deployment.
- Prove production deployment or release-candidate deployment.
- Prove rollback and restore.
- Complete full secret/SCA scanning in CI.
- Complete customer-facing legal/commercial documentation.

## Security status

Security is improved but not production-complete.

Implemented:

- Tenant mismatch returns `403` in local smoke.
- CORS configuration and security headers are present.
- Production startup validator rejects unsafe production security defaults.
- Malware scanner hook exists.
- Upload validation enforces size, MIME and extension checks.
- Sensitive Saksrom audit payloads avoid logging question/document text.

Remaining:

- Production OIDC/IdP is not configured.
- Rate limiting is not verified.
- Full endpoint RBAC is incomplete.
- Full gitleaks/SCA release scan is incomplete; local gitleaks timed out after 5 minutes.

## Data/privacy status

Real client data is not approved.

The local smoke uses test fixture data only. The status bundle keeps `real_client_data_allowed=false` and `commercial_release_ready=false`.

## Operational status

Operational documentation exists:

- `docs/deployment/environment.md`
- `docs/deployment/deploy-runbook.md`
- `docs/deployment/rollback-runbook.md`
- `docs/deployment/backup-restore-runbook.md`

Operational proof is incomplete:

- No staging/prod deployment was verified.
- No backup restore test was executed.
- No rollback drill was executed.
- No alerting stack was connected.

## Test results

- Backend: PASS, 43 tests.
- Web lint: PASS.
- Web tests: PASS, 19 files / 60 tests.
- Web build: PASS.
- Web npm audit: PASS, 0 moderate+ vulnerabilities.
- E2E browser framework: missing.

## Smoke results

Latest local smoke result:

```json
{
  "status": "PASS",
  "caseId": "061d940e-463e-4fde-88f1-97b18abd8553",
  "documentId": "677b8a23-17be-4f00-90c6-32af496e3771",
  "sourceUnitCount": 7,
  "searchResults": 1,
  "askSourceBound": true,
  "askSourceUnitId": "doc_677b8a23_p0001_b0001",
  "analysisStatus": "completed",
  "summaryCaseId": "061d940e-463e-4fde-88f1-97b18abd8553",
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

## Commercial readiness

Not ready.

The product has a verified local source-bound workflow, but commercial release requires production-grade identity, operations, monitoring, legal/commercial documentation, E2E automation, and deployment proof that are not present yet.

## Final decision

Do not release commercially.

Classification: `staging_candidate`.

## Required next action

Create a staging environment and run the full release gate there with real OIDC, production-like storage, malware scanning, rate limiting, migrations, browser E2E tests, restore test, rollback drill, and alerting.

## Fallback plan

Keep EVIDA in local/staging-candidate mode with real client data disabled. If any source-bound, audit, tenant isolation, or upload safety regression appears, block release and rerun the backend tests, web tests/build, and `scripts/codex_phase05_court_smoke.ps1` before accepting new evidence.
