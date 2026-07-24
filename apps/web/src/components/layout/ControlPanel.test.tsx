import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ControlPanel } from "./ControlPanel";
import type { EvidaDocument } from "../../lib/api";

const baseDoc: EvidaDocument = {
  id: "doc_1",
  filename: "masterdoc.pdf",
  status: "partial_source_ready",
  pages: 78,
  ocrRequired: false,
  ingestionError: "PARTIAL_SOURCE_READY parsed_pages=77/78"
};

describe("ControlPanel best next step", () => {
  it("shows neutral startup guidance without case-specific source metrics", () => {
    render(
      <ControlPanel
        activeCaseName={null}
        activeView="dashboard"
        documents={[]}
        onNavigate={vi.fn()}
        onNewCase={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Opprett eller åpne sak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opprett ny sak" })).toBeInTheDocument();
    expect(screen.queryByText("Kildedekning")).not.toBeInTheDocument();
    expect(screen.queryByText("Risiko & varsler")).not.toBeInTheDocument();
  });

  it("mirrors partial source readiness with a Saksrom action", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <ControlPanel
        activeCaseName="Testsak"
        activeView="import"
        documents={[baseDoc]}
        onNavigate={onNavigate}
        onNewCase={vi.fn()}
      />
    );

    expect(screen.getByText("Foreløpig kildegrunnlag klart")).toBeInTheDocument();
    expect(screen.getByText("98.7%")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Fortsett til Saksrom med foreløpig kildegrunnlag" });
    expect(action).toBeInTheDocument();

    await user.click(action);
    expect(onNavigate).toHaveBeenCalledWith("saksrom");
  });

  it("shows upload as the best next action when the case has no documents", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(
      <ControlPanel
        activeCaseName="Testsak"
        activeView="dashboard"
        documents={[]}
        onNavigate={onNavigate}
        onNewCase={vi.fn()}
      />
    );

    const action = screen.getByRole("button", { name: "Last opp dokumenter" });
    await user.click(action);

    expect(onNavigate).toHaveBeenCalledWith("import");
  });

  it("disables the action while upload is active", () => {
    render(
      <ControlPanel
        activeCaseName="Testsak"
        activeView="import"
        documents={[]}
        queueBusy
        onNavigate={vi.fn()}
        onNewCase={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Venter på opplasting ..." })).toBeDisabled();
  });
});
