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

    await user.click(screen.getByRole("button", { name: /Karantene-slusen/i }));
    expect(onNavigate).toHaveBeenCalledWith("quarantine");
  });

  it("shows the premium entry point when no case is active", async () => {
    const user = userEvent.setup();
    const onNewCase = vi.fn();
    render(<Dashboard activeCaseName={null} onNavigate={vi.fn()} onNewCase={onNewCase} onOpenWizard={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Juridisk analyse, forenklet." })).toBeInTheDocument();
    expect(screen.getByLabelText("Hurtigvalg for ny arbeidsflyt")).toHaveClass("command-portal-grid");
    await user.click(screen.getByRole("button", { name: /Opprett sak manuelt/i }));

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });

  it("opens the wizard from the unsure starting point", async () => {
    const user = userEvent.setup();
    const onOpenWizard = vi.fn();
    render(<Dashboard activeCaseName={null} onNavigate={vi.fn()} onNewCase={vi.fn()} onOpenWizard={onOpenWizard} />);

    await user.click(screen.getByRole("button", { name: /Jeg vet ikke hvor jeg skal starte/i }));

    expect(onOpenWizard).toHaveBeenCalledTimes(1);
  });
});
