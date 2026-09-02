import { describe, expect, it } from "vitest";
import { citationToRef, sourceReferenceToRef, sourceRefKey } from "./sourceUnitRef";

describe("SourceUnitRef", () => {
  it("preserves authoritative source identifiers and metadata", () => {
    const ref = sourceReferenceToRef({
      documentId: "doc-1",
      sourceUnitId: "unit-4",
      pageNumber: 4,
      quote: "Dokumentert utdrag",
      confidence: 0.93,
      highlightJson: "{}"
    }, "Avtale");
    expect(ref).toEqual(expect.objectContaining({
      documentId: "doc-1",
      sourceUnitId: "unit-4",
      pageNumber: 4,
      label: "Avtale · side 4",
      excerpt: "Dokumentert utdrag"
    }));
    expect(sourceRefKey(ref)).toBe("doc-1:unit-4:4");
  });

  it("adapts Citation without fabricating identifiers", () => {
    expect(citationToRef({
      documentId: "doc-2",
      sourceUnitId: "unit-2",
      page: 2,
      paragraph: "unit-2",
      rect: { top: 0, left: 0, width: 0, height: 0 }
    })).toEqual(expect.objectContaining({ pageNumber: 2, label: "Side 2" }));
  });
});
