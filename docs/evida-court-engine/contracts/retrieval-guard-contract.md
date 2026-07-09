
Retrieval Guard Contract
Purpose

Prevent retrieval/chat from using documents that are not legally usable as sources.

The guard is mandatory. Prompt instructions alone are not enough.

RetrievedSource

Every retrieved chunk passed to an LLM must include readiness context.

type RetrievedSource = {
  documentId: string
  chunkId: string
  filename: string

  pageRange: {
    fromPage: number
    toPage: number
  }

  text: string

  readinessStatus:
    | "NOT_READY"
    | "PARTIAL"
    | "READY"
    | "FAILED"

  usageMode:
    | "NONE"
    | "PARTIAL_WITH_DISCLOSURE"
    | "FULL"
    | "FULL_WITH_PERMANENT_DISCLOSURE"

  disclosureRequired: boolean
  disclosureMessage: string | null
  reasoningInstruction: string | null

  knownGaps: Array<{
    page?: number
    fromPage?: number
    toPage?: number
    userMessage: string
    permanent: boolean
  }>
}
Guard rules
NONE

If usageMode = NONE, block the chunk.

Do not pass text to LLM.
Do not cite it.
Do not include it in answer context.
PARTIAL_WITH_DISCLOSURE

Allow chunk only if:

chunk page range is within readyRanges
citationReady = true

The answer must disclose partiality.

FULL

Allow normal source use.

FULL_WITH_PERMANENT_DISCLOSURE

Allow source use, but the answer must disclose permanent unreadable gaps when relevant.

Backend enforcement

The retrieval pipeline must enforce:

query
→ retrieve candidate chunks
→ join SourceReadiness
→ apply usageMode guard
→ return allowed sources with disclosure fields

Do not let the LLM decide whether to ignore readiness.

Forbidden

Do not:

pass raw chunks from NOT_READY documents
pass chunks from failed documents
rely only on prompt wording
strip disclosure fields before LLM call
cite page ranges outside readyRanges for partial documents
