import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

describe("Dashboard", () => {
  it("shows the guided case workspace and primary action", () => {
    render(
      <Dashboard activeCaseName="Holands Hage" onNavigate={vi.fn()} onNewCase={vi.fn()} onOpenWizard={vi.fn()} />
    );

    expect(screen.getByRole("heading", { name: "Holands Hage" })).toBeInTheDocument();
    expect(screen.getByText("97%")).toBeInTheDocument();
    expect(screen.getByText(/12 dokumenter/i)).toBeInTheDocument();
  });

  it("routes to quarantine from the primary action", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <Dashboard activeCaseName="Holands Hage" onNavigate={onNavigate} onNewCase={vi.fn()} onOpenWizard={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /Karantene/i }));
    expect(onNavigate).toHaveBeenCalledWith("quarantine");
  });

  it("shows the premium entry point when no case is active", async () => {
    const user = userEvent.setup();
    const onNewCase = vi.fn();
    render(<Dashboard activeCaseName={null} onNavigate={vi.fn()} onNewCase={onNewCase} onOpenWizard={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Bygg en kildebundet oversikt over saken" })).toBeInTheDocument();
    expect(screen.getByText(/Last opp dokumentene/)).toBeInTheDocument();
    expect(screen.getByLabelText("Anbefalt start")).toHaveClass("command-portal-grid");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("97%")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Opprett sak og last opp dokumenter/i }));

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });
});
