
02 — Document Ingestion State Machine
Purpose

This document defines the lifecycle for a document from upload to source usability.

This is not the same as user-facing labels.

Internal ingestion states

Use or map existing states to this model:

queued
uploading
uploaded
parsing
page_units_writing
ocr_pending
ocr_running
chunking
embedding_pending
embedding_running
indexing
checking_readiness
partial_ready
processing_remaining
source_ready
failed
blocked
Readiness states

SourceReadinessStatus is separate:

public enum SourceReadinessStatus {
    NOT_READY,
    PARTIAL,
    READY,
    FAILED
}
Usage modes
public enum SourceUsageMode {
    NONE,
    PARTIAL_WITH_DISCLOSURE,
    FULL,
    FULL_WITH_PERMANENT_DISCLOSURE
}
State meaning
NOT_READY + NONE

Document cannot be used by retrieval/chat yet.

Typical causes:

upload incomplete
metadata incomplete
no citation map
no retrieval index
insufficient usable content
small document still processing
PARTIAL + PARTIAL_WITH_DISCLOSURE

Some content may be used, but answers must disclose that the document is incomplete.

Allowed only when minimum viable evidence threshold is met.

READY + FULL

Ingestion is closed and the document has no known permanent gaps.

READY + FULL_WITH_PERMANENT_DISCLOSURE

Ingestion is closed, document has usable source material, but some pages or ranges were permanently unreadable.

FAILED + NONE

Document has no usable source content.

Transition expectations

Required transitions to support:

NOT_READY + NONE
→ PARTIAL + PARTIAL_WITH_DISCLOSURE

PARTIAL + PARTIAL_WITH_DISCLOSURE
→ READY + FULL

PARTIAL + PARTIAL_WITH_DISCLOSURE
→ READY + FULL_WITH_PERMANENT_DISCLOSURE

NOT_READY + NONE
→ READY + FULL

NOT_READY + NONE
→ READY + FULL_WITH_PERMANENT_DISCLOSURE

NOT_READY + NONE
→ FAILED + NONE
Deny rules

Never transition to READY + FULL when:

pending pages remain
failed pages remain
permanently unreadable pages remain
citation map is not ready
retrieval index is not updated
document metadata is incomplete
all pages have not been attempted

Never transition to PARTIAL + PARTIAL_WITH_DISCLOSURE when:

document has 5 pages or fewer
usable tokens are below threshold
no semantic block exists
citation map is not ready
gaps are not tracked
retrieval index is not updated

Never transition to FAILED + NONE until:

processing is terminal for the document, or retries are exhausted
no usable content exists
Transactional rule

Whenever ingestion stage data changes and readiness is refreshed, both must be committed or rolled back together.

Use a single Spring @Transactional method for:

1. persist ingestion stage/page/chunk/failure update
2. build DocumentIngestionSnapshot
3. evaluate SourceReadiness
4. upsert SourceReadiness

Do not update page units in one transaction and source readiness in a later unrelated transaction.

Idempotency rule

Readiness refresh must be idempotent.

Calling refreshSourceReadiness(documentId) repeatedly with the same persisted snapshot must produce the same persisted readiness state.
