
Coverage Contract
Purpose

CaseCoverageSummary gives Saksrom a stable source-of-truth snapshot for current document coverage.

It powers:

Saksrom banner
document counters
provisional room state
SSE reconnect recovery
frontend display after refresh
Endpoint
GET /api/cases/{caseId}/coverage
Response shape
{
  "caseId": "case_123",
  "totalDocuments": 21,
  "notReadyDocuments": 5,
  "partialDocuments": 3,
  "readyDocuments": 12,
  "readyWithPermanentDisclosureDocuments": 1,
  "failedDocuments": 1,
  "processingDocuments": 5,
  "totalPages": 700,
  "readyPages": 512,
  "pendingPages": 170,
  "failedPages": 8,
  "permanentlyUnreadablePages": 10,
  "documentReadinessRatio": 0.5714,
  "pageReadinessRatio": 0.7314,
  "provisionalRoomAvailable": true,
  "allIngestionClosed": false,
  "hasPermanentDisclosures": true,
  "hasFailures": true,
  "updatedAt": "2026-07-08T12:00:00Z",
  "documents": []
}
CaseCoverageSummary Java shape
public class CaseCoverageSummary {
    private UUID caseId;

    private int totalDocuments;
    private int notReadyDocuments;
    private int partialDocuments;
    private int readyDocuments;
    private int readyWithPermanentDisclosureDocuments;
    private int failedDocuments;
    private int processingDocuments;

    private int totalPages;
    private int readyPages;
    private int pendingPages;
    private int failedPages;
    private int permanentlyUnreadablePages;

    private double documentReadinessRatio;
    private double pageReadinessRatio;

    private boolean provisionalRoomAvailable;
    private boolean allIngestionClosed;
    private boolean hasPermanentDisclosures;
    private boolean hasFailures;

    private Instant updatedAt;

    private List<DocumentCoverageItem> documents;
}
Provisional room rule

provisionalRoomAvailable = true when at least one of these is true:

readyDocuments > 0
partialDocuments > 0
readyWithPermanentDisclosureDocuments > 0
Snapshot consistency

The coverage snapshot must be computed from persisted SourceReadiness records, not from transient worker state alone.
