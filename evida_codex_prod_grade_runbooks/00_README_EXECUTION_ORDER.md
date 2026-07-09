# EVIDA Codex Execution Pack — Production Grade Roadmap

## Purpose

This folder contains repo-ready execution documents for Codex.

Codex must execute these documents without asking clarification questions.

## Correct repository path

Use this repo root:

```powershell
F:\prosjekter_MAIN\EVIDA

Use this web root:

F:\prosjekter_MAIN\EVIDA\apps\web

Do not use the old path:

F:\prosjekter_MAIN\EVIDA

unless the filesystem proves it is intentionally active.

Current operational truth
EVIDA Web exists as a React/Vite/TypeScript app under apps/web.
Web is detached from Tauri/Rust IPC/local SQLite.
Web audit/lint/test/build were green.
Frontend upload contract exists.
Backend upload/auth/tenant/quarantine/large-PDF ingestion contracts exist.
Spring Boot tests were not locally verified because Maven was missing.
Maven wrapper was missing in the reported environment.
Several production-critical surfaces are still mock-based.
Physical object storage was not implemented at the time of the bundle.
PDF/OCR/vector/source indexing was not implemented.
Production OIDC/RBAC/secrets/TLS/rate limiting were not implemented.
Product is not production-ready.
Execution order

Run these documents in order:

00_README_EXECUTION_ORDER.md
01_UPLOAD_E2E_LOCAL_QUARANTINE.md
02_BACKEND_VERIFICATION_AND_CI.md
03_DOCUMENT_LIFECYCLE_V1.md
04_PDF_OCR_INGESTION_SOURCE_UNITS.md
05_SOURCE_BOUND_AI_AND_SAKSROM.md
06_SECURITY_TENANT_AUTH_PROD_HARDENING.md
07_OBSERVABILITY_AUDIT_DEPLOYMENT.md
08_PROD_GRADE_DOD_AND_RELEASE_GATE.md
Global Codex rule

Codex must not ask questions.

If ambiguous:

Inspect repository.
Prefer existing conventions.
Choose the smallest reversible implementation.
Document assumption.
Add ambiguity flag.
Continue with safe local prototype path.
Stop only on safety, data-loss, missing dependency, or unverifiable execution blocker.
Global no-go rules

Do not do UI polish.

Do not change:

AppShell layout
Dashboard styling
TopBar
Sidebar
ControlPanel
glass tokens
background images
typography
sticky chatbar
Command Portal layout
modal visual system

Do not claim production readiness until 08_PROD_GRADE_DOD_AND_RELEASE_GATE.md passes.

Required report after every execution

Codex must write a report in:

docs/codex-reports/YYYY-MM-DD_<phase_name>.md

Each report must include:

# Codex Report — <phase>

## Metadata
- generated_at:
- repo_root:
- web_root:
- branch:
- phase:
- terminal_state: succeeded | partial | failed | blocked

## Executive summary

## Files changed

## Commands run

## Test results

## Smoke results

## Security checks

## Repo-health verdict
improved | preserved | degraded

## Remaining limitations

## Ambiguity flags

## Recommended next action

## Fallback action

## Stop path signal
Terminal-state definitions
succeeded

Use only when all implementation, tests, and smoke checks required by the current document passed.

partial

Use when meaningful progress was made, but at least one required verification step is missing or incomplete.

failed

Use when commands/tests/smoke checks ran and proved the implementation is incorrect.

blocked

Use when execution cannot continue because the environment, dependency, auth contract, build tool, or missing service prevents verification.

Repo-health invariant

A change is not clean success if it:

creates duplicated contracts
adds private incompatible DTOs
bypasses tenant isolation
introduces broad utilities with unclear ownership
leaves critical dead code
widens scope without tests
hides mock data behind production UI
breaks frontend/backend boundary
reduces verification clarity