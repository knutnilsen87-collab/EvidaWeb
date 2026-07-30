# First User Readiness Matrix

Allowed statuses: `PASS`, `PARTIAL`, `BLOCKED`, `DEFERRED`, `N/A`.

P0 must be `PASS` before first-user release.

Production-ready-only policy is active for client data: `PARTIAL`, `SKIPPED`, `UNKNOWN`, and any unverified P0 item count as `BLOCKED`. No client-data feature may rely on user workarounds.

| ID | Area | Requirement | Priority | Automated evidence | Manual evidence | Owner | Status |
|---|---|---|---|---|---|---|---|
| FU-001 | Release | First-user scope locked | P0 | docs review | approval checklist | Product | PASS |
| FU-002 | Release | Status bundle final exists | P0 | bundle validation | release owner review | Platform | PASS |
| FU-003 | Release | Rollback path documented | P0 | release notes | approval checklist | Platform | PASS |
| FU-004 | Install | App builds in release mode | P0 | CI build | clean install smoke | Desktop | PASS |
| FU-005 | Install | App starts with clean profile | P0 | smoke/e2e | manual launch | Desktop | BLOCKED |
| FU-006 | Workspace | Create workspace | P0 | integration/e2e | smoke | Desktop | BLOCKED |
| FU-007 | Workspace | Create case | P0 | integration/e2e | smoke | Product/Desktop | PASS |
| FU-008 | Workspace | Restart preserves case | P0 | persistence test | close/reopen smoke | Desktop | BLOCKED |
| FU-009 | Upload | Accept valid PDF | P0 | Rust safety test + document stress suite | fixture smoke | Document | PASS |
| FU-010 | Upload | Accept valid DOCX | P0 | Rust safety test + document stress suite | fixture smoke | Document | PASS |
| FU-011 | Upload | Accept valid TXT | P0 | upload test | fixture smoke | Document | PASS |
| FU-012 | Upload | Reject unsupported type | P0 | Rust safety/extraction tests + document stress suite | fixture smoke | Document | PASS |
| FU-013 | Upload | Reject MIME mismatch | P0 | Rust safety test + document stress suite | fixture smoke | Document/Security | PASS |
| FU-014 | Upload | Handle corrupt PDF safely | P0 | Rust extraction test + document stress suite | fixture smoke | Document | PASS |
| FU-015 | Upload | Handle password PDF safely | P0 | document stress suite | fixture smoke | Document | PASS |
| FU-016 | Upload | Handle image-only scan explicitly | P0 | document stress suite | UI status smoke | Document/OCR | PASS |
| FU-017 | Upload | Size limit enforced | P0 | Rust safety test | N/A | Document | PASS |
| FU-018 | Upload | Hash every accepted document | P0 | integration test | artifact inspect | Document | PASS |
| FU-019 | Upload | Duplicate detection | P1 | integration test | smoke | Document | PASS |
| FU-020 | Upload | Source objects created | P0 | integration test | UI/source inspect | Document/AI | PASS |
| FU-021 | Upload | Failed docs excluded from AI | P0 | Rust/source-object tests + document stress suite | smoke | Document/AI | PASS |
| FU-022 | Upload | Upload status visible in UI | P0 | e2e/UI test | smoke | Product/UI | PASS |
| FU-023 | Upload | Upload audit events created | P0 | audit test | audit inspect | Platform | PASS |
| FU-024 | Upload | Sensitive document text not logged | P0 | log scan | N/A | Security | PASS |
| FU-025 | AI | Source-bound answer from one doc | P0 | AI eval | smoke | AI | PASS |
| FU-026 | AI | Source-bound answer from multiple docs | P0 | AI eval | smoke | AI | PASS |
| FU-027 | AI | Unsupported claim blocked | P0 | AI eval | adversarial smoke | AI | PASS |
| FU-028 | AI | Prompt injection ignored | P0 | adversarial provider validation test | smoke | AI/Security | PASS |
| FU-029 | AI | Retrieval snapshot saved | P0 | artifact test | inspect | AI/Platform | PASS |
| FU-030 | AI | External raw upload disabled by default | P0 | config test | settings inspect | AI/Security | PASS |
| FU-031 | Audit | Audit hash/tamper verification | P0 | tamper test | inspect | Platform | PASS |
| FU-032 | Audit | AI action audit event | P0 | audit test | inspect | Platform/AI | PASS |
| FU-033 | Audit | Export audit event | P1 | audit test | inspect | Platform | PASS |
| FU-034 | Export | Export source-based report | P1 | e2e/export test | smoke | Product | PASS |
| FU-035 | Export | Export includes timestamp/source basis | P1 | export assertion | inspect | Product | PASS |
| FU-036 | Data | Local data persists after restart | P0 | persistence test | smoke | Desktop | BLOCKED |
| FU-037 | Data | Backup/restore tested | P1/P0 real data | restore test | manual restore | Platform | PASS |
| FU-038 | Security | No secrets in repo | P0 | gitleaks | N/A | Security | PASS |
| FU-039 | Security | Dependency scan has no release-blocking issues | P0 | dependency scan | review | Security | PASS |
| FU-040 | Security | Prod-unsafe config blocked or pilot-labeled | P0 | config/startup test | inspect | Platform | PASS |
| FU-041 | UX | User-visible errors are safe and useful | P1 | UI/e2e | smoke | Product/UI | BLOCKED |
| FU-042 | UX | Loading/progress states for upload | P1 | `npm test` import UX assertions + `npm run build` | manual smoke still needed | Product/UI | PARTIAL |
| FU-043 | UX | Keyboard/basic accessibility smoke | P1 | manual | manual | UI | BLOCKED |
| FU-044 | CI | First-user gauntlet script exists | P0 | script run | N/A | Platform | PASS |
| FU-045 | CI | Golden path docs exist | P0 | file check | review | Platform | PASS |
| FU-046 | CI | First-user tests run in CI or documented local gate | P0 | CI/local evidence | approval | Platform | PASS |
| FU-047 | Review | Engineering approval | P0 | checklist | signature | Eng | BLOCKED |
| FU-048 | Review | Product approval | P0 | checklist | signature | Product | BLOCKED |
| FU-049 | Review | Security/privacy approval if any real data | P0 conditional | checklist | signature | Security | BLOCKED |
| FU-050 | Review | Known limitations shown to first user | P0 | release notes | review | Product | PASS |
| FU-051 | Client-data DoD | Client-data desktop DoD contract exists | P0 client-data | docs review | release owner review | Product/Platform | PASS |
| FU-052 | Managed Windows | Braathe/Jussys/managed workstation compatibility verified | P0 client-data | `windows_policy_diagnostics.current.json` | managed workstation smoke + IT approval | Desktop/IT | BLOCKED |
| FU-053 | Release security | Digest-pinned deployment images are signed and release identity is trusted | P0 client-data | `signature_verification.json` | target deployment smoke | Release/Security | BLOCKED |
| FU-054 | Data protection | Local client-data storage protection verified | P0 client-data | `encryption_verification.json` + `raw_storage_inspection.json` | security review | Platform/Security | BLOCKED |
| FU-055 | Data protection | Runtime sensitive log scan with marker documents passes | P0 client-data | `runtime_sensitive_log_scan.json` | diagnostics review | Security | PASS |
| FU-056 | Upload | Document upload final closure evidence exists | P0 client-data | `document_upload_final_result.json` + `manual_review_result.json` + `import_eta_result.json` | desktop smoke | Document/Product | BLOCKED |
| FU-057 | AI | Multi-document source-bound AI client-data eval passes | P0 client-data | `ai_multi_doc_eval.json` + retrieval/prompt/unsupported-claim eval artifacts | adversarial smoke | AI/Security | PASS |
| FU-058 | Audit | Full audit coverage for client-data actions | P0 client-data | `audit_coverage_result.json` | audit inspect | Platform | PASS |
| FU-059 | Export | Export with source basis and audit event passes | P0 client-data | `export_smoke_result.json` | export inspect after restart | Product/Platform | PASS |
| FU-060 | Release security | Signed SBOM, SCA, SAST and CI provenance complete | P0 client-data | release security artifacts | release owner review | Security/Release | BLOCKED |
| FU-061 | Smoke | Clean-machine client-data desktop smoke passes | P0 client-data | `clean_machine_smoke_result.json` | clean Windows profile/machine | Desktop/QA | BLOCKED |
| FU-062 | Approval | Braathe/IT and client-data pilot approvals exist | P0 client-data | approval artifacts | written approvals tied to bundle version | Product/Security/IT | BLOCKED |
| FU-063 | Upload | Erstatt fil is production-grade versioned replacement with supersede semantics | P0 client-data | replacement/version/source invalidation tests | runtime PostgreSQL replacement + audit review | Document/Platform/AI | PASS |
| FU-064 | OCR | Small-text/image OCR enhancement, retry metadata, confidence gating and source_ready control verified | P0 client-data | OCR enhancement/retry tests | preview/manual review smoke | Document/OCR/AI | BLOCKED |

