import { authService } from "./auth";
import { uploadSecurityMessage } from "./uploadPolicy";

export type EvidaDocumentStatus =
  | "verified"
  | "quarantine"
  | "approved_for_ingestion"
  | "ingesting"
  | "ingestion_failed"
  | "partial_source_ready"
  | "source_ready"
  | "superseded"
  | "archived"
  | "deleted"
  | "processing"
  | "rejected";

export interface EvidaDocument {
  id: string;
  filename: string;
  status: EvidaDocumentStatus;
  pages: number;
  ocrRequired: boolean;
  sha256?: string;
  size?: number;
  contentType?: string;
  storagePath?: string;
  ingestionError?: string | null;
  versionNumber?: number;
  versionRootId?: string;
  supersedesDocumentId?: string | null;
  supersededByDocumentId?: string | null;
  activeVersion?: boolean;
}

export interface UploadResult {
  success: boolean;
  job_id: string;
}

export interface CourtEngineUploadResponse {
  fileIds: string[];
}

export interface CourtEngineAnalysisStartResponse {
  caseId: string;
  analysisStatus: "processing" | "completed" | "failed" | string;
  fileIds: string[];
}

export interface DocumentUploadResponse {
  id: string;
  tenantId: string;
  caseId?: string | null;
  createdBy: string;
  filename: string;
  originalFilename?: string;
  size: number;
  contentType?: string;
  sha256: string;
  fileHash?: string;
  storagePath?: string;
  status: "QUARANTINE" | string;
  message: string;
  pageCount?: number;
  sourceUnitMode?: string;
  sectionCount?: number;
  ingestionError?: string | null;
  createdAt?: string | null;
  versionNumber?: number;
  versionRootId?: string;
  supersedesDocumentId?: string | null;
  supersededByDocumentId?: string | null;
  activeVersion?: boolean;
}

export interface IngestionResponse {
  documentId: string;
  tenantId: string;
  caseId?: string | null;
  sourceUnitCount: number;
  status: "SOURCE_READY" | "INGESTION_FAILED" | string;
  errorCode?: string | null;
  ocrRequired: boolean;
  ocrPerformed: boolean;
  parserName: string;
}

export interface SourceUnitResponse {
  id: string;
  tenantId: string;
  caseId?: string | null;
  documentId: string;
  sourceUnitId: string;
  pageNumber: number;
  unitType: string;
  textContent: string;
  charStart?: number | null;
  charEnd?: number | null;
  bboxJson?: string | null;
  extractionConfidence?: number | null;
  createdAt?: string | null;
}

export interface SourceReference {
  documentId: string;
  sourceUnitId: string;
  pageNumber: number;
  quote?: string;
  confidence?: number;
  highlightJson?: string | null;
}

export interface SourceSearchResult {
  documentId: string;
  sourceUnitId: string;
  pageNumber: number;
  snippet: string;
  score?: number;
  searchMode: "keyword_v1" | string;
}

export interface SaksromAnswer {
  answer: string;
  findings?: SaksromSummaryFinding[];
  sources: SourceReference[];
  sourceBound: boolean;
  warnings: string[];
}

export interface SaksromSummaryFinding {
  heading: string;
  text: string;
  sources: SourceReference[];
}

export interface SaksromSummary {
  caseId: string;
  title: string;
  summary: string;
  findings: SaksromSummaryFinding[];
  sources: SourceReference[];
  sourceBound: boolean;
  warnings: string[];
  coverage?: SourceCoverage | null;
}

export type SaksromSummaryStreamStage =
  | "reading_sources"
  | "extracting_findings"
  | "linking_citations"
  | "composing_summary"
  | "complete"
  | "failed"
  | "cancelled";

export type SaksromSummaryStreamEvent =
  | { type: "stage"; stage: SaksromSummaryStreamStage; label: string }
  | { type: "section_start"; sectionId: string; title: string }
  | { type: "text_delta"; sectionId: string; text: string }
  | { type: "citation"; sectionId: string; citation: SourceReference }
  | { type: "finding"; theme: string; heading?: string; text: string; citations: SourceReference[] }
  | { type: "warning"; code: string; text: string }
  | { type: "complete"; summary?: SaksromSummary }
  | { type: "error"; message: string };

export class SaksromSummaryStreamUnavailableError extends Error {
  constructor(message = "Saksrom summary stream er ikke tilgjengelig.") {
    super(message);
    this.name = "SaksromSummaryStreamUnavailableError";
  }
}

