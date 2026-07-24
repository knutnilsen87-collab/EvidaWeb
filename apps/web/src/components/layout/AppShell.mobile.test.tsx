import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvidaDocument } from "../../lib/api";
import type { WorkspaceView } from "../../navigation";
import { AppShell } from "./AppShell";

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

const identity = {
  name: "Advokat Hansen",
  tenantId: "tenant_123",
  loading: false,
  authenticated: true
};

const readyDocument: EvidaDocument = {
  id: "doc_001",
  filename: "Masterdoc.pdf",
  status: "partial_source_ready",
  sha256: "hash_001",
  pages: 78,
  ocrRequired: true,
  ingestionError: "PARTIAL parsed_pages=77/78"
};

function renderShell(
  activeView: WorkspaceView = "dashboard",
  props: Partial<ComponentProps<typeof AppShell>> = {}
) {
  const onNavigate = vi.fn();
  const onNewCase = vi.fn();
  const result = render(
    <AppShell
      activeCaseName="Holands Hage"
      activeView={activeView}
      actions={[]}
      documents={[readyDocument]}
      identity={identity}
      lastAction="Kildegrunnlag oppdatert"
      navigationState={{ hasActiveCase: true, hasReadySourceBasis: true }}
      onLogin={vi.fn()}
      onNavigate={onNavigate}
      onNewCase={onNewCase}
      {...props}
    >
      <section aria-label="Arbeidsflate">Mobilinnhold</section>
    </AppShell>
  );
  return { ...result, onNavigate, onNewCase };
}

describe("AppShell mobile responsive shell", () => {
  afterEach(() => {
    setViewport(1440, 900);
  });

  it("uses mobile topbar, status row and bottom navigation on phone widths", async () => {
    const user = userEvent.setup();
    setViewport(390, 844);
    const { onNavigate } = renderShell("dashboard");

    expect(screen.getByLabelText("Mobil toppfelt")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobil bunnnavigasjon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kildegrunnlag:/i })).toHaveTextContent("77 av 78 sider klare");
    expect(screen.queryByLabelText("Arbeidsrom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kontrollpanel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dokumenter" }));
    expect(onNavigate).toHaveBeenCalledWith("import");
  });

  it("opens a mobile status bottom sheet with the best next step", async () => {
    const user = userEvent.setup();
    setViewport(360, 800);
    renderShell("import");

    await user.click(screen.getByRole("button", { name: /Kildegrunnlag:/i }));

    const statusSheet = screen.getByRole("dialog", { name: "Kildegrunnlag og neste steg" });
    expect(within(statusSheet).getByText("Klare sider")).toBeInTheDocument();
    expect(within(statusSheet).getByText("77")).toBeInTheDocument();
    expect(within(statusSheet).getByText("Foreløpig kildegrunnlag klart")).toBeInTheDocument();
  });

  it("opens the Mer sheet with secondary legal modules on tablet widths", async () => {
    const user = userEvent.setup();
    setViewport(768, 1024);
    const { onNavigate } = renderShell("dashboard");

    await user.click(screen.getByRole("button", { name: "Mer" }));

    const moreSheet = screen.getByRole("dialog", { name: "Mer" });
    expect(within(moreSheet).getByRole("button", { name: /Kronologi/i })).toBeInTheDocument();
    expect(within(moreSheet).getByRole("button", { name: /Bevismatrise/i })).toBeInTheDocument();
    await user.click(within(moreSheet).getByRole("button", { name: /Kronologi/i }));
    expect(onNavigate).toHaveBeenCalledWith("chronology");
  });

  it("preserves the desktop sidebar and control panel above the tablet breakpoint", () => {
    setViewport(1440, 900);
    renderShell("dashboard");

    expect(screen.getByLabelText("Arbeidsrom")).toBeInTheDocument();
    expect(screen.getByLabelText("Kontrollpanel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mobil bunnnavigasjon")).not.toBeInTheDocument();
  });

  it("keeps the desktop sidebar open by default and only collapses it with the manual focus toggle", async () => {
    const user = userEvent.setup();
    setViewport(1440, 900);
    renderShell("saksrom");

    const sidebar = screen.getByLabelText("Arbeidsrom");
    const focusToggle = screen.getByRole("button", { name: "Aktiver fokusmodus og skjul sidemenytekst" });
    expect(sidebar).not.toHaveClass("sidebar--collapsed");
    expect(focusToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByPlaceholderText("Spør om saken...")).not.toBeInTheDocument();

    await user.click(focusToggle);
    expect(sidebar).toHaveClass("sidebar--collapsed");
    expect(screen.getByRole("button", { name: "Avslutt fokusmodus og åpne sidemenyen" }))
      .toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "Avslutt fokusmodus og åpne sidemenyen" }));
    expect(sidebar).not.toHaveClass("sidebar--collapsed");
  });
});
