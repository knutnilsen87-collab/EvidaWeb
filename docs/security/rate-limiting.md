# Rate Limiting

## Endpoints needing limits

- `POST /api/documents/upload`
- `POST /api/files/upload`
- `POST /api/documents/{id}/ingest`
- `POST /api/analysis/start`
- `POST /api/saksrom/ask`
- `GET /api/source-units/search`
- Auth endpoints under `/api/auth/**`

## Default rates

- Read/search: 120 requests per minute per user.
- Saksrom ask: 30 requests per minute per user.
- Upload: 10 uploads per minute per user and 50 uploads per hour per tenant.
- Ingestion/analysis: 10 starts per hour per tenant.

## Tenant-level limits

Tenant-level limits must cap upload, ingestion, analysis, and AI-style endpoints to prevent one tenant from exhausting shared resources.

## User-level limits

User-level limits must be applied after authentication, keyed by tenant ID and user ID.

## Upload-specific limits

Upload limits must combine rate, file size, MIME/extension validation, generated storage paths, checksum calculation, and malware scan result.

## Implementation status

No in-process limiter is enabled yet. Preferred production controls are API gateway or reverse proxy rate limiting plus application metrics. Bucket4j is the recommended in-app fallback if gateway controls are not available.

## Release blocker status

Production release is blocked until rate limits are enforced at gateway/proxy or application level.
