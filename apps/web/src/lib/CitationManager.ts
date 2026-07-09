export interface CitationRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Citation {
  documentId: string;
  sourceUnitId: string;
  page: number;
  pageNumber?: number;
  paragraph: string;
  rect: CitationRect;
}

export interface CitationComparison {
  left: Citation;
  right: Citation;
  summary: string;
}

export type BevisKrav = "utover_rimelig_tvil" | "styrker_bevisbilde" | "saar_tvil";

export interface BevisElement {
  id: string;
  beskrivelse: string;
  styrke: BevisKrav;
  kildeRef: string;
}

export const CITATION_EVENT = "jump-to-source";
export const CITATION_COMPARISON_EVENT = "compare-sources";

type CitationListener = (citation: Citation | null) => void;
type CitationComparisonListener = (comparison: CitationComparison | null) => void;

const listeners = new Set<CitationListener>();
const comparisonListeners = new Set<CitationComparisonListener>();

export const citationStore = {
  activeCitation: null as Citation | null,
  activeComparison: null as CitationComparison | null,

  jumpToSource(citation: Citation) {
    citationStore.activeCitation = citation;
    citationStore.activeComparison = null;
    listeners.forEach((listener) => listener(citation));
    comparisonListeners.forEach((listener) => listener(null));
    window.dispatchEvent(new CustomEvent<Citation>(CITATION_EVENT, { detail: citation }));
  },

  compareSources(comparison: CitationComparison) {
    citationStore.activeComparison = comparison;
    citationStore.activeCitation = null;
    comparisonListeners.forEach((listener) => listener(comparison));
    listeners.forEach((listener) => listener(null));
    window.dispatchEvent(new CustomEvent<CitationComparison>(CITATION_COMPARISON_EVENT, { detail: comparison }));
  },

  subscribe(listener: CitationListener) {
    listeners.add(listener);
    listener(citationStore.activeCitation);
    return () => listeners.delete(listener);
  },

  subscribeToComparison(listener: CitationComparisonListener) {
    comparisonListeners.add(listener);
    listener(citationStore.activeComparison);
    return () => comparisonListeners.delete(listener);
  },

  clear() {
    citationStore.activeCitation = null;
    citationStore.activeComparison = null;
    listeners.forEach((listener) => listener(null));
    comparisonListeners.forEach((listener) => listener(null));
  }
};
