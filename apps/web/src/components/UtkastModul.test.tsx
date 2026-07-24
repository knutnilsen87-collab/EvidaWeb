import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UtkastModul } from "./UtkastModul";

const CASE_ID = "00000000-0000-0000-0000-000000001101";

vi.mock("../context/AuthContext", () => ({
  useOptionalAuth: () => ({
    user: {
      id: "00000000-0000-0000-0000-000000001003",
      tenantId: "00000000-0000-0000-0000-000000001001",
      email: "jurist@firma.no",
      name: "Jurist",
      roles: ["LAWYER"]
    }
  })
}));

vi.mock("../lib/api", () => ({
  downloadCaseSourceReport: vi.fn().mockResolvedValue({
    url: "blob:evida-source-report",
    filename: "evida-source-report.md"
  })
}));

describe("UtkastModul", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("renders a document builder with live paper preview", () => {
    render(<UtkastModul activeCaseId={CASE_ID} />);

    expect(screen.getByRole("heading", { name: "Utkast & Eksport" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dokumentbygger")).toBeInTheDocument();
    expect(screen.getByLabelText("Live forhåndsvisning")).toHaveTextContent("doc_001, s. 1");
  });

  it("updates the preview when document components are toggled", async () => {
    const user = userEvent.setup();
    render(<UtkastModul activeCaseId={CASE_ID} />);

    await user.click(screen.getByRole("checkbox", { name: /Inkluder Kronologi/i }));

    expect(screen.getByLabelText("Live forhåndsvisning")).not.toHaveTextContent(
      "Kontrakten ble inngått"
    );
  });

  it("requires quality checklist confirmation before DOCX generation", async () => {
    const user = userEvent.setup();
    render(<UtkastModul activeCaseId={CASE_ID} />);

    await user.click(screen.getByRole("button", { name: /Generer Sluttprodukt/i }));

    const dialog = screen.getByRole("dialog", { name: /Kvalitetssjekk/i });
    expect(within(dialog).getByRole("button", { name: "Last ned kilderapport" })).toBeDisabled();

    for (const checkbox of within(dialog).getAllByRole("checkbox")) {
      await user.click(checkbox);
    }

    await user.click(within(dialog).getByRole("button", { name: "Last ned kilderapport" }));

    expect(screen.queryByRole("dialog", { name: /Kvalitetssjekk/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Kildegrunnlagsrapporten er lastet ned/i)).toBeInTheDocument();
  });

  it("enforces warning banner and preliminary export confirmation in preliminary mode", async () => {
    const user = userEvent.setup();
    render(<UtkastModul activeCaseId={CASE_ID} isPreliminary={true} />);

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
    
    expect(within(dialog).getByRole("button", { name: "Last ned kilderapport" })).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: /Jeg forstår at eksporten bygger på foreløpig kildegrunnlag/i }));

    expect(within(dialog).getByRole("button", { name: "Last ned kilderapport" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Last ned kilderapport" }));
    expect(screen.getByText(/Kildegrunnlagsrapporten er lastet ned/i)).toBeInTheDocument();
  });
});
