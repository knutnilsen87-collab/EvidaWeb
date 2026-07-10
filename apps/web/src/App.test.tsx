import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { citationStore } from "./lib/CitationManager";

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

function authResponse() {
  return {
    id: "00000000-0000-0000-0000-000000000102",
    email: "jurist@firma.no",
    name: "Advokat Hansen",
    tenantId: "00000000-0000-0000-0000-000000000101",
    roles: ["USER"]
  };
}

function backendCases() {
  return [
    {
      id: "cccccccc-1111-4222-8333-444444444444",
      tenantId: "00000000-0000-0000-0000-000000000101",
      title: "case_web_demo",
      status: "OPEN",
      localFirst: true
    },
    {
      id: "dddddddd-1111-4222-8333-444444444444",
      tenantId: "00000000-0000-0000-0000-000000000101",
      title: "Holands Hage",
      status: "OPEN",
      localFirst: true
    }
  ];
}

describe("App workroom router", () => {
  beforeEach(() => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/auth/me")) {
        return { ok: true, json: async () => authResponse() };
      }
      if (url.includes("/api/v1/cases")) {
        return { ok: true, json: async () => backendCases() };
      }
      if (url.includes("/api/documents")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "doc_001",
              tenantId: "00000000-0000-0000-0000-000000000101",
              filename: "Holands_Hage_Kontrakt_2026.pdf",
              status: "SOURCE_READY",
              sha256: "somehash"
            }
          ]
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("opens on the case vitality dashboard", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Juridisk analyse, forenklet." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Oversikt/i })).toHaveAttribute("aria-current", "page");
  });

  it("creates a new case from the sidebar and continues to document intake", async () => {
    const user = userEvent.setup();
    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Opprett ny sak/i }));
    await user.type(screen.getByLabelText("Navn på saken"), "Holands Hage");
    await user.click(screen.getByRole("button", { name: "Opprett arbeidsområde" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Opprett ny sak" })).not.toBeInTheDocument()
    );
    expect(await screen.findByRole("heading", { name: "Dokumentinntak" })).toBeInTheDocument();
    expect(screen.getByText(/Holands Hage er opprettet/i)).toBeInTheDocument();
  });

  it("opens the new case overlay from Command Palette", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByLabelText("Søk i kommandoer"), "ny sak");
    await user.click(screen.getByRole("option", { name: /Opprett ny sak/i }));

    expect(screen.getByRole("dialog", { name: "Opprett ny sak" })).toBeInTheDocument();
  });

  it("shows active identity and tenant context in the shell", async () => {
    renderApp();

    expect(await screen.findByText("Advokat Hansen")).toBeInTheDocument();
    expect(screen.getByLabelText("Aktiv identitet")).toHaveTextContent(
      "00000000-0000-0000-0000-000000000101"
    );
  });

  it("routes to Saksrom split-screen from the sidebar", async () => {
    const user = userEvent.setup();
    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Saksrom/i }));

    expect(screen.queryByRole("heading", { level: 1, name: "Signert klientavtale" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Saksoppsummering" })).toBeInTheDocument();
    citationStore.jumpToSource({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p450",
      page: 450,
      pageNumber: 450,
      paragraph: "p12",
      rect: { top: 210, left: 50, width: 300, height: 30 }
    });

    expect(await screen.findByLabelText("Aktiv kilde doc_001_p450")).toBeInTheDocument();
  });

  it("routes to the interactive Bevismatrise from the sidebar", async () => {
    const user = userEvent.setup();
    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Bevismatrise/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Strafferettslig bevismatrise" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kildeklare dokumenter")).toBeInTheDocument();
  });

  it("routes to Kronologi from the sidebar", async () => {
    const user = userEvent.setup();
    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Kronologi/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Kronologi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sakstidslinje")).toBeInTheDocument();
  });

  it("routes to Utkast document builder from the sidebar", async () => {
    const user = userEvent.setup();
    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Utkast/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Utkast & Eksport" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dokumentbygger")).toBeInTheDocument();
  });

  it("intercepts Saksrom navigation when source coverage is incomplete", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/auth/me")) {
        return { ok: true, json: async () => authResponse() };
      }
      if (url.includes("/api/v1/cases")) {
        return { ok: true, json: async () => backendCases() };
      }
      if (url.includes("/api/documents")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "doc_001",
              tenantId: "00000000-0000-0000-0000-000000000101",
              filename: "verified_doc.pdf",
              status: "SOURCE_READY",
              sha256: "hash1"
            },
            {
              id: "doc_002",
              tenantId: "00000000-0000-0000-0000-000000000101",
              filename: "quarantine_doc.pdf",
              status: "QUARANTINE",
              sha256: "hash2"
            }
          ]
        };
      }
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    const sidebar = screen.getByLabelText("Arbeidsrom");
    await user.click(within(sidebar).getByRole("button", { name: /Saksrom/i }));

    const modal = await screen.findByRole("dialog", { name: /Fortsett med foreløpig kildegrunnlag/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText("50%")).toBeInTheDocument();
    expect(within(modal).getByText("Ferdig behandlet")).toBeInTheDocument();
    expect(within(modal).getByText("I karantene / venter")).toBeInTheDocument();
    expect(within(modal).getByText("Behandling feilet")).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: /Avbryt/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Fortsett med foreløpig kildegrunnlag/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Signert klientavtale" })).not.toBeInTheDocument();

    await user.click(within(sidebar).getByRole("button", { name: /Saksrom/i }));
    const modal2 = await screen.findByRole("dialog", { name: /Fortsett med foreløpig kildegrunnlag/i });
    const confirmButton = within(modal2).getByRole("button", { name: "Fortsett til Saksrom" });
    expect(confirmButton).toBeDisabled();

    await user.click(within(modal2).getByRole("checkbox", { name: /Jeg forstår og vil fortsette/i }));
    await user.click(confirmButton);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Fortsett med foreløpig kildegrunnlag/i })).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { level: 1, name: "Signert klientavtale" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Foreløpig kildegrunnlag").length).toBeGreaterThan(0);
    expect(screen.getByText(/Brukes nå: 1 dokumenter/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Foreløpig saksoppsummering" })).toBeInTheDocument();
  });
});
