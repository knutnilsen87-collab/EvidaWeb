# Deploy Runbook

## Prerequisites

- CI is green.
- Backend tests, web tests, typecheck, and build have passed.
- Secret scan and dependency scan have passed or have approved exceptions.
- Production IdP, database, storage, CORS origins, malware scanner, and rate limits are configured.

## Build Backend

```powershell
cd evida-core/services/saksrom-api
.\mvnw.cmd clean test
.\mvnw.cmd -DskipTests package
```

## Build Web

```powershell
cd apps/web
npm ci
npm run test -- --run
npm run lint
npm run build
```

## Run Migrations

Run Flyway migrations against the target database before routing traffic to the new backend. Keep a database backup before migrations.

## Configure Storage

Set quarantine/object storage roots and retention policy. Verify the application can write and read a smoke-test document without path traversal.

## Configure Auth

Set JWT issuer or JWK set URI and verify tokens include `tenant_id`, `user_id`, `email`, and roles.

## Health Checks

Check:

- `/actuator/health`
- `/actuator/health/readiness`
- `/actuator/health/liveness`

## Smoke Tests

- Upload document.
- Approve ingestion.
- Ingest to source units.
- Ask Saksrom with selected source unit.
- Start Court Engine analysis.
- Fetch operative summary.
- Confirm wrong tenant receives 403.
- Confirm `X-Request-ID` is returned.

## Rollback

Use `docs/deployment/rollback-runbook.md`.

## Known Failure Modes

- Production startup fails due unsafe auth/CORS/malware defaults.
- OCR-required documents fail closed until OCR is configured.
- Dependency-check may need CI cache or longer timeout.
