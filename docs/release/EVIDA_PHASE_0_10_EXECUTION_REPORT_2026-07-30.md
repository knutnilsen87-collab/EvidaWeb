# EVIDA phase 0-10 execution report

Generated: 2026-07-30

Branch: `codex/web-real-client-readiness`

Scope: web/Spring controlled pilot readiness

Decision: **NO-GO for real client data**

## Outcome

All roadmap phases were executed as far as they can be completed inside the repository and the local synthetic runtime. The technical pilot path is substantially stronger and reproducible. The release contract remains fail-closed: no real client documents may be used until every applicable P0 gate is `PASS` and approvals are bound to the exact release commit.

| Phase | Result | Evidence / remaining gate |
|---|---|---|
| 0. Scope and repository | PASS technical | Web pilot scope, dedicated branch, stale index lock removed, curated staging required |
| 1. Stable startup | PASS | Secure one-click startup verifies Postgres, ClamAV, backend, frontend and OCR; evidence in `artifacts/pilot-start/` |
| 2. Browser upload | PASS automated browser / MANUAL_REQUIRED native UX | Synthetic PDF upload, processing, reload and source coverage verified; native Windows picker signoff still requires a person |
| 3. Malware/file safety | PASS | EICAR rejected with controlled 4xx before storage/parsing/indexing; scanner unavailable fails closed; rejection audited |
| 4. Saksrom/streaming | PASS | Summary, ask, SSE, citations, source click, refusal and refresh verified with synthetic sources |
| 5. Auth/RBAC/tenant | PASS code and local tests / BLOCKED live IdP | Per-endpoint permissions and role tests are green; production requires configured OIDC, MFA and invited users |
| 6. Storage/backup/delete | PASS except target encryption attestation | AES-256-GCM backup/isolated restore and physical document deletion pass; encrypted target volumes must be attested |
| 7. Privacy/legal operations | PASS drafts / BLOCKED signatures | Pilot agreement, DPA, privacy notice, ROPA, security, incident, retention, logging, subprocessor and AI-provider policies exist as unsigned drafts |
| 8. HTTPS staging package | PASS build / BLOCKED live deployment | Production Compose, Nginx HTTPS, OAuth2 proxy, Postgres, ClamAV/OCR and non-root images validate/build; domain, certs, IdP and encrypted volumes are external |
| 9. Controlled real-data pilot | BLOCKED by design | Real-client-data gate correctly refuses use until external technical attestations and signed approvals exist |
| 10. Production release | PARTIAL | CI, E2E/unit suites, container builds, audits and SBOMs are prepared; signing, live monitoring, customer administration, support/billing/SLA and post-pilot validation remain |

## Verification

- Web: 35 files, 181 tests passed.
- Pilot/startup contracts: 4 files, 13 tests passed.
- Spring: 162 tests passed, 0 failures/errors, 3 environment-dependent skips.
- TypeScript lint and production web build passed (432 modules).
- Secure local pilot startup health passed.
- Runtime ClamAV upload gate passed.
- Source-bound multi-document runtime and deletion/retention gate passed.
- Runtime sensitive-log scan passed: 1,724 files, 0 marker findings.
- Root and web npm audits passed with 0 vulnerabilities.
- Production Compose validation and web/API Docker builds passed.
- CycloneDX web and backend SBOM generation passed.
- Backup/restore drill passed with AES-256-GCM and no live-database overwrite.

## Remaining hard gates

1. Attest encrypted document and PostgreSQL volumes on the actual managed target; then rerun raw-storage marker inspection.
2. Decide authoritative ownership for provider/policy mutation and add a real audited change path without creating duplicate routing authority.
3. Configure the real OIDC tenant, MFA, invited users and role claims; execute cross-user and cross-tenant smoke.
4. Provision the HTTPS domain, certificates, firewall, secrets and encrypted persistent volumes; deploy and run the gates there.
5. Build and sign the approved deliverable with the organisation's trusted signing identity.
6. Complete native Windows picker and managed-workstation smoke.
7. Sign the pilot agreement/DPA and collect Engineering, Product, Security/Privacy, IT and data-owner approvals against one commit.
8. Run phase 9 only after the real-client-data gate returns `PASS`; start with one approved document and retain a stop decision.
9. Complete post-pilot production capabilities: monitoring/alerts, customer administration, support, billing and SLA/terms.

## Rollback

The implementation is isolated on `codex/web-real-client-readiness`. Roll back by redeploying the previous image/commit, restoring the previous deployment configuration, and using the encrypted backup only through the documented explicit restore procedure. Database migrations in this change are not required for rollback.

## Repository health

**Improved.** Security defaults, runtime evidence, ownership boundaries, deployment packaging and release automation are clearer. The pre-existing mixed worktree still contains unrelated untracked material; only the curated release scope should be committed.
