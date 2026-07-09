import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { SaksromChat } from "./SaksromChat";

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
    expect(screen.queryByRole("button", { name: /Ã…pne kilde/ })).not.toBeInTheDocument();
  });

  it("renders real citation pill and emits jump-to-source when clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Kildebundet vurdering basert pÃ¥ valgt kildegrunnlag.",
        sourceBound: true,
        warnings: [],
        sources: [
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0001_b0001",
            pageNumber: 1,
            quote: "Skriftlig varsling mÃ¥ dokumenteres.",
            confidence: 0.85
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SaksromChat tenantId="00000000-0000-0000-0000-000000000101" selectedSourceUnitIds={["doc_00000000_p0001_b0001"]} />);

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
        isPreliminary={true}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Test spørsmål");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Produsert med foreløpig kildegrunnlag/i)
    ).toBeInTheDocument();
  });

  it("no source-ready docs produces honest no-source message", () => {
    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        verifiedCount={0}
      />
    );
    expect(screen.getByText("Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst ett dokument er ferdig behandlet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Saksrom melding")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
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
        verifiedCount={1}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Gammelt spørsmål");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Svar 1")).toBeInTheDocument();

    // Rerender with verifiedCount = 2 (kildegrunnlag updated)
    rerender(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        verifiedCount={2}
      />
    );

    // Stale warning should appear
    expect(await screen.findByText("Kildegrunnlaget er oppdatert siden forrige svar.")).toBeInTheDocument();

    const updateBtn = screen.getByRole("button", { name: "Oppsummer saken på nytt" });
    await user.click(updateBtn);

    // Should fetch again and display Svar 2
    expect(await screen.findByText("Svar 2")).toBeInTheDocument();
  });
});
