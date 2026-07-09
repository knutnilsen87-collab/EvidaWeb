import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceWindow, searchSourceIndex, sourceUnitId, sourceWindowBounds } from "./sourceUnits";

describe("source unit helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates stable per-page source unit IDs", () => {
    expect(sourceUnitId("00000000-0000-0000-0000-000000001111", 450)).toBe("doc_00000000_p0450_b0001");
  });

  it("bounds lazy source windows without loading a whole 10000 page PDF", () => {
    expect(sourceWindowBounds(1, 10_000)).toEqual({ startPage: 1, endPage: 4 });
    expect(sourceWindowBounds(10_000, 10_000)).toEqual({ startPage: 9997, endPage: 10000 });
  });

  it("fetches only a small page window around the requested source", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "unit_pk_1",
          documentId: "doc_001",
          sourceUnitId: "doc_doc_001_p0450_b0001",
          pageNumber: 450,
          textContent: "Backend-kilde"
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const sourceWindow = await fetchSourceWindow("doc_001", 450, 10_000, "00000000-0000-0000-0000-000000000101");

    expect(sourceWindow.units).toHaveLength(1);
    expect(sourceWindow.startPage).toBe(447);
    expect(sourceWindow.endPage).toBe(453);
    expect(sourceWindow.units.some((unit) => unit.id === "doc_doc_001_p0450_b0001")).toBe(true);
  });

  it("does not return mock search hits before backend search exists", async () => {
    await expect(searchSourceIndex("varsling")).resolves.toEqual([]);
  });
});
