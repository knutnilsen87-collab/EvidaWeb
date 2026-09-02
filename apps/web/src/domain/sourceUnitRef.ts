import type { SourceReference } from "../lib/api";
import type { Citation } from "../lib/CitationManager";

export interface SourceUnitRef {
  documentId: string;
  sourceUnitId: string;
  pageNumber: number;
  label: string;
  excerpt?: string;
  confidence?: number;
  highlightJson?: string | null;
}

export function sourceReferenceToRef(source: SourceReference, documentName?: string): SourceUnitRef {
  return {
    documentId: source.documentId,
    sourceUnitId: source.sourceUnitId,
    pageNumber: source.pageNumber,
    label: documentName ? `${documentName} · side ${source.pageNumber}` : `Side ${source.pageNumber}`,
    excerpt: source.quote,
    confidence: source.confidence,
    highlightJson: source.highlightJson
  };
}

export function citationToRef(citation: Citation, label?: string, excerpt?: string): SourceUnitRef {
  const pageNumber = citation.pageNumber ?? citation.page;
  return {
    documentId: citation.documentId,
    sourceUnitId: citation.sourceUnitId,
    pageNumber,
    label: label ?? `Side ${pageNumber}`,
    excerpt
  };
}

export function sourceRefKey(source: SourceUnitRef): string {
  return [source.documentId, source.sourceUnitId, source.pageNumber].join(":");
}
