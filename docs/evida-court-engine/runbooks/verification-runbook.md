
Verification Runbook
Purpose

Define how to verify that the EVIDA document uploader is fast, robust and legally honest.

Backend verification
Patch 1

Run evaluator unit tests.

Required scenarios:

small doc cannot partial
large doc can partial
full clean ready
terminal partial ready with permanent disclosure
failed doc
pending pages block ready
missing citation blocks readiness
missing index blocks readiness
permanent gap disclosure
idempotent repeated evaluation
Patch 2

Verify:

GET /coverage returns accurate counts
SSE emits document.progress
SSE emits document.partial_ready
SSE emits document.source_ready
SSE emits case.coverage_changed
page_unit.ready is not public by default
reconnect can recover via snapshot
Patch 3

Verify UI:

lawyer sees no raw enum names
document rows are compact
banner updates
problem modal hides technical details by default
source pills show Delvis/Merknad correctly
Patch 4

Verify retrieval:

NONE blocked
FAILED blocked
partial outside ready range blocked
partial inside ready range allowed with disclosure
terminal partial allowed with permanent disclosure
answer metadata includes disclosure
Performance verification

Measure:

time_to_first_row_visible
time_to_duplicate_result
time_to_first_upload_complete
time_to_first_source_ready
time_to_provisional_saksrom
time_to_first_useful_answer
time_to_50_percent_sources_ready
time_to_all_ingestion_closed
sse_event_lag
react_render_stability_under_large_documents
Legal integrity verification

Test a synthetic document:

Page 1 supports conclusion A.
Page 50 contradicts or qualifies conclusion A.
Only pages 1-10 are ready.

Expected:

Answer must disclose that pages 11-50 are not evaluated.
System must not state conclusion as complete document truth.
Terminal partiality verification

Test a document with one permanently unreadable page.

Expected:

status = READY
usageMode = FULL_WITH_PERMANENT_DISCLOSURE
disclosure.required = true
answer mentions unreadable page when source is used

