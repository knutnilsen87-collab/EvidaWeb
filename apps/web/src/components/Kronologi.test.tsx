import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { Kronologi } from "./Kronologi";

describe("Kronologi", () => {
  it("shows a provenance-bound timeline", () => {
    render(<Kronologi />);

    expect(screen.getByRole("heading", { name: "Kronologi" })).toBeInTheDocument();
    expect(screen.getByText("Kontraktsinngaaelse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Signert_Avtale.pdf/i })).toBeInTheDocument();
  });

  it("selects and opens a source when a timeline source link is clicked", async () => {
    const user = userEvent.setup();
    const jumpSpy = vi.spyOn(citationStore, "jumpToSource");
    render(<Kronologi />);

    await user.click(screen.getByRole("button", { name: /Epost_Vedlegg_A.docx/i }));

    const preview = screen.getByLabelText("Valgt kilde");
    expect(preview).toHaveTextContent("doc_014");
    expect(preview).toHaveTextContent("E-post beskriver forsinkelse");
    expect(jumpSpy).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_014",
      sourceUnitId: "doc_014_p2",
      page: 2
    }));
  });
});
