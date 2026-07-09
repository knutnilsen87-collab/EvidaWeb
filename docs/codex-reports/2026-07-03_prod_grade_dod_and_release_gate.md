# Production-grade DoD and release gate

Date: 2026-07-03

## Classification

`staging_candidate`

## Decision

EVIDA must not be called production-ready or commercial-release-ready yet.

The local Court Engine lifecycle is implemented and verified, but Phase 08 hard blockers remain for commercial release.

## Evidence Reviewed

- Runbook reports for Phases 01-07 exist in `docs/codex-reports`.
- Final release report exists at `docs/release/production-readiness-report.md`.
- Status bundles were updated:
  - `status_bundle.txt`
  - `apps/web/status_bundle.txt`
- Verification commands were run locally:
  - backend tests
  - backend package
  - web lint
  - web tests
  - web build
  - npm audit
  - local Court Engine smoke

## Passed Gates

- Local upload/document/ingestion/source/citation workflow works.
- Backend tests pass locally.
- Web lint/tests/build pass locally.
- Upload smoke passes.
- Ingestion smoke passes.
- Source-bound citation smoke passes.
- Wrong-tenant smoke passes.
- Audit hash verification smoke passes.
- Request ID response header is verified.
- Deployment/environment/rollback/backup runbooks exist.
- Security hardening docs exist.
- Production startup validation rejects unsafe production defaults.

## Failed or Incomplete Gates

- Production OIDC/IdP is not configured.
- Session/token expiry policy is not proven.
- Full endpoint RBAC enforcement is incomplete.
- E2E browser lifecycle framework is absent.
- No staging/prod deployment is proven.
- Rollback and restore are documented but not tested.
- Real malware scanner adapter is not configured.
- Rate limiting is not verified.
- Full release gitleaks/SCA scan is not complete in this run; `gitleaks detect --source . --no-git --redact --exit-code 1` was attempted and timed out after 5 minutes.
- Alerting/monitoring stack is not deployed.
- Commercial readiness documents are incomplete.

## Latest Test Results

- `mvnw.cmd test`: PASS, 43 tests.
- `mvnw.cmd -DskipTests package`: PASS.
- `npm run lint`: PASS.
- `npm run test -- --run`: PASS, 19 files / 60 tests.
- `npm run build`: PASS.
- `npm audit --audit-level=moderate`: PASS, 0 vulnerabilities.

## Latest Smoke Results

`scripts/codex_phase05_court_smoke.ps1` passed with:

- `sourceUnitCount`: 7
- `askSourceBound`: true
- `analysisStatus`: completed
- `wrongTenantStatus`: 403
- `archiveStatus`: ARCHIVED
- `auditValid`: true
- `auditEventCount`: 15
- `requestIdHeader`: smoke-request-id
- `clientAuditEvents`: 4
- `globalAuditValid`: true
- `globalAuditEventCount`: 2

## Release Gate Outcome

Commercial release is blocked.

The highest defensible classification is `staging_candidate` because local source-bound lifecycle evidence exists, while production security, deployment, operations, browser E2E and commercial readiness evidence is incomplete.

## Required Next Action

Run the same release gate in a real staging environment with production-like identity, storage, malware scanning, rate limiting, migrations, browser E2E, restore/rollback drill and alerting.
