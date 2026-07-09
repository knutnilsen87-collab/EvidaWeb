
Phase 08 — Production Grade Definition of Done + Commercial Release Gate
Objective

Define and enforce the commercial release gate.

EVIDA must not be called production-ready unless this gate passes.

Release classification

Use one:

prototype
local_mvp
staging_candidate
release_candidate
commercial_release_ready
production_rejected
Commercial release hard blockers

Any unchecked item below blocks commercial release.

1. Auth and tenant isolation
[ ] Production OIDC/IdP configured
[ ] Session/token expiry policy implemented
[ ] RBAC implemented
[ ] Tenant membership enforced
[ ] Missing auth rejected
[ ] Missing tenant rejected
[ ] Wrong tenant rejected across all critical endpoints
[ ] Cross-tenant document access tested
[ ] Cross-tenant source access tested
[ ] Cross-tenant Saksrom context tested
[ ] Cross-tenant export tested if export exists
2. Document lifecycle
[ ] Upload works E2E
[ ] Local or production object storage writes files
[ ] Production storage strategy documented
[ ] Metadata persists
[ ] Document list is backend-backed
[ ] Document detail is backend-backed
[ ] Download/preview is authorization-protected
[ ] Approve/reject works
[ ] Archive/delete works
[ ] Storage cleanup policy exists
[ ] File size limits exist
[ ] MIME/type checks exist
[ ] Path traversal tests pass
[ ] Malware scanning strategy exists
3. Ingestion and source units
[ ] PDF parser extracts text
[ ] OCR-required path is explicit
[ ] OCR engine configured or OCR gap blocks release
[ ] Ingestion states are explicit
[ ] SOURCE_READY requires source units
[ ] VERIFIED cannot happen without evidence
[ ] Source units persist
[ ] Source unit retrieval is tenant-isolated
[ ] Large PDF strategy tested
[ ] Parser failure is fail-closed
4. Source-bound AI and Saksrom
[ ] Saksrom uses real source units
[ ] No-source behavior is explicit
[ ] Citation pills reference real sourceUnitId
[ ] PDF/source jump works
[ ] Hallucinated citations are prevented
[ ] AI answers distinguish source-backed vs not source-backed
[ ] Prompt/context logging policy exists
[ ] Sensitive content logging policy exists
5. Legal workflow completeness

At least one commercial workflow must be real:

[ ] Create case
[ ] Upload document
[ ] Quarantine document
[ ] Approve document
[ ] Ingest document
[ ] Create source units
[ ] Ask source-bound question
[ ] Jump to cited source
[ ] Create chronology item
[ ] Create evidence matrix item
[ ] Create draft or export if sold
[ ] Audit trail captures actions

If Utkast/DOCX is sold:

[ ] DOCX generation is real
[ ] Export includes source references
[ ] Export is permission-protected
[ ] Export artifact is auditable
[ ] Export can be reproduced from stored inputs
6. Mock removal
[ ] No critical production path uses mock documents
[ ] No critical production path uses mock source units
[ ] No critical production path uses mock RAG/citations
[ ] Demo mode is explicitly gated
[ ] Dev mocks cannot be enabled in production accidentally
7. Testing
[ ] Backend tests pass in CI
[ ] Frontend lint passes in CI
[ ] Frontend tests pass in CI
[ ] Frontend build passes in CI
[ ] E2E lifecycle test passes
[ ] Upload smoke passes
[ ] Ingestion smoke passes
[ ] Citation smoke passes
[ ] Wrong-tenant smoke passes
[ ] Migration tests pass
[ ] Failure-mode tests pass

Minimum E2E lifecycle:

login
create case
upload document
list document
approve for ingestion
ingest
fetch source units
ask Saksrom
receive source-bound answer
click citation
archive/delete document
check audit
8. Security
[ ] Dependency scan clean or accepted risk documented
[ ] Secret scan clean
[ ] CORS locked down
[ ] Security headers configured
[ ] TLS required in production
[ ] Secure cookie/session policy
[ ] Rate limiting configured
[ ] Upload hardening tested
[ ] SQL injection risk reviewed
[ ] XSS risk reviewed
[ ] Object storage access least-privilege
[ ] Database credentials managed as secrets
[ ] No hardcoded secrets
9. Observability and audit
[ ] Request IDs
[ ] Structured backend logs
[ ] Frontend error capture strategy
[ ] Audit events for document actions
[ ] Audit events for source/Saksrom/export actions
[ ] Tenant ID in audit events
[ ] User ID in audit events
[ ] Health endpoints
[ ] Metrics strategy
[ ] Alerting strategy
[ ] Incident runbook
10. Deployment and operations
[ ] Staging environment exists
[ ] Production environment exists
[ ] CI/CD pipeline exists
[ ] Database migrations run in deployment
[ ] Migration rollback/forward-fix strategy exists
[ ] Object storage configured
[ ] Environment variables documented
[ ] Secrets documented
[ ] Backup configured
[ ] Restore tested
[ ] App rollback tested
[ ] Ingestion disable switch exists
[ ] AI/Saksrom disable switch exists if AI is live
11. Commercial readiness
[ ] Tenant onboarding documented
[ ] Admin setup documented
[ ] User roles documented
[ ] Privacy policy ready
[ ] DPA ready if B2B/legal SaaS
[ ] Terms ready
[ ] Support process defined
[ ] Known limitations documented
[ ] Customer-facing errors are understandable
[ ] Demo data isolated
[ ] No real customer data in dev/demo mode
Release gate command set

Backend:

cd "<selected-maven-root>"
.\mvnw test

Web:

cd "F:\prosjekter_MAIN\EVIDA\apps\web"
npm run lint
npm run test -- --run
npm run build

Security:

cd "F:\prosjekter_MAIN\EVIDA\apps\web"
npm audit --audit-level=moderate

If available:

gitleaks detect --source "F:\prosjekter_MAIN\EVIDA"

E2E:

npm run test:e2e

If no E2E framework exists, release cannot be commercial_release_ready; classify as staging_candidate at most.

Final release report

Create:

docs/release/production-readiness-report.md

Template:

# EVIDA Production Readiness Report

## Classification
prototype | local_mvp | staging_candidate | release_candidate | commercial_release_ready | production_rejected

## Executive summary

## Evidence

## Passed gates

## Failed gates

## Accepted risks

## Release blockers

## Security status

## Data/privacy status

## Operational status

## Test results

## Smoke results

## Commercial readiness

## Final decision

## Required next action

## Fallback plan
Decision rules
commercial_release_ready

Allowed only if:

every hard blocker is resolved
E2E lifecycle passes
security release blockers are resolved
tenant isolation is proven
production deployment/rollback exists
audit trail exists
customer onboarding/support/legal docs exist
release_candidate

Allowed if:

core lifecycle works in staging
remaining issues are non-critical
security has no critical blocker
commercial docs may still be in final review
staging_candidate

Allowed if:

upload/document/ingestion/source/citation works locally
CI passes
production security and ops are still incomplete
local_mvp

Allowed if:

local core loop works
backend/web tests pass
not production deployed
prototype

Default until real backend, storage, ingestion, and source-bound workflow are proven.

production_rejected

Use if:

tenant isolation fails
auth is unsafe
source/citation is fake in production path
document storage is unsafe
security critical issue exists
E2E lifecycle fails