## Current Evidence Snapshot

Updated 2026-07-30 after executing phases 0-10 and the eleven-port external closure pass for the web/Spring pilot. Secure startup, browser upload/reload, ClamAV rejection, source-bound Saksrom, endpoint RBAC, physical deletion, encrypted backup/restore, production containers, authoritative provider-policy and full policy-mutation audit are verified with synthetic data. Production OIDC now fails closed without HTTPS issuer, MFA evidence and an explicit role allowlist. First-user release and real client data remain NO-GO because target-volume encryption/raw inspection, trusted signing, managed-workstation/native-picker signoff, live IdP/HTTPS, signed pilot agreement/DPA and human approvals remain external or unresolved. Any remaining `BLOCKED` or `PARTIAL` P0 row means NO-GO.

Latest batch evidence:

- `npm test` passes 181 web tests and 17 pilot-script tests.
- Spring/Maven passes 175 tests with 0 failures and 3 intentional environment-dependent skips.
- `scripts/pilot/test-source-bound-runtime.ts` passes against PostgreSQL, ClamAV and the active backend, including versioned replacement, exclusion of invalidated source units, document/case deletion, authoritative provider-policy mutation and verified case/global audit chains.
- `scripts/pilot/test-backup-restore-drill.ps1` passes with AES-256-GCM backup and isolated database/storage restore.
- Runtime log scanning passes across 1,724 files with 0 marker findings.
- Both npm dependency audits report 0 vulnerabilities; the production Compose file validates, web/API images build, and CycloneDX SBOM generation succeeds locally.
- Fail-closed target scripts now cover BitLocker attestation, offline marker scan, live OIDC/MFA/roles, HTTPS/certificate/firewall and cosign verification.
- Manual native-picker/managed-machine smoke, target storage attestation, live IdP/HTTPS execution, signing and approvals remain unresolved.

