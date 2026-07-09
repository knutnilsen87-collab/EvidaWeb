# Security, tenant auth production hardening

Date: 2026-07-03

## Implemented

- Added production CORS configuration with explicit allowed origins.
- Added Spring Security headers:
  - CSP `default-src 'self'; frame-ancestors 'none'`
  - denied frame options
  - content type options
- Extended production startup validator:
  - rejects local-dev security in production
  - requires JWT issuer/JWK config
  - rejects missing or wildcard CORS origins in production
  - requires declared malware scanner configuration in production
- Added malware scanner hook:
  - `MalwareScanner`
  - `MalwareScanResult`
  - dev-only `DevBypassMalwareScanner`
  - quarantine storage calls scanner before accepting uploaded file
- Added central RBAC model:
  - `Permission`
  - `AuthorizationService`
  - role-to-permission mapping for `TENANT_ADMIN`, `LAWYER`, `CASE_WORKER`, `VIEWER`, `SYSTEM_ADMIN`, plus legacy dev roles.
- Added security documentation:
  - `docs/security/auth-boundary.md`
  - `docs/security/rate-limiting.md`
  - `docs/security/secret-scanning.md`

## Existing controls confirmed

- Tenant header must match authenticated tenant.
- Document list/get/download/approve/reject/archive/delete/ingest/source-unit endpoints use tenant-scoped lookup.
- Saksrom source search and selected source-unit lookup are tenant-scoped.
- Upload validation rejects empty file, oversized file, unsupported extension, unsupported MIME, and path traversal via server-generated sanitized path.

## Verification

- Backend tests: `mvnw.cmd test` passed, 43 tests.
- Backend package: `mvnw.cmd -DskipTests package` passed.
- Web typecheck: `npm run lint` passed.
- Web audit: `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- Secret fallback scan: `git grep -n -i "password|secret|api_key|token|private_key"` completed. It reported many expected documentation/placeholders and legacy binary matches; production release still requires gitleaks/allowlist review.
- OWASP dependency-check: attempted with `mvnw.cmd org.owasp:dependency-check-maven:check`; it timed out locally after 4 minutes and was stopped. This remains a CI/release-gate requirement.

## Release blockers remaining

- Real malware scanner adapter must replace dev bypass.
- Production IdP/JWT issuer must be configured.
- Production CORS origins must be explicitly configured.
- Rate limiting must be enforced by gateway/proxy or in-app limiter.
- RBAC helper exists, but per-endpoint permission enforcement is not complete across all controllers.
- Full gitleaks/SCA scan must pass in CI.
- Audit coverage must be expanded for every protected write action.
