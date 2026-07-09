import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BatchApprovalPanel } from "./BatchApprovalPanel";

describe("BatchApprovalPanel", () => {
  it("approves source sections without marking the whole large document ready", async () => {
    const user = userEvent.setup();
    render(<BatchApprovalPanel />);

    expect(screen.getByText(/901-10000/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Godkjenn seksjon" })[0]);

    expect(await screen.findByText(/0\/250 verifisert/)).toBeInTheDocument();
    expect(screen.getAllByText("partly-ready").length).toBeGreaterThan(0);
    expect(screen.getByText(/901-10000/)).toBeInTheDocument();
  });
});
