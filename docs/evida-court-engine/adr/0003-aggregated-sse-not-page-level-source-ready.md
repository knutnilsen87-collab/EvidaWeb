
ADR 0003 — Aggregated SSE, Not Page-Level Source Ready
Status

Accepted

Context

Large legal folders and large PDFs can produce thousands of page/chunk events.

Sending every page event to the UI would overload the SSE stream and cause frontend rendering noise.

Also, page-level readiness is not document-level source readiness.

Decision

Keep page_unit.ready internal.

Expose public SSE events only as aggregated document/case events:

document.progress
document.partial_ready
document.source_ready
document.gap_detected
document.failed
case.coverage_changed

document.source_ready is document-level only.

Consequences

Positive:

UI remains calm
SSE scales better
avoids semantic confusion
supports provisional Saksrom

Negative:

backend needs event aggregation
frontend cannot show every page instantly by default
Reconnect

SSE is not source of truth.

Frontend must reload:

GET /api/cases/{caseId}/coverage

on initial load and reconnect.
