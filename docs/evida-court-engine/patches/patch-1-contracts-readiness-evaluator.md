
Patch 1 — Contracts + SourceReadinessEvaluator
Goal

Implement backend contracts and the domain authority that computes source readiness.

No SSE, UI or retrieval guard in this patch.

Scope

Implement:

SourceReadiness
SourceReadinessStatus
SourceUsageMode
TextCoverage
ReadyRange
KnownGap
Disclosure
SourceAmbiguityFlag
DocumentIngestionSnapshot
SourceReadinessEvaluator
SourceReadinessRepository
DocumentIngestionSnapshotBuilder
refreshSourceReadiness(documentId)
unit tests
migration for source_readiness
Architecture rule

SourceReadinessEvaluator is the only module allowed to decide status and usageMode.

Pure function requirement

SourceReadinessEvaluator.evaluate(snapshot) must be 100% pure.

It must not call:

repositories
database
network
event publisher
worker services
system clock unless injected/passed externally

It must return a newly computed readiness object.

Transactional requirement

IngestionJobService must update ingestion data and refresh source readiness in the same transaction.

Example pattern:

@Transactional
public void recordPageUnitReady(PageUnitResult result) {
    pageUnitRepository.save(...);
    ingestionJobRepository.updateStage(...);

    refreshSourceReadiness(result.documentId());
}

refreshSourceReadiness() should build snapshot, evaluate readiness and upsert readiness inside the same transaction.

JSONB mapping

If using Spring Boot 3.3 + Hibernate 6 with PostgreSQL, use:

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "known_gaps_json", columnDefinition = "jsonb", nullable = false)
private List<KnownGap> knownGaps = new ArrayList<>();

Use this for:

readyRanges
knownGaps
ambiguityFlags
disclosure
Required tests

Create unit tests for:

small document does not become partial
large document becomes partial
full clean document becomes READY + FULL
terminal partiality becomes READY + FULL_WITH_PERMANENT_DISCLOSURE
no usable terminal content becomes FAILED + NONE
pending pages prevent READY
missing citation map prevents readiness
missing retrieval index prevents readiness
permanent gap creates disclosure and PERMANENT_GAP_PRESENT
repeated evaluation with same snapshot returns same result
Acceptance criteria

Patch is complete when:

- source_readiness table exists
- SourceReadiness persists per document
- evaluator computes all required states
- partial threshold is enforced
- small documents are blocked from partial
- terminal partiality is supported
- failed documents become FAILED + NONE
- JSONB fields persist and read correctly
- refresh happens transactionally with ingestion updates
- unit tests pass

