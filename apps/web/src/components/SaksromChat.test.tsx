import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceCoverage } from "../lib/api";
import { citationStore } from "../lib/CitationManager";
import { SaksromChat } from "./SaksromChat";

function coverage(readyPages: number, totalPages: number): SourceCoverage {
  return {
    totalDocuments: 1,
    sourceReadyDocuments: readyPages === totalPages ? 1 : 0,
    partialDocuments: readyPages > 0 && readyPages < totalPages ? 1 : 0,
    failedDocuments: 0,
    totalPages,
    readyPages,
    ocrReadyPages: 0,
    textReadyPages: readyPages,
    missingOcrPages: 0,
    belowThresholdPages: Math.max(0, totalPages - readyPages),
    failedPages: 0,
    coveragePercent: totalPages > 0 ? Math.round((readyPages / totalPages) * 100) : 0,
    missingOcrPageRanges: "",
    belowThresholdPageRanges: readyPages < totalPages ? `${readyPages + 1}-${totalPages}` : "",
    documentCoverage: []
  };
}

describe("SaksromChat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    citationStore.clear();
  });

  it("switches legal reasoning modes and updates the input prompt", async () => {
    const user = userEvent.setup();
    render(<SaksromChat />);

    expect(screen.getByRole("button", { name: "Spørre" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Saksrom melding")).toHaveAttribute(
      "placeholder",
      "Skriv din juridiske vurdering..."
    );

    await user.click(screen.getByRole("button", { name: "Argumentere" }));
    expect(screen.getByRole("button", { name: "Argumentere" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Saksrom melding")).toHaveAttribute(
      "placeholder",
      "Skriv argumentet du vil stressteste..."
    );

    await user.click(screen.getByRole("button", { name: "Simulere" }));
    expect(screen.getByLabelText("Saksrom melding")).toHaveAttribute(
      "placeholder",
      "Skriv din rettssak-simulering..."
    );
  });

  it("renders no-source warning without fake citation pills", () => {
    render(<SaksromChat />);

    expect(screen.getByText("Mangler kildegrunnlag")).toBeInTheDocument();
    expect(screen.getByText("NO_SOURCE_BASIS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Åpne kilde/ })).not.toBeInTheDocument();
  });

  it("enables chat for partial 153/156 source coverage", () => {
    render(
      <SaksromChat
        isPreliminary
        sourceCoverage={coverage(153, 156)}
        tenantId="00000000-0000-0000-0000-000000000101"
        verifiedCount={1}
      />
    );

    expect(screen.getByLabelText("Saksrom melding")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByText(/153 av 156 sider er klare/i)).toBeInTheDocument();
    expect(screen.queryByText("NO_SOURCE_BASIS")).not.toBeInTheDocument();
  });

  it("enables chat for partial 77/78 source coverage", () => {
    render(
      <SaksromChat
        isPreliminary
        sourceCoverage={coverage(77, 78)}
        tenantId="00000000-0000-0000-0000-000000000101"
        verifiedCount={1}
      />
    );

    expect(screen.getByLabelText("Saksrom melding")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByText(/1 sider krever fortsatt kontroll/i)).toBeInTheDocument();
  });

  it("blocks chat for zero ready pages", () => {
    render(
      <SaksromChat
        isPreliminary
        sourceCoverage={coverage(0, 156)}
        tenantId="00000000-0000-0000-0000-000000000101"
        verifiedCount={1}
      />
    );

    expect(screen.getByText("NO_SOURCE_BASIS")).toBeInTheDocument();
    expect(screen.getByLabelText("Saksrom melding")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("renders real citation pill and emits jump-to-source when clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Kildebundet vurdering basert på valgt kildegrunnlag.",
        sourceBound: true,
        warnings: [],
        sources: [
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0001_b0001",
            pageNumber: 1,
            quote: "Skriftlig varsling må dokumenteres.",
            confidence: 0.85
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        selectedSourceUnitIds={["doc_00000000_p0001_b0001"]}
        sourceCoverage={coverage(1, 1)}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Hva er varslingsplikten?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const citation = await screen.findByRole("button", {
      name: /doc_00000000_p0001_b0001 00000000-0000-0000-0000-000000001111 side 1/
    });

    await user.click(citation);
    expect(citationStore.activeCitation).toEqual(
      expect.objectContaining({
        documentId: "00000000-0000-0000-0000-000000001111",
        sourceUnitId: "doc_00000000_p0001_b0001",
        page: 1,
        pageNumber: 1
      })
    );
  });

  it("renders preliminary answer warning under AI response when isPreliminary is true", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Kildebundet svar.",
        sourceBound: true,
        warnings: [],
        sources: [
          {
            documentId: "doc_001",
            sourceUnitId: "doc_001_p1",
            pageNumber: 1,
            quote: "Some quote",
            confidence: 0.99
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        selectedSourceUnitIds={["doc_001_p1"]}
        isPreliminary
        sourceCoverage={coverage(77, 78)}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Test spørsmål");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findAllByText(/Svar bygger på ferdig behandlede kilder/i)).not.toHaveLength(0);
  });

  it("stale warning banner appears and re-submit button submits lastQuestion", async () => {
    const user = userEvent.setup();
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          answer: `Svar ${callCount}`,
          sourceBound: true,
          warnings: [],
          sources: [
            {
              documentId: "doc_001",
              sourceUnitId: "doc_001_p1",
              pageNumber: 1,
              quote: "Quote",
              confidence: 0.95
            }
          ]
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        sourceCoverage={coverage(1, 2)}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Gammelt spørsmål");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Svar 1")).toBeInTheDocument();

    rerender(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        sourceCoverage={coverage(2, 2)}
      />
    );

    expect(await screen.findByText("Kildegrunnlaget er oppdatert siden forrige svar.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Oppsummer saken på nytt" }));
    expect(await screen.findByText("Svar 2")).toBeInTheDocument();
  });
});
