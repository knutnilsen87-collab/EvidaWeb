
Phase 03 — Document Lifecycle v1
Objective

Move from upload-only to a real tenant-aware document lifecycle.

Required lifecycle:

upload
→ quarantine
→ list
→ retrieve metadata
→ download/preview authorization
→ approve for ingestion
→ reject
→ archive/delete

This phase must remove critical mock document behavior from production paths.

Scope

In scope:

document status enum hardening
tenant-aware list endpoint
tenant-aware detail endpoint
tenant-aware download endpoint or metadata-only preview endpoint
approve/reject endpoint
archive/delete endpoint
storage cleanup behavior
frontend QuarantineGate real backend list
frontend empty/error/loading states
tests for tenant isolation and lifecycle transitions
E2E smoke for lifecycle

Out of scope:

PDF/OCR parser
RAG
AI source reasoning
DOCX export
full production object store
Recommended status model

Use existing enum if present. Expand minimally.

public enum DocumentStatus {
    QUARANTINE,
    REJECTED,
    APPROVED_FOR_INGESTION,
    INGESTING,
    INGESTION_FAILED,
    SOURCE_READY,
    VERIFIED,
    ARCHIVED,
    DELETED
}
Transition rules
QUARANTINE -> REJECTED
QUARANTINE -> APPROVED_FOR_INGESTION
APPROVED_FOR_INGESTION -> INGESTING
INGESTING -> SOURCE_READY
INGESTING -> INGESTION_FAILED
SOURCE_READY -> VERIFIED
any non-DELETED -> ARCHIVED
ARCHIVED -> DELETED

Hard rules:

VERIFIED is not allowed before source units exist.
SOURCE_READY is not allowed before ingestion creates source units.
DELETED must not appear in normal list unless explicitly requested.
Cross-tenant transition must be rejected.
Backend endpoints

Prefer:

GET    /api/documents
GET    /api/documents/{documentId}
GET    /api/documents/{documentId}/download
POST   /api/documents/{documentId}/approve-ingestion
POST   /api/documents/{documentId}/reject
POST   /api/documents/{documentId}/archive
DELETE /api/documents/{documentId}

Headers:

Authorization
X-Evida-Tenant-ID

Optional:

X-Evida-Case-ID
Repository contract

Required tenant-aware methods:

List<Document> findByTenantIdAndStatusNot(String tenantId, DocumentStatus status);

Optional<Document> findByIdAndTenantId(UUID id, String tenantId);

List<Document> findByTenantIdAndCaseIdAndStatusNot(
    String tenantId,
    String caseId,
    DocumentStatus status
);

Never use findById(id) for user-facing document access unless immediately checked against tenant.

Service stubs
public Document getForTenant(UUID documentId, String tenantId, AuthenticatedUser user) {
    validateTenant(tenantId, user);
    return repository.findByIdAndTenantId(documentId, tenantId)
        .filter(doc -> doc.getStatus() != DocumentStatus.DELETED)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
}

public List<Document> listForTenant(String tenantId, String caseId, AuthenticatedUser user) {
    validateTenant(tenantId, user);
    if (caseId != null && !caseId.isBlank()) {
        return repository.findByTenantIdAndCaseIdAndStatusNot(tenantId, caseId, DocumentStatus.DELETED);
    }
    return repository.findByTenantIdAndStatusNot(tenantId, DocumentStatus.DELETED);
}

public Document approveForIngestion(UUID documentId, String tenantId, AuthenticatedUser user) {
    Document doc = getForTenant(documentId, tenantId, user);
    requireStatus(doc, DocumentStatus.QUARANTINE);
    doc.setStatus(DocumentStatus.APPROVED_FOR_INGESTION);
    doc.setUpdatedAt(Instant.now());
    return repository.save(doc);
}

public Document reject(UUID documentId, String tenantId, AuthenticatedUser user, String reason) {
    Document doc = getForTenant(documentId, tenantId, user);
    requireStatus(doc, DocumentStatus.QUARANTINE);
    doc.setStatus(DocumentStatus.REJECTED);
    doc.setRejectionReason(reason);
    doc.setUpdatedAt(Instant.now());
    return repository.save(doc);
}

public Document archive(UUID documentId, String tenantId, AuthenticatedUser user) {
    Document doc = getForTenant(documentId, tenantId, user);
    doc.setStatus(DocumentStatus.ARCHIVED);
    doc.setUpdatedAt(Instant.now());
    return repository.save(doc);
}

public void delete(UUID documentId, String tenantId, AuthenticatedUser user) {
    Document doc = getForTenant(documentId, tenantId, user);
    doc.setStatus(DocumentStatus.DELETED);
    doc.setUpdatedAt(Instant.now());
    repository.save(doc);
}

If hard delete is unsafe, use soft delete only and document why.

Frontend API stubs
export async function fetchDocuments(tenantId: string, caseId?: string): Promise<CaseDocument[]> {
  const params = new URLSearchParams();

  if (caseId) {
    params.set('caseId', caseId);
  }

  const response = await fetch(`/api/documents${params.toString() ? `?${params}` : ''}`, {
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.status}`);
  }

  return response.json();
}

export async function approveDocumentForIngestion(documentId: string, tenantId: string): Promise<CaseDocument> {
  const response = await fetch(`/api/documents/${documentId}/approve-ingestion`, {
    method: 'POST',
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to approve document: ${response.status}`);
  }

  return response.json();
}

export async function rejectDocument(documentId: string, tenantId: string, reason: string): Promise<CaseDocument> {
  const response = await fetch(`/api/documents/${documentId}/reject`, {
    method: 'POST',
    headers: {
      ...getHeaders(tenantId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error(`Failed to reject document: ${response.status}`);
  }

  return response.json();
}

export async function archiveDocument(documentId: string, tenantId: string): Promise<CaseDocument> {
  const response = await fetch(`/api/documents/${documentId}/archive`, {
    method: 'POST',
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to archive document: ${response.status}`);
  }

  return response.json();
}
Frontend QuarantineGate requirements

Production path must:

load from backend
show empty state when no documents
show error state on backend failure
show upload state during upload
show status badges from backend status
approve/reject actions call backend
refresh after mutation
not silently show static mock list

Mock documents may exist only behind:

const allowMockDocuments =
  import.meta.env.DEV && import.meta.env.VITE_ALLOW_MOCK_DOCUMENTS === 'true';
Backend tests

Minimum:

list returns only tenant documents
get rejects cross-tenant document
approve transitions QUARANTINE -> APPROVED_FOR_INGESTION
reject transitions QUARANTINE -> REJECTED
archive hides document from default list
delete marks deleted or removes file according to policy
invalid transition rejected
Frontend tests

Minimum:

loads backend documents
shows empty state
shows backend error
approve calls backend and refreshes
reject calls backend and refreshes
does not show mock documents by default
Smoke test
Upload a file.
List documents.
Confirm uploaded file appears.
Approve for ingestion.
Confirm status changes.
Try cross-tenant get/list/approve and confirm rejection.
Archive document.
Confirm it disappears from normal list.
Report file
docs/codex-reports/2026-07-02_document_lifecycle_v1.md
Success criteria

succeeded only if:

lifecycle endpoints work
tenant isolation tests pass
frontend uses backend list/mutations
mock data is not used by production path
backend tests pass
web tests/build pass
lifecycle smoke passes
Next phase

Run:

04_PDF_OCR_INGESTION_SOURCE_UNITS.md
