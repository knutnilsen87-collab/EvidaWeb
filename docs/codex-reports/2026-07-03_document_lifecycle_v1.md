# Phase 03 - Document Lifecycle V1

Date: 2026-07-03
Terminal state: succeeded

## Scope completed
- Added explicit document lifecycle statuses: `APPROVED_FOR_INGESTION`, `INGESTING`, `INGESTION_FAILED`, `SOURCE_READY`, `ARCHIVED`, `DELETED`, and `REJECTED`.
- Added tenant-scoped document detail, download, approve-for-ingestion, reject, archive, and delete endpoints.
- Added rejection reason persistence and lifecycle migration.
- Changed normal document lists to hide archived and deleted documents by default.
- Updated ingestion completion to mark documents `SOURCE_READY`, preserving the distinction between approval and source readiness.
- Updated the web quarantine gate API calls and UI actions for approve/reject/archive.

## Verification
- Backend: `./mvnw.cmd test` passed, 34 tests.
- Backend package: `./mvnw.cmd -DskipTests package` passed.
- Local API lifecycle smoke passed from an ASCII temp path with `dev` profile:
  - upload returned `QUARANTINE`
  - approve returned `APPROVED_FOR_INGESTION`
  - wrong tenant document lookup returned `403`
  - archive returned `ARCHIVED`
  - normal list returned `0` rows for the archived document
- Web validation from this phase before the final list-filter fix: `npm run lint`, `npm run test -- --run`, and `npm run build` passed with 57 tests.

## Notes
- Spring Boot app startup from the repository's emoji path remains unreliable for direct `java -jar`/Maven smoke execution. Runtime smoke was executed from `%TEMP%` using a copied jar.
- Browser UI smoke was not available in this Codex session because the in-app browser automation tool was not exposed.
