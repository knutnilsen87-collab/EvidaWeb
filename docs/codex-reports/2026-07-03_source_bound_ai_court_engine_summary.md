# Source-bound AI and Court Engine summary

Date: 2026-07-03

## Scope

- Implemented source-bound Saksrom endpoints and frontend integration.
- Added Court Engine operative summary flow from source-ready documents to stored summary and frontend Zod validation.
- Preserved fail-closed behavior: no documented legal finding is returned as verified, ambiguous, or requires_manual_review without at least one source reference.

## Backend

- Added `GET /api/source-units/search`.
- Added `POST /api/saksrom/ask`.
- Added `POST /api/files/upload`.
- Added `POST /api/analysis/start`.
- Added `GET /api/cases/{caseId}/summary`.
- Added stored operative summaries via `operative_summaries` and migration `V007__operative_summaries.sql`.
- Added Java-side Court Engine validator mirroring the frontend source rules.
- Fixed non-UUID case IDs in Saksrom fallback search so UI demo case IDs do not produce 500s.

## Frontend

- Added Court Engine types and Zod schema under `src/engine`.
- Added validated summary fetcher under `src/api/summary.ts`.
- Added `useCourtEngine` hook and `formatOperativeSummary`.
- Added `ChatArea` and upload component for analysis flow.
- Wired `QuarantineGate` to start Court Engine analysis after successful ingestion.
- Wired `AppShell` to inject a validated operative summary message when analysis is completed.
- Added `zod` dependency.

## Verification

- Backend tests: `mvnw.cmd test` passed, 43 tests.
- Backend package: `mvnw.cmd -DskipTests package` passed.
- Web tests: `npm run test -- --run` passed, 19 files / 60 tests.
- Web typecheck: `npm run lint` passed.
- Web build: `npm run build` passed.
- Runtime smoke: `scripts/codex_phase05_court_smoke.ps1` passed:
  - document upload
  - approval
  - ingestion to `SOURCE_READY`
  - source-unit retrieval
  - keyword source search
  - source-bound Saksrom answer with real `sourceUnitId`
  - no-source answer with `NO_SOURCE_BASIS`
  - Court Engine `analysisStatus=completed`
  - stored summary fetch for a real UUID case created by the smoke
  - wrong tenant search returned `403`
  - audit verification returned `auditValid=true`
  - request ID header returned `X-Request-ID: smoke-request-id`

## Limitations

- Browser automation was not available in this environment, so UI verification is covered by unit tests, typecheck, and production build rather than an interactive browser smoke.
