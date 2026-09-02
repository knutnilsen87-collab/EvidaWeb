import { describe, expect, it } from "vitest";
import { initialSaksromStreamState, reduceSaksromStreamEvent } from "./reducer";

describe("reduceSaksromStreamEvent", () => {
  it("builds streamed text and deduplicates citations", () => {
    const started = reduceSaksromStreamEvent(initialSaksromStreamState, { type: "started", requestId: "r1" });
    const text = reduceSaksromStreamEvent(started, { type: "text_delta", content: "Dokumentert" });
    const citation = { documentId: "doc", sourceUnitId: "unit", pageNumber: 1, label: "Side 1" };
    const once = reduceSaksromStreamEvent(text, { type: "citation", citation });
    const twice = reduceSaksromStreamEvent(once, { type: "citation", citation });
    expect(twice.text).toBe("Dokumentert");
    expect(twice.citations).toHaveLength(1);
  });

  it("preserves received content on error", () => {
    const previous = { ...initialSaksromStreamState, text: "Delvis", citations: [{ documentId: "d", sourceUnitId: "u", pageNumber: 2, label: "Side 2" }] };
    const failed = reduceSaksromStreamEvent(previous, { type: "error", message: "Nettverksfeil", recoverable: true });
    expect(failed).toEqual(expect.objectContaining({ status: "error", text: "Delvis", error: "Nettverksfeil" }));
    expect(failed.citations).toHaveLength(1);
  });
});
