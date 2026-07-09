# Phase 04 - PDF/OCR Ingestion + Source Units

Date: 2026-07-03
Terminal state: succeeded

## Scope completed
- Added real PDF text extraction with Apache PDFBox.
- Added explicit parsed-document/page/text-block parser contract with OCR flags.
- Added `document_source_units` entity, repository, and Flyway migration.
- Added ingestion state machine: `APPROVED_FOR_INGESTION -> INGESTING -> SOURCE_READY` or `INGESTION_FAILED`.
- Added fail-closed OCR path: blank/scanned PDFs return `OCR_REQUIRED_NOT_CONFIGURED` and do not become `SOURCE_READY`.
- Added tenant-scoped source unit APIs:
  - `POST /api/documents/{id}/ingest`
  - `GET /api/documents/{id}/source-units`
  - `GET /api/documents/{id}/source-units/window?page=&radius=`
- Updated web API bindings, quarantine ingestion action, source window loading, and tests so frontend does not show mock `source-ready` source units.

## Verification
- Backend: `./mvnw.cmd test` passed, 37 tests.
- Backend package: `./mvnw.cmd -DskipTests package` passed.
- Web: `npm run lint` passed.
- Web: `npm run test -- --run` passed, 19 files / 58 tests.
- Web: `npm run build` passed.
- Runtime smoke from ASCII temp path with dev profile passed:
  - text PDF upload returned `QUARANTINE`
  - approve returned `APPROVED_FOR_INGESTION`
  - ingest returned `SOURCE_READY`
  - source-unit count was `1`
  - source-unit text contained `Strafferettslig kildegrunnlag for EVIDA phase four smoke`
  - wrong tenant source-unit request returned `403`
  - blank PDF ingest returned `INGESTION_FAILED`
  - blank PDF error code was `OCR_REQUIRED_NOT_CONFIGURED`

## Notes
- OCR is intentionally not configured. The implementation fails closed instead of pretending OCR succeeded.
- Browser UI smoke remains unavailable in this Codex session because no browser automation tool is exposed.
