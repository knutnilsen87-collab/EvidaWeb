import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BatchApprovalPanel } from "./BatchApprovalPanel";

describe("BatchApprovalPanel", () => {
  it("approves source sections without marking the whole large document ready", async () => {
    const user = userEvent.setup();
    render(<BatchApprovalPanel />);

    expect(screen.getByText(/901-10000/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Kapittel 1: Avtale og varsling/i }));
    const dialog = screen.getByRole("dialog", { name: /Kapittel 1: Avtale og varsling/i });
    expect(within(dialog).getByText(/Seksjonen er ikke ferdig godkjent/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Godkjenn seksjon" }));

    expect(await screen.findByText(/0\/250 verifisert/)).toBeInTheDocument();
    expect(screen.getAllByText("godkjent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Seksjonen er godkjent.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Godkjenn seksjon" })).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/901-10000/)).toBeInTheDocument();
  });
});
