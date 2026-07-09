
Event Contracts
Public SSE endpoint
GET /api/cases/{caseId}/coverage/events
Required headers
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Event envelope

All public events must follow:

{
  "eventId": "evt_123",
  "eventType": "document.progress",
  "caseId": "case_123",
  "documentId": "doc_123",
  "schemaVersion": "1.0",
  "occurredAt": "2026-07-08T12:00:00Z",
  "payload": {}
}
Public events

Implement:

document.progress
document.partial_ready
document.source_ready
document.gap_detected
document.failed
case.coverage_changed
document.progress

Use for aggregated progress, not every page.

{
  "eventType": "document.progress",
  "payload": {
    "stage": "ocr_running",
    "readyPages": 45,
    "totalPages": 50,
    "usableTokens": 12000,
    "progressRatio": 0.9,
    "message": "OCR pågår"
  }
}
document.source_ready

Document-level only.

Never emit this for a page or chunk.

Aggregation rule

The backend must debounce public progress events:

max once every 2-5 seconds per document
or every 25-50 pages
or on readiness/status transition
Client reconnect rule

Frontend must:

Load GET /api/cases/{caseId}/coverage
Connect to SSE
Apply events idempotently
On disconnect, reconnect
On reconnect, reload snapshot before trusting accumulated state