Evidence artifacts:

- `artifacts/first-user/evidence.first_user.current.json`
- `artifacts/first-user/invariant_evaluation.first_user.json`
- `artifacts/first-user/status_bundle.first_user.final.json`
- `artifacts/first-user/client_data_desktop_dod_result.json`
- `artifacts/first-user/client_data_desktop_dod_status_bundle_patch.template.json`
- `artifacts/first-user/windows_policy_diagnostics.current.json`
- `artifacts/first-user/signature_verification.json`
- `artifacts/first-user/runtime_sensitive_log_scan.json`
- `artifacts/first-user/raw_storage_inspection.json`
- `artifacts/first-user/encryption_verification.json`
- `artifacts/first-user/audit_coverage_result.json`
- `artifacts/first-user/export_smoke_result.json`
- `artifacts/first-user/provider_policy_result.json`
- `artifacts/first-user/production_identity_result.json`
- `artifacts/first-user/live_https_edge_result.json`
- `artifacts/first-user/pilot_agreement_dpa_approval.json`
- `artifacts/first-user/document_replacement_eval.json`
- `artifacts/first-user/backup_restore_result.json`
- `artifacts/release/release_manifest.json`
- `artifacts/release/sbom-web.cdx.json`
- `artifacts/release/sbom-backend.cdx.json`
- `artifacts/production-dod/evida-production-dod-report.json`
- `artifacts/document-upload-stress/evida-document-upload-stress-report.json`
