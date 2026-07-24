import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartupGateway } from "./StartupGateway";

const tenantId = "00000000-0000-0000-0000-000000000101";
const caseId = "dddddddd-1111-4222-8333-444444444444";

describe("StartupGateway case cards", () => {
  afterEach(() => vi.restoreAllMocks());

  function renderGateway(onMoveToTrash = vi.fn()) {
    render(<StartupGateway tenantId={tenantId} onNewCase={vi.fn()} onOpenCase={vi.fn()} onMoveToTrash={onMoveToTrash} />);
    return onMoveToTrash;
  }

  it("renders a discreet trash action and opens the non-destructive confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: caseId, tenantId, title: "Holands Hage", status: "OPEN", localFirst: true }]
    }));
    renderGateway();
    await screen.findByText("Holands Hage");

    const trash = screen.getByRole("button", { name: "Flytt Holands Hage til papirkurv" });
    expect(trash).toHaveAttribute("title", "Flytt til papirkurv");
    await user.click(trash);

    expect(screen.getByRole("dialog", { name: "Flytt saken til papirkurv?" })).toBeInTheDocument();
    expect(screen.getByText("Dokumenter slettes ikke permanent.")).toBeInTheDocument();
  });

  it("cancels without moving the case", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: caseId, tenantId, title: "Holands Hage", status: "OPEN", localFirst: true }]
    }));
    const onMove = renderGateway();
    await screen.findByText("Holands Hage");
    await user.click(screen.getByRole("button", { name: "Flytt Holands Hage til papirkurv" }));
    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Holands Hage")).toBeInTheDocument();
  });

  it("confirms through onMoveToTrash and never calls a permanent delete API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => [{ id: caseId, tenantId, title: "Holands Hage", status: "OPEN", localFirst: true }]
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const onMove = renderGateway();
    expect(await screen.findByText("Holands Hage")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flytt Holands Hage til papirkurv" }));
    await user.click(screen.getByRole("button", { name: "Flytt til papirkurv" }));

    await waitFor(() => expect(screen.queryByText("Holands Hage")).not.toBeInTheDocument());
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: caseId }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
});
