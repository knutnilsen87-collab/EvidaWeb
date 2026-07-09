
ADR 0002 — Partial Readiness with Disclosure
Status

Accepted

Context

Legal users need speed, but incomplete documents can contain later pages that materially change the legal conclusion.

A page or chunk being ready is not enough to call a document source-ready.

Decision

Support early use through:

PARTIAL + PARTIAL_WITH_DISCLOSURE

Only allow it when minimum viable evidence threshold is met:

totalPages > 5
usableTokens >= 1000
semanticBlockCount >= 1
citationMapReady = true
retrievalIndexUpdated = true
known gaps tracked = true

Documents with 5 pages or fewer must not become partial.

Consequences

Positive:

large documents become useful early
chat can answer with explicit caveat
avoids overclaiming
supports fast perceived UX

Negative:

retrieval must enforce ready ranges
UI must render disclosure
answer metadata becomes more complex
Terminal partiality

If all attempts are complete and permanent unreadable pages remain, close as:

READY + FULL_WITH_PERMANENT_DISCLOSURE

not FULL.
