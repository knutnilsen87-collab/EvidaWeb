import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { genererKonklusjon } from "./BevisAnalyse";
import { Bevismatrise } from "./Bevismatrise";

function dataTransfer(sourceId: string) {
  return {
    data: sourceId,
    effectAllowed: "copy",
    setData(_type: string, value: string) {
      this.data = value;
    },
    getData() {
      return this.data;
    }
  };
}

describe("Bevismatrise", () => {
  it("shows criminal law evidence requirements and source-ready documents", () => {
    render(<Bevismatrise />);

    expect(screen.getByRole("heading", { name: "Strafferettslig bevismatrise" })).toBeInTheDocument();
    expect(screen.getAllByText("Objektiv gjerningsbeskrivelse").length).toBeGreaterThan(0);
    expect(screen.getByText("Skyldkrav")).toBeInTheDocument();
    expect(screen.getByText("Utover rimelig tvil")).toBeInTheDocument();
    expect(screen.getByText("Sår tvil")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Kildeklare dokumenter")).getByText("politirapport_doc_001.pdf")).toBeInTheDocument();
  });

  it("connects a dragged source to a criminal evidence row", () => {
    render(<Bevismatrise />);

    const sourceDock = screen.getByLabelText("Kildeklare dokumenter");
    const source = within(sourceDock).getByText("avhor_doc_014.pdf").closest("article");
    expect(source).not.toBeNull();

    const row = screen.getByText("Teknisk rapport peker på en mulig alternativ forklaring.").closest("tr");
    expect(row).not.toBeNull();

    const dropCell = within(row as HTMLElement).getByText("sakkyndig_doc_022.pdf").closest("td");
    expect(dropCell).not.toBeNull();

    const transfer = dataTransfer("doc_014");
    fireEvent.dragStart(source as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(dropCell as HTMLTableCellElement, { dataTransfer: transfer });

    expect(within(row as HTMLElement).getByText("avhor_doc_014.pdf")).toBeInTheDocument();
  });

  it("generates a warning when evidence contains reasonable doubt", () => {
    const analyse = genererKonklusjon([
      {
        id: "b1",
        beskrivelse: "Alternativ forklaring",
        styrke: "saar_tvil",
        kildeRef: "doc_022"
      }
    ]);

    expect(analyse.status).toBe("Advarsel");
    expect(analyse.melding).toMatch(/sår tvil/i);
  });

  it("opens evidence source pills through CitationManager", async () => {
    const user = userEvent.setup();
    const jumpSpy = vi.spyOn(citationStore, "jumpToSource");
    render(<Bevismatrise />);

    const row = screen.getByText("Bevis for at den straffbare handlingen faktisk ble utført.").closest("tr");
    expect(row).not.toBeNull();

    await user.click(within(row as HTMLElement).getByRole("button", { name: "politirapport_doc_001.pdf" }));

    expect(jumpSpy).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p4",
      page: 4
    }));
  });

  it("opens dock source cards through CitationManager", async () => {
    const user = userEvent.setup();
    const jumpSpy = vi.spyOn(citationStore, "jumpToSource");
    render(<Bevismatrise />);

    await user.click(within(screen.getByLabelText("Kildeklare dokumenter")).getByRole("button", { name: /avhor_doc_014\.pdf/i }));

    expect(jumpSpy).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_014",
      sourceUnitId: "doc_014_p18",
      page: 18
    }));
  });
});
