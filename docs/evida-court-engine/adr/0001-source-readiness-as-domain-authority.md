
ADR 0001 — SourceReadiness as Domain Authority
Status

Accepted

Context

EVIDA needs to ingest legal documents quickly while preventing the AI from treating incomplete or failed documents as complete evidence.

Without a single source-readiness authority, logic would spread across parsers, OCR workers, UI and prompts.

Decision

Create SourceReadiness and SourceReadinessEvaluator as the canonical domain authority for document source usability.

Only SourceReadinessEvaluator may decide:

status
usageMode
disclosure
ambiguity flags
ingestion closed state
Consequences

Positive:

prevents duplicated legal-readiness logic
keeps parser/OCR technical states separate from legal source status
gives retrieval a hard guard contract
gives UI a stable mapping model

Negative:

requires snapshot builder
requires transactional refresh discipline
adds one more persisted model
Non-negotiable implementation rule

SourceReadinessEvaluator.evaluate() must be a pure function.
