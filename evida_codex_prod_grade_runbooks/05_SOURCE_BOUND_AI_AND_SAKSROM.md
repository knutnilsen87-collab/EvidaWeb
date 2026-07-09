
Phase 05 — Source-Bound AI + Saksrom Integration
Objective

Connect Saksrom and legal reasoning surfaces to real source units.

The system must never present source-bound legal output unless each claim can point to a real source unit or explicitly says Mangler kilde.

Core rule
No source reference -> no source-backed claim.
Scope

In scope:

backend source search API
source citation response model
frontend citation pills backed by real source units
Saksrom chat request includes selected source context
no-source behavior
PDF/source jump based on real document/page/source unit
tests for hallucinated citation prevention

Out of scope:

final model provider integration if not already present
advanced RAG ranking
production prompt governance
DOCX export
Canonical source reference

Use one object shape across backend and frontend.

Backend:

public record SourceReference(
        UUID documentId,
        String sourceUnitId,
        Integer pageNumber,
        String quote,
        Double confidence,
        String highlightJson
) {}

Frontend:

export interface SourceReference {
  documentId: string;
  sourceUnitId: string;
  pageNumber: number;
  quote?: string;
  confidence?: number;
  highlightJson?: string;
}

Do not create incompatible Citation, SourceRef, EvidenceRef, and Reference variants unless a mapping layer already exists.

Backend search endpoint

Minimum:

GET /api/source-units/search?caseId=...&q=...

Headers:

X-Evida-Tenant-ID
Authorization

Response:

public record SourceSearchResult(
        UUID documentId,
        String sourceUnitId,
        Integer pageNumber,
        String snippet,
        Double score
) {}

Simple implementation for v1:

tenant filter
case filter if provided
LOWER(text_content) LIKE LOWER('%query%')
return top 20
no vector index yet
explicit searchMode: "keyword_v1"

Do not pretend vector search exists.

Source search service stub
public List<SourceSearchResult> search(String tenantId, String caseId, String query, AuthenticatedUser user) {
    validateTenant(tenantId, user);

    if (query == null || query.isBlank()) {
        return List.of();
    }

    return sourceUnitRepository.searchKeyword(tenantId, caseId, query.trim(), PageRequest.of(0, 20))
            .stream()
            .map(SourceSearchResult::from)
            .toList();
}

Repository example:

@Query("""
    select u from DocumentSourceUnit u
    where u.tenantId = :tenantId
      and (:caseId is null or u.caseId = :caseId)
      and lower(u.textContent) like lower(concat('%', :query, '%'))
    order by u.pageNumber asc
""")
List<DocumentSourceUnit> searchKeyword(
    @Param("tenantId") String tenantId,
    @Param("caseId") String caseId,
    @Param("query") String query,
    Pageable pageable
);
Chat response contract

If there is no real AI provider yet, implement deterministic source-bound prototype response.

Do not mock citations that do not exist.

Request:

public record SaksromQuestionRequest(
        String caseId,
        String question,
        List<String> selectedSourceUnitIds,
        String mode
) {}

Response:

public record SaksromAnswerResponse(
        String answer,
        List<SourceReference> sources,
        boolean sourceBound,
        List<String> warnings
) {}

Rules:

If no source units are selected/found:
answer must say insufficient source basis
sourceBound=false
sources=[]
warning includes NO_SOURCE_BASIS
If sources exist:
answer may summarize only from retrieved source text
every citation must match actual source unit
sourceBound=true

Safe prototype answer:

if (sources.isEmpty()) {
    return new SaksromAnswerResponse(
        "Jeg har ikke nok kildegrunnlag til å svare kildebundet. Last opp og klargjør kilder først, eller velg relevante kilder.",
        List.of(),
        false,
        List.of("NO_SOURCE_BASIS")
    );
}
Frontend Saksrom requirements

Files:

apps/web/src/components/SaksromChat.tsx
apps/web/src/lib/CitationManager.ts
apps/web/src/components/PDFViewer.tsx

Required behavior:

citation pills use real sourceUnitId
click citation calls jumpToSource
jump event includes:
documentId
pageNumber
sourceUnitId
highlight coordinates if available
if no sources:
show Mangler kildegrunnlag
do not render fake citation pills
if answer is not sourceBound:
visually mark as not source-backed

Frontend API stub:

export interface SaksromAnswer {
  answer: string;
  sources: SourceReference[];
  sourceBound: boolean;
  warnings: string[];
}

export async function askSaksromQuestion(
  tenantId: string,
  payload: {
    caseId?: string;
    question: string;
    selectedSourceUnitIds?: string[];
    mode: 'sporre' | 'argumentere' | 'simulere';
  },
): Promise<SaksromAnswer> {
  const response = await fetch('/api/saksrom/ask', {
    method: 'POST',
    headers: {
      ...getHeaders(tenantId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Saksrom request failed: ${response.status}`);
  }

  return response.json();
}
Tests

Backend:

search returns only tenant source units
ask without source units returns NO_SOURCE_BASIS
ask with source units returns only real source references
cross-tenant selectedSourceUnitIds are ignored or rejected
answer does not cite nonexistent sourceUnitId

Frontend:

SaksromChat renders no-source warning
SaksromChat renders real citation pill
clicking citation emits jump-to-source with sourceUnitId/pageNumber
non-sourceBound answer is marked
Smoke test
Upload PDF.
Approve ingestion.
Ingest.
Fetch source units.
Search for a known word.
Ask Saksrom a question with selected source unit.
Confirm answer has sourceBound=true.
Confirm citation points to real sourceUnitId.
Click citation in UI.
Confirm PDF/source viewer jumps to correct page.
Ask question with no sources.
Confirm no-source warning and no fake citations.
Report
docs/codex-reports/2026-07-02_source_bound_ai_and_saksrom.md
Success criteria

succeeded only if:

citations are real
no-source behavior is safe
source search is tenant-isolated
Saksrom uses actual source units
PDF/source jump works
tests and smoke pass
Next phase

Run:

06_SECURITY_TENANT_AUTH_PROD_HARDENING.md
