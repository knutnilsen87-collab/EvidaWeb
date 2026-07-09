import { afterEach, describe, expect, it, vi } from "vitest";
import { citationStore, CITATION_COMPARISON_EVENT, CITATION_EVENT, Citation } from "./CitationManager";

const citation: Citation = {
  documentId: "doc_001",
  sourceUnitId: "doc_001_p4",
  page: 4,
  paragraph: "p12",
  rect: { top: 210, left: 50, width: 300, height: 30 }
};

describe("citationStore", () => {
  afterEach(() => {
    citationStore.clear();
    vi.restoreAllMocks();
  });

  it("stores and broadcasts active citations", () => {
    const listener = vi.fn();
    const eventListener = vi.fn();
    window.addEventListener(CITATION_EVENT, eventListener);
    citationStore.subscribe(listener);

    citationStore.jumpToSource(citation);

    expect(citationStore.activeCitation).toEqual(citation);
    expect(listener).toHaveBeenLastCalledWith(citation);
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CITATION_EVENT, eventListener);
  });

  it("stores and broadcasts source comparisons", () => {
    const comparisonListener = vi.fn();
    const eventListener = vi.fn();
    const comparison = {
      left: citation,
      right: { ...citation, documentId: "doc_014", sourceUnitId: "doc_014_p452", page: 452 },
      summary: "Varslingsplikt vurdert mot senere e-post"
    };

    window.addEventListener(CITATION_COMPARISON_EVENT, eventListener);
    citationStore.subscribeToComparison(comparisonListener);
    citationStore.compareSources(comparison);

    expect(citationStore.activeComparison).toEqual(comparison);
    expect(citationStore.activeCitation).toBeNull();
    expect(comparisonListener).toHaveBeenLastCalledWith(comparison);
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CITATION_COMPARISON_EVENT, eventListener);
  });
});
