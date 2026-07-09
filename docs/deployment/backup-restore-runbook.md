# Backup Restore Runbook

## Database Backup

Take encrypted database backups before migrations and on the normal production schedule. Store backup metadata with timestamp, environment, database version, and checksum.

## Object Storage Backup

Enable bucket versioning or immutable retention for legal documents and source artifacts. Backup storage metadata and object inventory alongside database backups.

## Restore Test

At least once per release cycle:

1. Restore database backup into an isolated environment.
2. Restore matching object storage snapshot or versioned objects.
3. Run tenant isolation checks.
4. Upload, ingest, ask Saksrom, and fetch summary on restored data.
5. Verify audit hash chain for restored cases.

## RPO/RTO Placeholder

- RPO target: define before real client data.
- RTO target: define before real client data.

## Tenant-level Restore Caveats

Tenant-level restore is high risk because documents, source units, summaries, and audit events are linked. Prefer full-environment restore or a carefully tested tenant export/import process with audit preservation.
