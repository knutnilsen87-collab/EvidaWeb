import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("groups navigation by the legal workflow phases", () => {
    render(<Sidebar activeView="dashboard" onNavigate={vi.fn()} onNewCase={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Arbeid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analyse" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Produksjon" })).toBeInTheDocument();
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
});
