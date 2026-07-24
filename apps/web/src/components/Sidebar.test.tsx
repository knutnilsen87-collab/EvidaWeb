import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("groups navigation by the legal workflow phases", () => {
    render(<Sidebar activeView="dashboard" onNavigate={vi.fn()} onNewCase={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Kilder" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analyse" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leveranse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kronologi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Opprett ny sak/i })).toBeInTheDocument();
  });

  it("navigates with typed workspace ids", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Sidebar activeView="dashboard" onNavigate={onNavigate} onNewCase={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Kronologi/i }));

    expect(onNavigate).toHaveBeenCalledWith("chronology");
  });

  it("opens the new case flow from the work section", async () => {
    const onNewCase = vi.fn();
    const user = userEvent.setup();
    render(<Sidebar activeView="dashboard" onNavigate={vi.fn()} onNewCase={onNewCase} />);

    await user.click(screen.getByRole("button", { name: /Opprett ny sak/i }));

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });

  it("keeps active-case pilot context visible on desktop", () => {
    render(
      <Sidebar
        activeCaseName="Sak6_stor_saksmappe"
        activeView="saksrom"
        documents={[{
          id: "doc_1",
          filename: "Kontrakt.pdf",
          status: "source_ready",
          pages: 779,
          ocrRequired: false
        }]}
        onNavigate={vi.fn()}
        onNewCase={vi.fn()}
      />
    );

    const activeCase = screen.getByLabelText("Aktiv sak");
    expect(activeCase).toHaveTextContent("Sak6_stor_saksmappe");
    expect(activeCase).toHaveTextContent("779");
    expect(activeCase).toHaveTextContent("100%");
    expect(activeCase).toHaveTextContent("Pilot");
    expect(activeCase).toHaveTextContent("Testdata only");
  });

  it("keeps locked modules focusable with accessible help text", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <Sidebar
        activeView="dashboard"
        hasActiveCase
        hasReadySourceBasis={false}
        onNavigate={onNavigate}
        onNewCase={vi.fn()}
      />
    );

    const saksrom = screen.getByRole("button", { name: /Saksrom/i });
    expect(saksrom).toHaveAttribute("aria-disabled", "true");
    expect(saksrom).toHaveTextContent("Last opp kilder for å åpne Saksrommet.");
    const title = within(saksrom).getByText("Saksrom");
    const lockBadge = within(saksrom).getByText("Låst");
    expect(title).toHaveClass("sidebar-nav-item-title");
    expect(lockBadge).toHaveClass("nav-lock-icon");
    expect(title).not.toBe(lockBadge);
    expect(title.nextElementSibling).toBe(lockBadge);
    expect(within(saksrom).getByText("Last opp kilder for å åpne Saksrommet.")).toHaveClass("sidebar-nav-item-description");

    await user.click(saksrom);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
