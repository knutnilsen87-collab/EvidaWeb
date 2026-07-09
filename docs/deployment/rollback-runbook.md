# Rollback Runbook

## App Rollback

Redeploy the previous backend artifact and previous web build. Confirm health endpoints before restoring traffic.

## Migration Strategy

Prefer forward-fix migrations. If rollback is unavoidable, restore database backup taken immediately before deployment and verify tenant isolation after restore.

## Object Storage Rollback

Keep object storage versioning or retention enabled. Do not delete newly uploaded legal documents during app rollback unless a formal tenant-level restore is approved.

## Feature Flag Fallback

Disable new flows by configuration where possible:

- disable ingestion workers
- disable AI/Saksrom provider calls
- set upload UI to read-only at edge/application layer

## Disable Ingestion

Block `POST /api/documents/{id}/ingest` at gateway or set the backend to maintenance mode until the faulty version is removed.

## Disable AI/Saksrom

Set provider calls disabled and block `/api/saksrom/ask` at gateway if source-bound answers are faulty.

## Upload Read-only Mode

Block `POST /api/documents/upload` and `POST /api/files/upload` at gateway. Leave read endpoints available if database and storage are healthy.

## Verification

After rollback, run health checks, tenant mismatch checks, upload/list smoke if writes are enabled, and audit verification for affected tenants.
