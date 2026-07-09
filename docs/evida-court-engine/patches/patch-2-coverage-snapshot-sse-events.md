
Patch 2 — Coverage Snapshot + SSE Events
Goal

Expose source-readiness state to Saksrom through a stable snapshot endpoint and a live SSE stream.

Depends on Patch 1.

Scope

Implement:

CaseCoverageSummary
DocumentCoverageItem
CaseCoverageService
GET /api/cases/{caseId}/coverage
GET /api/cases/{caseId}/coverage/events
DocumentEventEnvelope
CoverageEventAggregator
DocumentEventPublisher
SSE reconnect behavior
backend tests
Snapshot endpoint
GET /api/cases/{caseId}/coverage

Must return current coverage computed from persisted SourceReadiness.

SSE endpoint
GET /api/cases/{caseId}/coverage/events

Must return text/event-stream.

Public events

Implement:

document.progress
document.partial_ready
document.source_ready
document.gap_detected
document.failed
case.coverage_changed
Internal events

Internal event producers may emit:

page_unit.ready
page_unit.failed
chunk.indexed
source_readiness.changed

Do not expose page-level events directly to the lawyer UI.

Event aggregation

Debounce document.progress:

max once every 2-5 seconds per document
or every 25-50 pages
or immediately on status/readiness transition
Acceptance criteria

Patch is complete when:

- coverage snapshot endpoint returns accurate case summary
- SSE endpoint streams public events
- public progress events are aggregated/debounced
- document.source_ready is document-level only
- case.coverage_changed is emitted when summary changes
- reconnect can recover via snapshot
- tests cover event payload shape and coverage calculations

