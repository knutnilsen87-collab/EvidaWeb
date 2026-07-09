import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UtkastModul } from "./UtkastModul";

describe("UtkastModul", () => {
  it("renders a document builder with live paper preview", () => {
    render(<UtkastModul />);

    expect(screen.getByRole("heading", { name: "Utkast & Eksport" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dokumentbygger")).toBeInTheDocument();
    expect(screen.getByLabelText("Live forhåndsvisning")).toHaveTextContent("doc_001, s. 1");
  });

  it("updates the preview when document components are toggled", async () => {
    const user = userEvent.setup();
    render(<UtkastModul />);

    await user.click(screen.getByRole("checkbox", { name: /Inkluder Kronologi/i }));

    expect(screen.getByLabelText("Live forhåndsvisning")).not.toHaveTextContent(
      "Kontrakten ble inngått"
    );
  });

  it("requires quality checklist confirmation before DOCX generation", async () => {
    const user = userEvent.setup();
    render(<UtkastModul />);

    await user.click(screen.getByRole("button", { name: /Generer Sluttprodukt/i }));

    const dialog = screen.getByRole("dialog", { name: /Kvalitetssjekk/i });
    expect(within(dialog).getByRole("button", { name: "Generer DOCX" })).toBeDisabled();

    for (const checkbox of within(dialog).getAllByRole("checkbox")) {
      await user.click(checkbox);
    }

    await user.click(within(dialog).getByRole("button", { name: "Generer DOCX" }));

    expect(screen.queryByRole("dialog", { name: /Kvalitetssjekk/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Utkastet er klargjort som DOCX/i)).toBeInTheDocument();
  });

  it("enforces warning banner and preliminary export confirmation in preliminary mode", async () => {
    const user = userEvent.setup();
    render(<UtkastModul isPreliminary={true} />);

    expect(
      screen.getByText(/Dette utkastet ble produsert med foreløpig kildegrunnlag/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Generer Sluttprodukt/i }));

    const dialog = screen.getByRole("dialog", { name: /Kvalitetssjekk/i });
    
    for (const checkbox of within(dialog).getAllByRole("checkbox")) {
      if (!checkbox.closest(".preliminary-export-ack-check")) {
        await user.click(checkbox);
      }
    }
    
    expect(within(dialog).getByRole("button", { name: "Generer DOCX" })).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: /Jeg forstår at eksporten bygger på foreløpig kildegrunnlag/i }));

    expect(within(dialog).getByRole("button", { name: "Generer DOCX" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Generer DOCX" }));
    expect(screen.getByText(/Utkastet er klargjort som DOCX/i)).toBeInTheDocument();
  });
});
