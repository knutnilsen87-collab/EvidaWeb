import { describe, expect, it } from "vitest";
import { parseBackendStreamEvent } from "./adapter";

describe("parseBackendStreamEvent", () => {
  it("normalizes stage and text events", () => {
    expect(parseBackendStreamEvent({ type: "stage", stage: "composing_summary" })).toEqual(expect.objectContaining({
      type: "focus", action: "WRITING", label: "Sammenstiller saksoversikten"
    }));
    expect(parseBackendStreamEvent({ type: "text_delta", content: "Svar" })).toEqual({ type: "text_delta", content: "Svar" });
  });

  it("accepts only complete authoritative citations", () => {
    expect(parseBackendStreamEvent({ type: "citation", citation: {
      documentId: "doc-1", sourceUnitId: "unit-4", pageNumber: 4, quote: "Utdrag"
    } })).toEqual(expect.objectContaining({ citation: expect.objectContaining({ pageNumber: 4, excerpt: "Utdrag" }) }));
    expect(parseBackendStreamEvent({ type: "citation", documentId: "doc-1", pageNumber: 0 })).toBeNull();
  });

  it("ignores unknown payloads without logging them", () => {
    expect(parseBackendStreamEvent({ type: "internal_debug", payload: "sensitive" })).toBeNull();
    expect(parseBackendStreamEvent(null)).toBeNull();
  });
});
