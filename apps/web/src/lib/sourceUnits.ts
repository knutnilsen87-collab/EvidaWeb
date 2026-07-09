import { fetchSourceUnitWindow } from "./api";

export type SourceUnitStatus = "quarantine" | "source-ready" | "ocr-required";

export interface SourceUnit {
  id: string;
  documentId: string;
  page: number;
  title: string;
  hash: string;
  status: SourceUnitStatus;
  excerpt: string;
}

export interface SourceWindow {
  documentId: string;
  startPage: number;
  endPage: number;
  totalPages: number;
  units: SourceUnit[];
}

export interface SourceSearchHit {
  sourceUnitId: string;
  documentId: string;
  page: number;
  title: string;
  snippet: string;
}

export interface SourceBatchSection {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  verifiedPages: number;
  totalPages: number;
  status: "quarantine" | "partly-ready" | "source-ready";
}

const LARGE_DOCUMENT_TOTAL_PAGES = 10_000;

export function sourceUnitId(documentId: string, page: number, block = 1) {
  return `doc_${documentId.slice(0, 8)}_p${String(page).padStart(4, "0")}_b${String(block).padStart(4, "0")}`;
}

export function sourceWindowBounds(page: number, totalPages = LARGE_DOCUMENT_TOTAL_PAGES, radius = 3) {
  return {
    startPage: Math.max(1, page - radius),
    endPage: Math.min(totalPages, page + radius)
  };
}

export async function fetchSourceWindow(
  documentId: string,
  page: number,
  totalPages = LARGE_DOCUMENT_TOTAL_PAGES,
  tenantId?: string
): Promise<SourceWindow> {
  const { startPage, endPage } = sourceWindowBounds(page, totalPages);
  if (!tenantId) {
    return { documentId, startPage, endPage, totalPages, units: [] };
  }

  const backendUnits = await fetchSourceUnitWindow(documentId, tenantId, page, 3).catch(() => []);
  const units = backendUnits.map((unit): SourceUnit => ({
    id: unit.sourceUnitId,
    documentId: unit.documentId,
    page: unit.pageNumber,
    title: `Side ${unit.pageNumber}`,
    hash: `source:${unit.id}`,
    status: "source-ready",
    excerpt: unit.textContent
  }));

  return { documentId, startPage, endPage, totalPages, units };
}

export async function searchSourceIndex(query: string): Promise<SourceSearchHit[]> {
  if (!query.trim()) {
    return [];
  }

  return [];
}

export async function approveSourceBatch(sectionId: string): Promise<SourceBatchSection> {
  return {
    id: sectionId,
    title: "Kapittel 1: Avtale og varsling",
    startPage: 1,
    endPage: 250,
    verifiedPages: 0,
    totalPages: 250,
    status: "partly-ready"
  };
}

export const demoSourceSections: SourceBatchSection[] = [
  {
    id: "sec_001",
    title: "Kapittel 1: Avtale og varsling",
    startPage: 1,
    endPage: 250,
    verifiedPages: 0,
    totalPages: 250,
    status: "partly-ready"
  },
  {
    id: "sec_002",
    title: "Kapittel 2: Leveransehistorikk",
    startPage: 251,
    endPage: 900,
    verifiedPages: 0,
    totalPages: 650,
    status: "quarantine"
  },
  {
    id: "sec_003",
    title: "Vedlegg: E-post og logg",
    startPage: 901,
    endPage: 10_000,
    verifiedPages: 0,
    totalPages: 9_100,
    status: "quarantine"
  }
];
