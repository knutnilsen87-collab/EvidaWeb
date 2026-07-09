
Acceptance Checklist
Patch 1
 SourceReadinessStatus implemented.
 SourceUsageMode implemented.
 SourceReadiness persisted per document.
 SourceReadinessEvaluator.evaluate() is pure.
 Ingestion update + readiness refresh are transactional.
 JSONB fields mapped with @JdbcTypeCode(SqlTypes.JSON) or justified alternative.
 Small documents do not become partial.
 Large documents can become partial.
 Terminal partiality supported.
 Failed documents become FAILED + NONE.
 Unit tests pass.
Patch 2
 GET /api/cases/{caseId}/coverage implemented.
 GET /api/cases/{caseId}/coverage/events implemented.
 SSE uses event envelope.
 Public events are aggregated.
 No public page_unit.ready.
 case.coverage_changed emitted.
 Reconnect can recover via snapshot.
 Backend tests pass.
Patch 3
 Document rows show calm labels.
 Saksrom banner shows provisional coverage.
 Problem modal hides technical details by default.
 Chat disclosure note renders.
 Source pills show partial/permanent notes.
 No backend enum names in lawyer UI.
 Frontend mapping tests pass.
Patch 4
 Retrieval blocks NONE.
 Retrieval blocks failed documents.
 Partial retrieval limited to ready ranges.
 Disclosure fields passed to LLM.
 Answer metadata includes disclosure.
 UI can render disclosure from answer metadata.
 Retrieval guard tests pass.
Global acceptance
 Saksrom opens before full batch completion.
 First ready text-PDF can become usable quickly.
 OCR-heavy documents do not block all documents.
 Permanent unreadable pages are disclosed.
 No false source-ready state.
 User can understand what is ready, what is pending, and what failed.
