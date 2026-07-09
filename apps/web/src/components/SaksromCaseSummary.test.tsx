import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidaDocument } from "../lib/api";
import { SaksromCaseSummary } from "./SaksromCaseSummary";

function doc(id: string, filename: string, status: EvidaDocument["status"]): EvidaDocument {
  return {
    id,
    filename,
    status,
    pages: 4,
    ocrRequired: false
  };
}

describe("SaksromCaseSummary", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn()
      }
    });
  });

  it("renders all required headings and marks missing information as not documented", () => {
    render(
      <SaksromCaseSummary
        coverage={50}
        documents={[
          doc("doc_ready", "klar.pdf", "source_ready"),
          doc("doc_failed", "feilet.pdf", "ingestion_failed"),
          doc("doc_quarantine", "venter.pdf", "quarantine")
        ]}
        failedCount={1}
        pendingCount={1}
      />
    );

    [
      "Kort sammendrag",
      "Dokumentoversikt",
      "Faktiske funn",
      "Kronologi",
      "Sentrale bevis",
      "Motstridende opplysninger",
      "Juridisk relevante forhold",
      "Mangler og usikkerhet",
      "Risikovurdering",
      "Konklusjon",
      "Kontrollstatus"
    ].forEach((heading) => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });

    expect(screen.getByText("Produsert med foreløpig kildegrunnlag.")).toBeInTheDocument();
    expect(screen.getByText(/Analysert nå/i)).toBeInTheDocument();
    expect(screen.getAllByText("klar.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("doc_ready")).not.toBeInTheDocument();
    expect(screen.getByText("Vis full dokumentliste (1)")).toBeInTheDocument();
    expect(screen.getAllByText("Ikke dokumentert i tilgjengelig kildegrunnlag.").length).toBeGreaterThan(5);
  });

  it("does not show preliminary marker at full coverage", () => {
    render(
      <SaksromCaseSummary
        coverage={100}
        documents={[doc("doc_ready", "klar.pdf", "source_ready")]}
        failedCount={0}
        pendingCount={0}
      />
    );

    expect(screen.getByRole("heading", { name: "Saksoppsummering" })).toBeInTheDocument();
    expect(screen.queryByText("Produsert med foreløpig kildegrunnlag.")).not.toBeInTheDocument();
  });

  it("shows stale-source warning and regenerates against the updated source basis", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SaksromCaseSummary
        coverage={50}
        documents={[doc("doc_ready", "klar.pdf", "source_ready"), doc("doc_wait", "venter.pdf", "quarantine")]}
        failedCount={0}
        pendingCount={1}
      />
    );

    rerender(
      <SaksromCaseSummary
        coverage={100}
        documents={[doc("doc_ready", "klar.pdf", "source_ready"), doc("doc_wait", "venter.pdf", "source_ready")]}
        failedCount={0}
        pendingCount={0}
      />
    );

    const warning = screen.getByText("Kildegrunnlaget er oppdatert siden denne oppsummeringen ble laget.").closest("div");
    expect(warning).not.toBeNull();
    await user.click(within(warning as HTMLElement).getByRole("button", { name: "Oppsummer saken på nytt" }));

    expect(screen.getAllByText(/venter\.pdf/).length).toBeGreaterThan(0);
  });
});
