# AGENTS.md — First User Readiness Contract

This repository is not allowed to be considered ready for a first real user until the First User Readiness Gate is green.

This file is intended for Codex, AI coding agents, and human developers. It is a binding working contract for changes related to first-user readiness.

All EVIDA product work must also follow `EVIDA_DEVELOPER_DIRECTIVE.md`, the North Star for Legal Dark Shell, Editorial Authority, guided juridical workflow, tenant isolation, quarantine-first ingestion, source units, and source-bound AI.

## Non-negotiable rules

1. No feature is `done` without verification evidence.
2. No P0 item may be marked `partial` for first-user release.
3. Document upload is P0-critical.
4. Source-bound AI behavior is P0-critical.
5. Audit/provenance is P0-critical.
6. Sensitive data protection is P0-critical.
7. A passing build alone is not proof of product readiness.
8. Every code change must preserve repo ownership clarity.
9. Do not create duplicate backend ownership for auth, tenant, policy, audit, or provider routing.
10. If verification is inconclusive, mark the status as `blocked`, not `pass`.

## Required workflow for Codex / AI agents

For every change touching first-user readiness:

```text
0. Read EVIDA_DEVELOPER_DIRECTIVE.md
1. Read docs/first-user/FIRST_USER_SCOPE.md
2. Read docs/first-user/FIRST_USER_DOD.md
3. Read docs/first-user/PRODUCT_INVARIANTS.md
4. If document upload is touched, read docs/first-user/DOCUMENT_UPLOAD_READINESS.md
5. Make the smallest safe change.
6. Add or update tests.
7. Run targeted validation.
8. Update the readiness matrix if status changes.
9. Update or produce a status bundle artifact.
10. State repo-health verdict: improved, preserved, or degraded.
```

## Definition of clean success

A change can be called clean success only if:

- the target behavior works,
- the relevant automated test passes,
- the manual smoke step is documented if required,
- no critical invariant is broken or untested,
- no new duplicate abstraction or ambiguous ownership was introduced,
- no temporary code path was left without cleanup path,
- rollback path is known.

## Document upload special rule

Any change to upload, ingestion, OCR, parsing, source objects, document status, indexing, AI retrieval, document storage, document deletion, or export must treat document upload as a P0 safety surface.

Do not mark any document upload change as complete unless these are addressed:

- accepted file types,
- size limits,
- MIME/extension mismatch behavior,
- hashing,
- duplicate detection,
- safe failure states,
- corrupt file handling,
- password-protected file handling,
- OCR-needed handling,
- source object creation,
- source coverage visibility,
- audit event creation,
- no raw sensitive text leakage to logs,
- no unsupported AI use of failed documents.

## Required output in PR description

Every PR that affects first-user readiness must include:

```markdown
## First User Readiness Impact
- Scope:
- P0/P1/P2:
- Tests added/updated:
- Manual smoke:
- Artifacts:
- Invariants affected:
- Residual risk:
- Rollback path:
- Repo-health verdict:
```

## Do not do this

- Do not mark checklist items pass without evidence.
- Do not say "works locally" without commands and results.
- Do not add broad utilities named `helpers`, `misc`, `new`, `temp`, or `v2`.
- Do not bypass document upload failure handling to make the happy path green.
- Do not allow AI answers from documents that failed upload, extraction, indexing, or source-object creation.
- Do not introduce a second authority for auth, tenant, policy, audit, or provider routing.
