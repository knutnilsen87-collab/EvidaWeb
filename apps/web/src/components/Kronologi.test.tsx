import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Kronologi } from "./Kronologi";

describe("Kronologi", () => {
  it("shows a provenance-bound timeline", () => {
    render(<Kronologi />);

    expect(screen.getByRole("heading", { name: "Kronologi" })).toBeInTheDocument();
    expect(screen.getByText("Kontraktsinngåelse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Signert_Avtale.pdf/i })).toBeInTheDocument();
  });

  it("selects a source when a timeline source link is clicked", async () => {
    const user = userEvent.setup();
    render(<Kronologi />);

    await user.click(screen.getByRole("button", { name: /Epost_Vedlegg_A.docx/i }));

    const preview = screen.getByLabelText("Valgt kilde");
    expect(preview).toHaveTextContent("doc_014");
    expect(preview).toHaveTextContent("E-post beskriver forsinkelse");
  });
});
