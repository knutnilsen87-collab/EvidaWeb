import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { PDFViewer } from "./PDFViewer";

describe("PDFViewer", () => {
  afterEach(() => {
    citationStore.clear();
  });

  it("renders a highlight when provenance jumps to the active document", async () => {
    render(<PDFViewer documentId="doc_001" />);

    citationStore.jumpToSource({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p450",
      page: 450,
      paragraph: "p12",
      rect: { top: 210, left: 50, width: 300, height: 30 }
    });

    expect(await screen.findByLabelText("Aktiv kilde doc_001_p450")).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/Sideenhet doc_001_p/)).toHaveLength(0);
  });

  it("switches to split view when a source comparison is activated", async () => {
    render(<PDFViewer documentId="doc_001" />);

    citationStore.compareSources({
      left: {
        documentId: "doc_001",
        sourceUnitId: "doc_001_p450",
        page: 450,
        paragraph: "p12",
        rect: { top: 210, left: 50, width: 300, height: 30 }
      },
      right: {
        documentId: "doc_014",
        sourceUnitId: "doc_014_p452",
        page: 452,
        paragraph: "p8",
        rect: { top: 260, left: 132, width: 340, height: 44 }
      },
      summary: "Varslingsplikt vurdert mot senere e-post"
    });

    expect(await screen.findByLabelText("Sammenligningsvisning")).toBeInTheDocument();
    expect(screen.getByLabelText("Aktiv kilde doc_001_p450")).toBeInTheDocument();
    expect(screen.getByLabelText("Aktiv kilde doc_014_p452")).toBeInTheDocument();
  });
});
