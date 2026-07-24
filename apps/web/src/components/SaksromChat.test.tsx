import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceCoverage } from "../lib/api";
import { citationStore } from "../lib/CitationManager";
import { SaksromChat } from "./SaksromChat";

function coverage(
  readyPages: number,
  totalPages: number,
  overrides: Partial<SourceCoverage> = {}
): SourceCoverage {
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
    documentCoverage: [],
    ...overrides
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

  it("renders source readiness as a compact status line by the input instead of an answer card", () => {
    render(
      <SaksromChat
        sourceCoverage={coverage(1, 1)}
        tenantId="00000000-0000-0000-0000-000000000101"
      />
    );

    const statusText = screen.getByText("Kildegrunnlaget er klart · 1/1 sider");
    const statusLine = statusText.closest("[role='status']") as HTMLElement | null;
    const history = screen.getByLabelText("Saksrom chatlogg");

    expect(statusLine).toHaveClass("saksrom-status-line");
    expect(statusLine?.closest(".chat-input-zone")).not.toBeNull();
    expect(history).not.toContainElement(statusLine);
    expect(screen.queryByLabelText("Kildebundet svar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saksrommet er klart for kildebundne spørsmål/i)).not.toBeInTheDocument();
  });

  it("keeps the passed completeness acknowledgement as a compact chip by the input", () => {
    render(
      <SaksromChat
        completenessAcknowledged
        completenessPassed
        sourceCoverage={coverage(779, 779)}
        tenantId="00000000-0000-0000-0000-000000000101"
      />
    );

    const chip = screen.getByText("Kompletthetskontroll bestått").closest("[role='status']") as HTMLElement;
    expect(chip).toHaveClass("saksrom-completeness-chip--passed");
    expect(chip.closest(".chat-input-zone")).not.toBeNull();
    expect(screen.getByLabelText("Saksrom chatlogg")).not.toContainElement(chip);
  });

  it("shows a calm preliminary status with coverage and missing-page disclosure", () => {
    render(
      <SaksromChat
        isPreliminary
        sourceCoverage={coverage(77, 78, { belowThresholdPages: 1 })}
        tenantId="00000000-0000-0000-0000-000000000101"
      />
    );

    const statusLine = screen.getByText("Foreløpig kildegrunnlag · 77 av 78 sider klare")
      .closest("[role='status']") as HTMLElement | null;
    expect(statusLine).toHaveClass("saksrom-status-line--preliminary");
    expect(statusLine).toHaveTextContent("1 side krever kontroll");
    expect(screen.getByLabelText("Saksrom chatlogg")).not.toContainElement(statusLine);
  });

  it("shows neutral processing status without claiming readiness", () => {
    render(
      <SaksromChat
        isPreliminary
        isProcessing
        sourceCoverage={coverage(12, 78, {
          belowThresholdPages: 0,
          missingOcrPages: 5
        })}
        tenantId="00000000-0000-0000-0000-000000000101"
      />
    );

    const statusLine = screen.getByText("Kildegrunnlaget behandles · 12 av 78 sider klare")
      .closest("[role='status']") as HTMLElement | null;
    expect(statusLine).toHaveClass("saksrom-status-line--processing");
    expect(statusLine).toHaveTextContent("5 sider krever OCR");
    expect(statusLine).not.toHaveTextContent("Kildegrunnlaget er klart");
    expect(screen.getByLabelText("Saksrom chatlogg")).not.toContainElement(statusLine);
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
    expect(screen.getByText(/153 av 156 sider klare/i)).toBeInTheDocument();
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
    expect(screen.getByText(/1 side krever kontroll/i)).toBeInTheDocument();
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

  it("keeps partial chat enabled and shows soft no-match fallback without NO_SOURCE_BASIS", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Jeg finner ikke støtte for dette i det tilgjengelige kildegrunnlaget.",
        sourceBound: true,
        warnings: ["PARTIAL_SOURCE_COVERAGE", "BELOW_THRESHOLD_PAGES=78", "NO_RELEVANT_SOURCE_MATCH"],
        sources: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        caseId="00000000-0000-0000-0000-000000001101"
        isPreliminary
        sourceCoverage={coverage(77, 78)}
      />
    );

    expect(screen.getByLabelText("Saksrom melding")).toBeEnabled();
    expect(screen.getByText(/77 av 78 sider klare/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Saksrom melding"), "Hva står i et ukjent vedlegg?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/finner ikke støtte/i)).toBeInTheDocument();
    expect(screen.getByText("NO_RELEVANT_SOURCE_MATCH")).toBeInTheDocument();
    expect(screen.queryByText("NO_SOURCE_BASIS")).not.toBeInTheDocument();
    expect(screen.queryByText("Mangler kildegrunnlag")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/saksrom/ask",
      expect.objectContaining({
        body: JSON.stringify({
          caseId: "00000000-0000-0000-0000-000000001101",
          question: "Hva står i et ukjent vedlegg?",
          selectedSourceUnitIds: [],
          mode: "sporre",
          includePartial: true,
          sourceBasis: "READY_PAGE_UNITS_ONLY"
        })
      })
    );
  });

  it("does not turn partial source transport failures into NO_SOURCE_BASIS", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        caseId="00000000-0000-0000-0000-000000001101"
        isPreliminary
        sourceCoverage={coverage(77, 78)}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Hva står i rettsboken?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Kunne ikke hente svar fra Saksrom/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch");
    expect(screen.queryByText("NO_SOURCE_BASIS")).not.toBeInTheDocument();
    expect(screen.queryByText("Mangler kildegrunnlag")).not.toBeInTheDocument();
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
      name: /Åpne kilde Side 1 00000000-0000-0000-0000-000000001111 side 1/
    });
    expect(citation).toHaveTextContent("Side 1");
    expect(citation).not.toHaveTextContent("doc_00000000_p0001_b0001");
    expect(screen.getByRole("heading", { name: "Kilder brukt" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kilder for funn/)).not.toBeInTheDocument();

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

  it("renders real claim-level source pills and routes clicks through the existing citation manager", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Vurderingen bygger på de strukturerte funnene nedenfor.",
        findings: [
          {
            heading: "Kontraktssum",
            text: "Kontraktssummen er 25 200 000 NOK eks. mva.",
            sources: [
              {
                documentId: "00000000-0000-0000-0000-000000001111",
                sourceUnitId: "doc_00000000_p0001_b0001",
                pageNumber: 1
              },
              {
                documentId: "00000000-0000-0000-0000-000000001111",
                sourceUnitId: "doc_00000000_p0002_b0001",
                pageNumber: 2
              }
            ]
          },
          {
            heading: "Reklamasjon",
            text: "Reklamasjon må fremsettes innen rimelig tid.",
            sources: [
              {
                documentId: "00000000-0000-0000-0000-000000001111",
                sourceUnitId: "doc_00000000_p0003_b0001",
                pageNumber: 3
              }
            ]
          }
        ],
        sourceBound: true,
        warnings: [],
        sources: [
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0001_b0001",
            pageNumber: 1
          },
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0002_b0001",
            pageNumber: 2
          },
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0003_b0001",
            pageNumber: 3
          }
        ]
      })
    }));

    render(
      <SaksromChat
        caseId="00000000-0000-0000-0000-000000001101"
        sourceCoverage={coverage(3, 3)}
        tenantId="00000000-0000-0000-0000-000000000101"
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Hva er de sentrale funnene?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const firstFindingSources = await screen.findByLabelText("Kilder for funn 1");
    expect(within(firstFindingSources).getAllByRole("button", { name: /Åpne kilde Side/ })).toHaveLength(2);
    expect(screen.getByLabelText("Kilder for funn 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kilder brukt" })).toBeInTheDocument();

    await user.click(within(firstFindingSources).getByRole("button", { name: /Side 2/ }));
    expect(citationStore.activeCitation).toEqual(expect.objectContaining({
      documentId: "00000000-0000-0000-0000-000000001111",
      sourceUnitId: "doc_00000000_p0002_b0001",
      page: 2
    }));
  });

  it("renders explicit findings as a readable source-bound answer card without inventing metadata", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: [
          "Vurderingen bygger på den tilgjengelige kontrakten.",
          "Vitnet, forklarte:",
          "Vedlikeholdsplikten følger kontraktens ordlyd.",
          "",
          "Sentrale funn:",
          "1. Avtalen gjelder oppføring av næringsbygg.",
          "2. Kontraktssummen er 25 200 000 NOK eks. mva.",
          "3. Reklamasjon må fremsettes innen rimelig tid."
        ].join("\n"),
        sourceBound: true,
        warnings: [],
        sources: [
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0001_b0001",
            pageNumber: 1
          },
          {
            documentId: "00000000-0000-0000-0000-000000001111",
            sourceUnitId: "doc_00000000_p0002_b0001",
            pageNumber: 2
          }
        ]
      })
    }));

    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        caseId="00000000-0000-0000-0000-000000001101"
        sourceCoverage={coverage(2, 2)}
      />
    );

    await user.type(screen.getByLabelText("Saksrom melding"), "Oppsummer kontrakten");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(
      () => expect(screen.getByText("Reklamasjon må fremsettes innen rimelig tid.")).toBeInTheDocument(),
      { timeout: 3000 }
    );

    const card = screen.getByLabelText("Kildebundet svar");
    expect(within(card).getByRole("heading", { name: "Kildebundet svar" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Sentrale funn" })).toBeInTheDocument();
    expect(within(card).queryByRole("heading", { name: "Vitnet, forklarte" })).not.toBeInTheDocument();
    expect(within(card).getByText(/Vitnet, forklarte: Vedlikeholdsplikten følger kontraktens ordlyd/)).toBeInTheDocument();
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).getByLabelText("Svarmetadata")).toHaveTextContent("2 kildehenvisninger");
    expect(within(card).getByLabelText("Svarmetadata")).toHaveTextContent("2 sider");
    expect(within(card).getByRole("heading", { name: "Kilder brukt" })).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: /Åpne kilde Side/ })).toHaveLength(2);
    expect(card).not.toHaveTextContent("ENTREPRISEKONTRAKT");
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

  it("progressively renders answers and keeps the chat scrolled to the newest content", async () => {
    const user = userEvent.setup();
    const finalAnswer = "Dette svaret bygges progressivt mens kildegrunnlaget forblir synlig.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: finalAnswer, sourceBound: true, warnings: [], sources: [] })
    }));

    render(
      <SaksromChat
        tenantId="00000000-0000-0000-0000-000000000101"
        caseId="00000000-0000-0000-0000-000000001101"
        sourceCoverage={coverage(1, 1)}
      />
    );
    const history = screen.getByLabelText("Saksrom chatlogg") as HTMLDivElement;
    Object.defineProperty(history, "scrollHeight", { configurable: true, value: 900 });

    await user.type(screen.getByLabelText("Saksrom melding"), "Hva er hovedpoenget?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(history.querySelector(".streaming-text")).not.toBeNull());
    await waitFor(() => expect(history.scrollTop).toBe(900));
    expect(await screen.findByText(finalAnswer)).toBeInTheDocument();
    expect(history.querySelector(".streaming-text")).toBeNull();
  });

  it("does not force scroll when the user reads older content and offers a new-updates action", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SaksromChat sourceCoverage={coverage(1, 1)} openingSummary={<div>Første innhold</div>} />
    );
    const history = screen.getByLabelText("Saksrom chatlogg") as HTMLDivElement;
    Object.defineProperties(history, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 300 }
    });
    history.scrollTop = 200;
    fireEvent.scroll(history);

    rerender(<SaksromChat sourceCoverage={coverage(1, 1)} openingSummary={<div>Nytt sammendrag</div>} />);

    expect(await screen.findByRole("button", { name: "Nye oppdateringer" })).toBeInTheDocument();
    expect(history.scrollTop).toBe(200);
    await user.click(screen.getByRole("button", { name: "Nye oppdateringer" }));
    await waitFor(() => expect(history.scrollTop).toBe(1200));
  });

  it("keeps auto-scroll enabled while the reader remains near the bottom", async () => {
    const { rerender } = render(<SaksromChat sourceCoverage={coverage(1, 1)} openingSummary={<div>Start</div>} />);
    const history = screen.getByLabelText("Saksrom chatlogg") as HTMLDivElement;
    Object.defineProperties(history, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 }
    });
    history.scrollTop = 680;
    fireEvent.scroll(history);

    rerender(<SaksromChat sourceCoverage={coverage(1, 1)} openingSummary={<div>Progressiv oppdatering</div>} />);

    await waitFor(() => expect(history.scrollTop).toBe(1000));
    expect(screen.queryByRole("button", { name: "Nye oppdateringer" })).not.toBeInTheDocument();
  });
});
