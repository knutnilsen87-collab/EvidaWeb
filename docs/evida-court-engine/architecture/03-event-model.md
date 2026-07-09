
03 — Event Model
Purpose

The event model gives Saksrom a live feeling without flooding UI or weakening legal integrity.

Internal events

Internal events may be granular:

page_unit.ready
page_unit.failed
chunk.indexed
document.stage_changed
document.retry_exhausted
source_readiness.changed

These are for backend orchestration, indexing and aggregation.

Public SSE events

Public events must be aggregated and user-meaningful:

document.progress
document.partial_ready
document.source_ready
document.gap_detected
document.failed
case.coverage_changed
Why no public page_unit.ready?

A 10,000-page PDF could create 10,000 page-level events. That can flood the SSE channel and cause frontend re-render churn.

Also, a page being ready is not the same as the document being source-ready.

Emission policy

Emit public progress events:

- on important stage transitions
- at most every 2-5 seconds per document
- or every 25-50 pages processed
- immediately when readiness status changes
- immediately when a permanent or user-actionable gap appears
- immediately when case coverage summary changes meaningfully
Snapshot + stream rule

SSE is not the source of truth.

Use:

GET /api/cases/{caseId}/coverage

for current snapshot.

Use:

GET /api/cases/{caseId}/coverage/events

for live updates.

On reconnect, frontend must reload snapshot and then continue stream.

Event envelope

All public events must use this envelope:

{
  "eventId": "evt_...",
  "eventType": "case.coverage_changed",
  "caseId": "case_...",
  "documentId": "doc_...",
  "schemaVersion": "1.0",
  "occurredAt": "2026-07-08T12:00:00Z",
  "payload": {}
}

documentId may be null for case-level events.

No raw secrets or stacktraces

Do not send raw stack traces, object storage paths, secrets or internal exception dumps in public events.

Technical details for support may be exposed only through explicit technical-details panels with authorization.
