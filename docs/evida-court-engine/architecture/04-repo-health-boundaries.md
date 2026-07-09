
04 — Repo Health and Ownership Boundaries
Purpose

Prevent the document uploader from becoming a pile of upload helpers, parser conditionals and prompt hacks.

Required ownership boundaries

Recommended backend structure:

documents/
  ingestion/
    IngestionJobService
    IngestionStateMachine
    DocumentIngestionSnapshotBuilder
    IngestionFailure

  readiness/
    SourceReadiness
    SourceUsageMode
    SourceReadinessStatus
    SourceReadinessEvaluator
    SourceReadinessRepository
    CaseCoverageService

  events/
    DocumentEventPublisher
    CaseCoverageSseController
    CoverageEventAggregator

  retrieval/
    ReadinessAwareRetrievalGuard
    RetrievedSource
    SourceDisclosurePolicy

  upload/
    UploadSessionService
    DuplicateCheckService

Recommended frontend structure:

components/documents/
  DocumentStatusRow.tsx
  DocumentProblemModal.tsx
  DocumentStatusBadge.tsx

components/case-room/
  CaseCoverageBanner.tsx
  SourceCoverageSummary.tsx

components/chat/
  SourceDisclosureNote.tsx
  SourcePill.tsx

lib/documents/
  readinessLabels.ts
  coverageMapping.ts
  disclosureMapping.ts
Do not put readiness logic in
OCR worker
PDF parser
React components
LLM prompt
generic utils/helper file
upload route/controller
Dependency direction

Allowed:

ingestion → readiness
events → readiness
retrieval → readiness
UI → coverage/readiness DTOs

Not allowed:

readiness → OCR implementation
readiness → React UI
readiness → LLM prompt
parser → decides usageMode
UI → derives legal source status from raw page units
Clean success rule

Do not claim implementation success if:

readiness logic is duplicated
UI maps raw backend enum names directly to users
chat can use chunks without readiness context
source-ready can be emitted at page/chunk level
permanent unreadable pages can be silently ignored
