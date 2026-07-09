
Source Readiness Contract
Purpose

This contract defines the canonical backend model that controls whether document content may be used as a legal source.

Enums
public enum SourceReadinessStatus {
    NOT_READY,
    PARTIAL,
    READY,
    FAILED
}
public enum SourceUsageMode {
    NONE,
    PARTIAL_WITH_DISCLOSURE,
    FULL,
    FULL_WITH_PERMANENT_DISCLOSURE
}
public enum ExtractionMethod {
    TEXT_LAYER,
    OCR,
    MIXED
}
public enum GapCode {
    OCR_FAILED,
    PDF_PARSE_FAILED,
    PAGE_UNREADABLE,
    PASSWORD_PROTECTED,
    UNSUPPORTED_CONTENT,
    LOW_CONFIDENCE_TEXT
}
public enum SourceAmbiguityFlag {
    COVERAGE_INSUFFICIENT,
    CRITICAL_PAGE_PENDING,
    PERMANENT_GAP_PRESENT,
    LOW_CONFIDENCE_OCR,
    DOCUMENT_STRUCTURE_UNCERTAIN
}
SourceReadiness
public class SourceReadiness {
    private UUID id;
    private UUID caseId;
    private UUID documentId;

    private SourceReadinessStatus status;
    private SourceUsageMode usageMode;

    private boolean retrievalReady;
    private boolean citationReady;
    private boolean fullDocumentVerified;
    private boolean ingestionClosed;

    private TextCoverage textCoverage;

    private List<ReadyRange> readyRanges;
    private List<KnownGap> knownGaps;
    private List<SourceAmbiguityFlag> ambiguityFlags;

    private Disclosure disclosure;

    private Instant createdAt;
    private Instant updatedAt;
}
TextCoverage
public class TextCoverage {
    private Integer totalPages;

    private int readyPages;
    private int pendingPages;
    private int failedPages;
    private int permanentlyUnreadablePages;

    private double coverageRatio;

    private int usableTokens;
    private int semanticBlockCount;
}
ReadyRange
public class ReadyRange {
    private int fromPage;
    private int toPage;
    private boolean citationReady;
    private ExtractionMethod extractionMethod;
}
KnownGap
public class KnownGap {
    private Integer page;
    private Integer fromPage;
    private Integer toPage;

    private GapCode code;

    private String userMessage;
    private String technicalCode;

    private boolean retryable;
    private boolean permanent;
}
Disclosure
public class Disclosure {
    private boolean required;
    private String userMessage;
    private String reasoningInstruction;
}
Persistence

If using Spring Boot 3.3 + Hibernate 6 with PostgreSQL, use Hibernate JSON mapping:

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "known_gaps_json", columnDefinition = "jsonb", nullable = false)
private List<KnownGap> knownGaps = new ArrayList<>();

Use this pattern for:

readyRanges
knownGaps
ambiguityFlags
disclosure
Required table shape
CREATE TABLE source_readiness (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    document_id UUID NOT NULL UNIQUE,

    status VARCHAR(64) NOT NULL,
    usage_mode VARCHAR(64) NOT NULL,

    retrieval_ready BOOLEAN NOT NULL,
    citation_ready BOOLEAN NOT NULL,
    full_document_verified BOOLEAN NOT NULL,
    ingestion_closed BOOLEAN NOT NULL,

    total_pages INTEGER,
    ready_pages INTEGER NOT NULL,
    pending_pages INTEGER NOT NULL,
    failed_pages INTEGER NOT NULL,
    permanently_unreadable_pages INTEGER NOT NULL,
    coverage_ratio DOUBLE PRECISION NOT NULL,
    usable_tokens INTEGER NOT NULL,
    semantic_block_count INTEGER NOT NULL,

    ready_ranges_json JSONB NOT NULL,
    known_gaps_json JSONB NOT NULL,
    ambiguity_flags_json JSONB NOT NULL,
    disclosure_json JSONB NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_source_readiness_case_id ON source_readiness(case_id);
CREATE INDEX idx_source_readiness_status ON source_readiness(status);
CREATE INDEX idx_source_readiness_usage_mode ON source_readiness(usage_mode);
Evaluator interface
public interface SourceReadinessEvaluator {
    SourceReadiness evaluate(DocumentIngestionSnapshot snapshot);
}
Pure function rule

evaluate() must be a pure function.

It must not:

call repositories
call external services
read system time directly unless passed in or set outside
mutate existing persisted objects
publish events
trigger retries
write metrics

It may:

inspect the snapshot
compute status
compute usage mode
compute disclosure
compute ambiguity flags
return a new SourceReadiness
Snapshot input
public class DocumentIngestionSnapshot {
    private UUID caseId;
    private UUID documentId;

    private Integer totalPages;

    private int readyPages;
    private int pendingPages;
    private int failedPages;
    private int permanentlyUnreadablePages;

    private int usableTokens;
    private int semanticBlockCount;

    private boolean retrievalIndexUpdated;
    private boolean citationMapReady;
    private boolean allPagesAttempted;
    private boolean retriesExhausted;
    private boolean documentMetadataComplete;

    private List<ReadyRange> readyRanges;
    private List<KnownGap> knownGaps;
}
Evaluation rules
No usable source

Return NOT_READY + NONE if:

document metadata incomplete
or retrieval index not updated
or citation map not ready
Failed

Return FAILED + NONE if:

usableTokens = 0
readyPages = 0
and (allPagesAttempted or retriesExhausted)
Partial-ready

Return PARTIAL + PARTIAL_WITH_DISCLOSURE if:

retrievalIndexUpdated = true
citationMapReady = true
known gaps tracked
totalPages > 5
usableTokens >= 1000
semanticBlockCount >= 1
readyPages >= 1
allPagesAttempted = false
Full clean

Return READY + FULL if:

allPagesAttempted = true
pendingPages = 0
failedPages = 0
permanentlyUnreadablePages = 0
retrievalIndexUpdated = true
citationMapReady = true
documentMetadataComplete = true
Terminal partiality

Return READY + FULL_WITH_PERMANENT_DISCLOSURE if:

allPagesAttempted = true
retriesExhausted = true
pendingPages = 0
readyPages > 0
permanentlyUnreadablePages > 0
all permanent gaps classified
retrievalIndexUpdated = true
citationMapReady = true
documentMetadataComplete = true
Configurable threshold

Prefer config:

evida:
  source-readiness:
    partial-min-total-pages-exclusive: 5
    partial-min-usable-tokens: 1000
    partial-min-semantic-blocks: 1
Required unit tests
Small document does not become partial
Large document can become partial
Full clean document becomes READY + FULL
Terminal partial becomes READY + FULL_WITH_PERMANENT_DISCLOSURE
Failed document becomes FAILED + NONE
Pending pages prevent READY
Missing citation map prevents PARTIAL and READY
Missing retrieval index prevents PARTIAL and READY
Permanent gap creates PERMANENT_GAP_PRESENT
Evaluator does not call repository or mutate snapshot