export interface DocumentSourceCoverage {
  id: string;
  filename: string;
  status: string;
  totalPages: number;
  readyPages: number;
  ocrReadyPages: number;
  textReadyPages: number;
  missingOcrPages: number;
  belowThresholdPages: number;
  failedPages: number;
  missingOcrPageRanges: string;
  belowThresholdPageRanges: string;
  missingOcrPageNumbers: number[];
  belowThresholdPageNumbers: number[];
  warning?: string | null;
  sourceReady: boolean;
  partialSourceReady: boolean;
  failed: boolean;
}

export interface SourceCoverage {
  totalDocuments: number;
  sourceReadyDocuments: number;
  partialDocuments: number;
  failedDocuments: number;
  totalPages: number;
  readyPages: number;
  ocrReadyPages: number;
  textReadyPages: number;
  missingOcrPages: number;
  belowThresholdPages: number;
  failedPages: number;
  coveragePercent: number;
  missingOcrPageRanges: string;
  belowThresholdPageRanges: string;
  documentCoverage: DocumentSourceCoverage[];
}

export interface ClientAuditEvent {
  eventType: "USER_LOGOUT" | "CITATION_OPENED" | "EXPORT_CREATED" | "ADMIN_ACTION";
  caseId?: string;
  entityType?: string;
  entityId?: string;
  metadataJson?: string;
}

export const getHeaders = (tenantId: string): HeadersInit => ({
  "Content-Type": "application/json",
  ...authService.getHeaders(tenantId)
});

function apiBaseUrl() {
  return import.meta.env.VITE_EVIDA_API_BASE_URL ?? "";
}

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
}

/**
 * Transitional compatibility adapter mapping legacy case names to valid UUIDs.
 * Used only when the backend case.id is not yet available in dev/demo flows.
 * If caseId is already a valid UUID, returns it directly.
 */
