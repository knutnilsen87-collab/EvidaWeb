import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
