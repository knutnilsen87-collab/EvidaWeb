import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCaseCanvas, saveCaseCanvas } from "./canvasApi";

const backendResponse = {
  caseId: "00000000-0000-0000-0000-000000000201",
  version: 3,
  canvas: {
    nodes: [{
      id: "00000000-0000-0000-0000-000000000301",
      nodeType: "FACT",
      title: "Varsel sendt",
      body: "Dokumentert faktum",
      status: "VERIFIED",
      x: 12,
      y: 34
    }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  },
  updatedAt: "2026-08-01T20:00:00Z"
};

describe("canvasApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the authoritative canvas without copying raw source text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => backendResponse }));
    const document = await fetchCaseCanvas("tenant", backendResponse.caseId);
    expect(document.version).toBe(3);
    expect(document.nodes[0].data.title).toBe("Varsel sendt");
    expect(document.nodes[0].position).toEqual({ x: 12, y: 34 });
  });

  it("sends expectedVersion for optimistic concurrency", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => backendResponse });
    vi.stubGlobal("fetch", fetchMock);
    const document = await fetchCaseCanvas("tenant", backendResponse.caseId);
    await saveCaseCanvas("tenant", document);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/cases/${backendResponse.caseId}/canvas`,
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"expectedVersion":3') })
    );
  });

  it("surfaces a conflict as a reload instruction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    await expect(fetchCaseCanvas("tenant", backendResponse.caseId)).rejects.toThrow("annen økt");
  });
});
