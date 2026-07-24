import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppTestHarness } from "./AppTestHarness";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
});

describe("AppRouter state boundary", () => {
  it("renders StartupPortal without AppShell for authenticated user without active case", async () => {
    render(<AppTestHarness state="authenticated_no_active_case" />);

    expect(await screen.findByRole("heading", { name: "Saksoversikt" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Arbeidsrom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kontrollpanel")).not.toBeInTheDocument();
  });

  it("renders AppShell for authenticated user with active case", async () => {
    render(<AppTestHarness state="authenticated_active_case" />);

    expect(await screen.findByRole("heading", { name: "Dokumentinntak" })).toBeInTheDocument();
    expect(screen.getByLabelText("Arbeidsrom")).toBeInTheDocument();
    expect(screen.getByLabelText("Kontrollpanel")).toBeInTheDocument();
  });

  it("renders auth state rather than cockpit when unauthenticated", () => {
    render(<AppTestHarness state="unauthenticated" />);

    expect(screen.getByRole("heading", { name: "Logg inn for å fortsette" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Arbeidsrom")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Saksoversikt" })).not.toBeInTheDocument();
  });

  it("renders controlled resolving and failure states", async () => {
    const resolving = render(<AppTestHarness state="authenticated_case_resolving" />);
    expect(await screen.findByText(/Harness-sak klargjøres/i)).toBeInTheDocument();
    resolving.unmount();

    render(<AppTestHarness state="authenticated_case_resolution_failed" />);
    expect(await screen.findByText("Kontrollert harness-feil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
  });
});
