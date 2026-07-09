
Codex Execution Runbook
Purpose

This runbook tells Codex/Cursor how to implement the EVIDA Court Engine document uploader safely.

Execution order

Implement exactly in this order:

Patch 1 — Contracts + SourceReadinessEvaluator
Patch 2 — Coverage Snapshot + SSE Events
Patch 3 — Saksrom Live UX + Progressive Disclosure
Patch 4 — Readiness-Aware Retrieval Guard

Do not skip ahead.

Before each patch

Codex must:

Inspect existing repo structure.
Identify existing document/upload/ingestion/retrieval modules.
Extend existing owned modules when appropriate.
Avoid duplicate abstractions.
Make a short bounded implementation plan.
Identify tests to run.
During implementation

Codex must:

keep changes minimal
preserve existing public APIs unless patch requires new endpoint
use canonical contracts from this folder
avoid generic helper dumping
keep evaluator pure
keep transaction boundaries explicit
keep UI mapping functions pure and tested
never place legal readiness decisions in the LLM prompt
After each patch

Codex must report:

files changed
contracts implemented
tests run
test result
known gaps
repo-health verdict: improved / preserved / degraded
Stop conditions

Stop and ask for human decision if:

existing schema conflicts with these contracts
persistence technology is not Postgres/Hibernate and JSONB path is invalid
retrieval architecture cannot attach readiness metadata
SSE infrastructure already exists with incompatible event envelope
frontend has no stable place to render chat source disclosures
implementing patch would require broad refactor outside scope
Fallback rules

If Patch 1 is too large:

Implement enums + SourceReadiness + Evaluator + unit tests first.
Defer CaseCoverageSummary to Patch 2.

If Patch 2 SSE is too large:

Implement GET /coverage first.
Use polling temporarily.
Keep event contracts unchanged.

If Patch 3 is too large:

Implement banner + document rows first.
Defer problem modal technical expansion.

If Patch 4 is too large:

Block NONE sources first.
Then implement partial readyRanges.
Then implement disclosure propagation.

