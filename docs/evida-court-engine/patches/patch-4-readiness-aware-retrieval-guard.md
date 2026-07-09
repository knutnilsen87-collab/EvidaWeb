
Patch 4 — Readiness-Aware Retrieval Guard
Goal

Ensure chat/reasoning can only use document chunks according to SourceReadiness and SourceUsageMode.

Depends on Patch 1. UI disclosure display from Patch 3 should exist.

Scope

Implement:

ReadinessAwareRetrievalGuard
RetrievedSource readiness fields
SourceDisclosurePolicy
filtering of NONE sources
readyRange enforcement for partial documents
disclosure propagation to LLM/context
answer metadata for UI disclosure
tests
Retrieval flow

Required flow:

user query
→ retrieve candidate chunks
→ load SourceReadiness for documentIds
→ apply usageMode guard
→ remove blocked chunks
→ attach disclosure metadata
→ send allowed context to LLM
→ return answer with source disclosure metadata
→ UI renders disclosure notes
Guard rules
NONE

Block.

Do not send to LLM.
Do not cite.
Do not include in answer source list.
PARTIAL_WITH_DISCLOSURE

Allow only chunks within readyRanges.

Attach disclosure.

FULL

Allow.

No disclosure required.

FULL_WITH_PERMANENT_DISCLOSURE

Allow.

Attach permanent disclosure.

Mandatory source metadata

Every source returned from retrieval must include:

documentId
chunkId
filename
pageRange
readinessStatus
usageMode
disclosureRequired
disclosureMessage
reasoningInstruction
knownGaps summary
Tests

Required tests:

NONE source is blocked
FAILED + NONE source is blocked
partial source outside ready range is blocked
partial source inside ready range is allowed with disclosure
full source is allowed without disclosure
terminal partial source is allowed with permanent disclosure
mixed answer with full + partial sources gets disclosure
no raw technical code appears in answer metadata unless in debug/support payload
Acceptance criteria

Patch is complete when:

- retrieval cannot use NOT_READY or FAILED docs
- partial documents are range-guarded
- disclosure fields propagate to LLM and answer response
- UI can render source disclosure notes
- unit/integration tests cover all usage modes
Forbidden

Do not rely only on prompt text.

Do not let the LLM decide whether readiness matters.

Do not send blocked chunks to the LLM "just in case".