export function toUuid(caseIdOrName: string | null | undefined): string | undefined {
  if (!caseIdOrName) return undefined;
  if (isUuid(caseIdOrName)) return caseIdOrName;

  if (caseIdOrName === "case_web_demo") {
    return "00000000-0000-0000-0000-000000000000";
  }

  // Generate a deterministic UUID from case display name for local demo workspace mapping
  let hash = 0;
  for (let i = 0; i < caseIdOrName.length; i++) {
    hash = (hash << 5) - hash + caseIdOrName.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  let fill = "";
  for (let i = 0; i < 12; i++) {
    const charCode = caseIdOrName.charCodeAt(i % caseIdOrName.length) || 0;
    fill += (charCode % 16).toString(16);
  }
  
  return `${hex}-1111-4444-8888-${fill}`;
}

export interface CaseFileDto {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  localFirst: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  documentCount?: number | null;
  sourceCoveragePercent?: number | null;
}

const backendCaseIdCache = new Map<string, Promise<string>>();

export const clearBackendCaseIdCacheForTests = () => {
  if (import.meta.env.MODE === "test") {
    backendCaseIdCache.clear();
  }
};

export const fetchCases = async (tenantId: string): Promise<CaseFileDto[]> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const response = await fetch(`${apiBaseUrl()}/api/v1/cases`, {
    headers: authService.getHeaders(tenantId)
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return (await response.json()) as CaseFileDto[];
};

/** Moves a case to the backend's soft-delete tombstone state. Documents and audit remain. */
export const moveCaseToTrash = async (caseId: string, tenantId: string): Promise<void> => {
  if (!isUuid(caseId)) {
    throw new Error("Gyldig case UUID mangler.");
  }
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const response = await fetch(`${apiBaseUrl()}/api/v1/cases/${caseId}`, {
    method: "DELETE",
    headers: authService.getHeaders(tenantId)
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
};

/**
 * Resolves a case display name (or legacy local id) to a backend-created case UUID.
 * documents.case_id has a foreign key to cases(id), so uploads with a locally
 * fabricated UUID (toUuid fallback) are rejected by the backend. Reuses an existing
 * case with the same title for the tenant, otherwise creates it via POST /api/v1/cases.
 * Values that already are UUIDs are returned unchanged.
 */
export const ensureBackendCaseId = (caseIdOrName: string, tenantId: string): Promise<string> => {
  if (isUuid(caseIdOrName)) {
    return Promise.resolve(caseIdOrName);
  }
  if (!tenantId.trim()) {
    return Promise.reject(new Error("tenantId mangler"));
  }

  const cacheKey = `${tenantId}:${caseIdOrName}`;
  const cached = backendCaseIdCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const resolved = (async () => {
    const cases = await fetchCases(tenantId);
    const existing = cases.find((c) => c.title === caseIdOrName);
    if (existing) {
      return existing.id;
    }

    const createResponse = await fetch(`${apiBaseUrl()}/api/v1/cases`, {
      method: "POST",
      headers: getHeaders(tenantId),
      body: JSON.stringify({ title: caseIdOrName })
    });
    if (!createResponse.ok) {
      throw new Error(await errorMessage(createResponse));
    }
    return ((await createResponse.json()) as CaseFileDto).id;
  })();

  backendCaseIdCache.set(cacheKey, resolved);
  resolved.catch(() => backendCaseIdCache.delete(cacheKey));
  return resolved;
};

function uploadHeaders(tenantId: string, caseId?: string): HeadersInit {
  return {
    ...authService.getHeaders(tenantId),
    ...(caseId && isUuid(caseId) ? { "X-Evida-Case-ID": caseId } : {})
  };
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as Partial<DocumentUploadResponse>;
    return uploadSecurityMessage(body.status) ?? body.message ?? body.status ?? `EVIDA API-feil ${response.status}`;
  } catch {
    return `EVIDA API-feil ${response.status}`;
  }
}

function normalizeDocument(document: DocumentUploadResponse): EvidaDocument {
  const normalizedStatus = document.status.toLowerCase() as EvidaDocumentStatus;
  return {
    id: document.id,
    filename: document.originalFilename ?? document.filename,
    status: document.status === "QUARANTINE" ? "quarantine" : normalizedStatus,
    pages: document.pageCount ?? 0,
    ocrRequired: document.status === "QUARANTINE",
    sha256: document.sha256,
    size: document.size,
    contentType: document.contentType,
    storagePath: document.storagePath,
    ingestionError: document.ingestionError,
    versionNumber: document.versionNumber,
    versionRootId: document.versionRootId,
    supersedesDocumentId: document.supersedesDocumentId,
    supersededByDocumentId: document.supersededByDocumentId,
    activeVersion: document.activeVersion
  };
}

export const fetchCaseDocuments = async (caseId: string, tenantId: string): Promise<EvidaDocument[]> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const params = new URLSearchParams();
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl()}/api/documents${suffix}`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return ((await response.json()) as DocumentUploadResponse[]).map(normalizeDocument);
};

export interface DocumentDuplicateCheckResponse {
  sha256: string;
  exists: boolean;
  documentId: string;
  status: string;
}

export interface IngestionJobResponse {
  id: string;
  tenantId: string;
  caseId: string;
  documentId: string;
  status: string;
  pagesProcessed: number;
  pagesTotal?: number;
  errorMessage?: string;
  attemptCount: number;
  lockedBy?: string;
  lockedAt?: string;
  finishedAt?: string;
  parserVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export const checkDocumentDuplicates = async (
  hashes: string[],
  tenantId: string,
  caseId?: string
): Promise<DocumentDuplicateCheckResponse[]> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  // Duplicate = same hash registered in the SAME case. Without caseId the backend
  // falls back to tenant-wide semantics, which would wrongly skip uploads of a file
  // that only exists in another case.
  const mappedCaseId = toUuid(caseId);
  const response = await fetch(`${apiBaseUrl()}/api/documents/check-duplicates`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify({
      hashes,
      ...(mappedCaseId && isUuid(mappedCaseId) ? { caseId: mappedCaseId } : {})
    })
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as DocumentDuplicateCheckResponse[];
};

export const fetchIngestionJobsByDocumentIds = async (
  documentIds: string[],
  tenantId: string,
  caseId?: string
): Promise<IngestionJobResponse[]> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  if (documentIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("documentIds", documentIds.join(","));
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }

  const response = await fetch(`${apiBaseUrl()}/api/ingestion-jobs?${params.toString()}`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as IngestionJobResponse[];
};

export const retryIngestionJob = async (
  jobId: string,
  tenantId: string,
  caseId?: string
): Promise<IngestionJobResponse> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const params = new URLSearchParams();
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${apiBaseUrl()}/api/ingestion-jobs/${jobId}/retry${suffix}`, {
    method: "POST",
    headers: getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as IngestionJobResponse;
};

export const uploadDocument = async (
  file: File,
  tenantId: string,
  caseId?: string,
  signal?: AbortSignal
): Promise<DocumentUploadResponse> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }
  if (caseId && !isUuid(caseId)) {
    throw new Error("Backend case UUID mangler for opplasting.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl()}/api/documents/upload`, {
    method: "POST",
    headers: uploadHeaders(tenantId, caseId),
    body: formData,
    signal
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as DocumentUploadResponse;
};

export const replaceDocumentVersion = async (
  documentId: string,
  file: File,
  tenantId: string
): Promise<EvidaDocument> => {
  if (!documentId.trim()) {
    throw new Error("documentId mangler");
  }
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/replace`, {
    method: "POST",
    headers: uploadHeaders(tenantId),
    body: formData
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return normalizeDocument((await response.json()) as DocumentUploadResponse);
};

export const uploadDocuments = async (files: File[], tenantId: string, caseId?: string): Promise<UploadResult> => {
  if (files.length === 0) {
    throw new Error("Ingen filer valgt");
  }

  const uploaded = await Promise.all(files.map((file) => uploadDocument(file, tenantId, caseId)));

  return {
    success: true,
    job_id: uploaded.map((document) => document.id).join(",")
  };
};

export const uploadFilesForAnalysis = async (
  files: File[],
  tenantId: string,
  caseId: string
): Promise<CourtEngineUploadResponse> => {
  if (files.length === 0) {
    throw new Error("Ingen filer valgt");
  }

  const formData = new FormData();
  formData.append("caseId", toUuid(caseId) || caseId);
  files.forEach((file) => formData.append("files", file));

  const response = await fetch(`${apiBaseUrl()}/api/files/upload`, {
    method: "POST",
    headers: authService.getHeaders(tenantId),
    body: formData
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as CourtEngineUploadResponse;
};

export const startCourtEngineAnalysis = async (
  tenantId: string,
  payload: {
    caseId: string;
    fileIds: string[];
  }
): Promise<CourtEngineAnalysisStartResponse> => {
  const mappedPayload = {
    ...payload,
    caseId: toUuid(payload.caseId) || payload.caseId
  };
  const response = await fetch(`${apiBaseUrl()}/api/analysis/start`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify(mappedPayload)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as CourtEngineAnalysisStartResponse;
};

export const approveDocumentSource = async (documentId: string): Promise<boolean> => {
  if (!documentId.trim()) {
    throw new Error("documentId mangler");
  }

  return true;
};

export const approveDocumentForIngestion = async (
  documentId: string,
  tenantId: string
): Promise<EvidaDocument> => {
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/approve-ingestion`, {
    method: "POST",
    headers: getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return normalizeDocument((await response.json()) as DocumentUploadResponse);
};

export const rejectDocument = async (
  documentId: string,
  tenantId: string,
  reason: string
): Promise<EvidaDocument> => {
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/reject`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return normalizeDocument((await response.json()) as DocumentUploadResponse);
};

export const archiveDocument = async (
  documentId: string,
  tenantId: string
): Promise<EvidaDocument> => {
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/archive`, {
    method: "POST",
    headers: getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return normalizeDocument((await response.json()) as DocumentUploadResponse);
};

export const ingestDocument = async (
  documentId: string,
  tenantId: string
): Promise<IngestionResponse> => {
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/ingest`, {
    method: "POST",
    headers: getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as IngestionResponse;
};

export const fetchSourceUnits = async (
  documentId: string,
  tenantId: string
): Promise<SourceUnitResponse[]> => {
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/source-units`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SourceUnitResponse[];
};

export const fetchSourceUnitWindow = async (
  documentId: string,
  tenantId: string,
  page: number,
  radius: number
): Promise<SourceUnitResponse[]> => {
  const params = new URLSearchParams({ page: String(page), radius: String(radius) });
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/source-units/window?${params.toString()}`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SourceUnitResponse[];
};

export const searchSourceUnits = async (
  tenantId: string,
  query: string,
  caseId?: string
): Promise<SourceSearchResult[]> => {
  const params = new URLSearchParams({ q: query });
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }
  const response = await fetch(`${apiBaseUrl()}/api/source-units/search?${params.toString()}`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SourceSearchResult[];
};

export const fetchSourceCoverage = async (
  tenantId: string,
  caseId?: string
): Promise<SourceCoverage> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  const params = new URLSearchParams();
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl()}/api/saksrom/source-coverage${suffix}`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SourceCoverage;
};

export const askSaksromQuestion = async (
  tenantId: string,
  payload: {
    caseId?: string;
    question: string;
    selectedSourceUnitIds?: string[];
    mode: "sporre" | "argumentere" | "simulere";
    includePartial?: boolean;
    sourceBasis?: "READY_PAGE_UNITS_ONLY";
  }
): Promise<SaksromAnswer> => {
  const mappedPayload = {
    ...payload,
    caseId: toUuid(payload.caseId) || payload.caseId,
    includePartial: payload.includePartial ?? true,
    sourceBasis: payload.sourceBasis ?? "READY_PAGE_UNITS_ONLY"
  };
  const response = await fetch(`${apiBaseUrl()}/api/saksrom/ask`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify(mappedPayload)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SaksromAnswer;
};

export const fetchSaksromSummary = async (
  tenantId: string,
  payload: {
    caseId: string;
    includePartial: boolean;
    sourceBasis: "READY_PAGE_UNITS_ONLY";
  }
): Promise<SaksromSummary> => {
  const mappedPayload = {
    ...payload,
    caseId: toUuid(payload.caseId) || payload.caseId
  };
  const response = await fetch(`${apiBaseUrl()}/api/saksrom/summary`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify(mappedPayload)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as SaksromSummary;
};

export const streamSaksromSummary = async (
  tenantId: string,
  payload: {
    caseId: string;
    includePartial: boolean;
    sourceBasis: "READY_PAGE_UNITS_ONLY";
  },
  onEvent: (event: SaksromSummaryStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const mappedPayload = {
    ...payload,
    caseId: toUuid(payload.caseId) || payload.caseId
  };
  const response = await fetch(`${apiBaseUrl()}/api/saksrom/summary/stream`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify(mappedPayload),
    signal
  });

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new SaksromSummaryStreamUnavailableError();
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  if (!response.body) {
    throw new SaksromSummaryStreamUnavailableError("Backend returnerte ingen stream-body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || signal?.aborted) {
      return;
    }
    onEvent(JSON.parse(trimmed) as SaksromSummaryStreamEvent);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (signal?.aborted) {
      return;
    }
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      emitLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  emitLine(buffer);
};

export const auditClientEvent = async (
  tenantId: string,
  event: ClientAuditEvent
): Promise<void> => {
  if (!tenantId.trim()) {
    return;
  }

  const mappedCaseId = toUuid(event.caseId);
  const payload = {
    eventType: event.eventType,
    caseId: mappedCaseId && isUuid(mappedCaseId) ? mappedCaseId : undefined,
    entityType: event.entityType,
    entityId: isUuid(event.entityId) ? event.entityId : undefined,
    metadataJson: event.metadataJson
  };

  const response = await fetch(`${apiBaseUrl()}/api/v1/audit/client-event`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
};

export interface BatchStartResult {
  documentId: string;
  status: string;
  error: string | null;
}

export const startBatchIngestion = async (
  tenantId: string,
  documentIds: string[],
  caseId?: string
): Promise<BatchStartResult[]> => {
  const params = new URLSearchParams();
  const mappedCaseId = toUuid(caseId);
  if (mappedCaseId && isUuid(mappedCaseId)) {
    params.set("caseId", mappedCaseId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBaseUrl()}/api/documents/ingestion/start-batch${suffix}`, {
    method: "POST",
    headers: getHeaders(tenantId),
    body: JSON.stringify({ documentIds })
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as BatchStartResult[];
};

export const downloadDocumentUrl = async (
  documentId: string,
  tenantId: string
): Promise<string> => {
  if (!tenantId.trim()) {
    throw new Error("tenantId mangler");
  }

  // The download endpoint requires the tenant header, so the file cannot be
  // opened via a plain URL; fetch it with auth headers and hand back an
  // object URL instead. The caller is responsible for revoking it.
  const response = await fetch(`${apiBaseUrl()}/api/documents/${documentId}/download`, {
    headers: authService.getHeaders(tenantId)
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const downloadCaseSourceReport = async (
  caseId: string,
  tenantId: string
): Promise<{ url: string; filename: string }> => {
  if (!isUuid(caseId) || !tenantId.trim()) {
    throw new Error("Gyldig saks-ID og tenant kreves for eksport.");
  }
  const response = await fetch(`${apiBaseUrl()}/api/v1/exports/cases/${caseId}/source-report`, {
    headers: authService.getHeaders(tenantId)
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `evida-source-report-${caseId}.md`;
  return {
    url: URL.createObjectURL(await response.blob()),
    filename
  };
};
