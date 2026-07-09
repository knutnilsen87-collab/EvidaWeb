# EVIDA Court Engine — Document Upload, Source Readiness and Live Saksrom

## Purpose

This folder is the implementation authority for the EVIDA document uploader, ingestion pipeline, source-readiness model, live coverage stream, progressive disclosure UI and readiness-aware retrieval guard.

Codex/Cursor must follow these documents as bounded implementation tasks.

The target product behavior is:

> First usable legal value as fast as possible. Full evidentiary integrity always. Never mark a document as fully usable unless the backend can explain why.

## Required outcome

EVIDA must support fast, asynchronous document ingestion where:

- documents appear immediately in the UI
- hash-based duplicate checks avoid unnecessary upload and processing
- upload and ingestion are separated
- processing happens asynchronously in workers
- large documents can become partially usable with explicit disclosure
- small documents are not partially exposed because context risk is too high
- terminal partiality is supported when pages are permanently unreadable
- Saksrom opens early in provisional mode
- SSE updates case coverage live
- chat/retrieval can only use chunks according to `SourceReadiness` and `SourceUsageMode`
- technical failure details are hidden from lawyers unless expanded

## Non-negotiables

1. `SourceReadinessEvaluator` is the only authority that decides source-readiness and usage mode.
2. `SourceReadinessEvaluator.evaluate()` must be a pure function.
3. Ingestion stage updates and readiness refresh must happen in the same Spring transaction.
4. Backend enums and technical codes must not be shown directly to lawyers.
5. `document.source_ready` must never be emitted at page/chunk level.
6. Page/chunk readiness can exist internally, but public UI/SSE receives aggregated progress.
7. Chat must not receive or use chunks without readiness context.
8. `READY` does not mean `FULL`; usage is controlled by `SourceUsageMode`.
9. `FULL_WITH_PERMANENT_DISCLOSURE` is mandatory for terminal partiality.
10. Do not create broad utilities or duplicate source-readiness logic in parser/OCR/retrieval/UI.

## Implementation order

Implement exactly in this order:

1. Patch 1 — Contracts + SourceReadinessEvaluator
2. Patch 2 — Coverage Snapshot + SSE Events
3. Patch 3 — Saksrom Live UX + Progressive Disclosure
4. Patch 4 — Readiness-Aware Retrieval Guard

Do not start Patch 3 or Patch 4 before Patch 1 has passed its unit tests.
