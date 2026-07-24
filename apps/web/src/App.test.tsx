import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { clearBackendCaseIdCacheForTests } from "./lib/api";

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
      id: "dddddddd-1111-4222-8333-444444444444",
      tenantId: "00000000-0000-0000-0000-000000000101",
      title: "Holands Hage",
      status: "OPEN",
      localFirst: true,
      updatedAt: "2026-07-11T10:00:00Z",
      documentCount: 2
    }
  ];
}

function sourceCoverage() {
  return {
    totalDocuments: 1,
    sourceReadyDocuments: 1,
    partialDocuments: 0,
    failedDocuments: 0,
    totalPages: 12,
    readyPages: 12,
    ocrReadyPages: 0,
    textReadyPages: 12,
    missingOcrPages: 0,
    belowThresholdPages: 0,
    failedPages: 0,
    coveragePercent: 100,
    documentCoverage: []
  };
}

function installDefaultFetchMock() {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/auth/me")) {
      return { ok: true, json: async () => authResponse() };
    }
    if (url.includes("/api/v1/cases")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { title?: string };
        return {
          ok: true,
          json: async () => ({
            id: "eeeeeeee-1111-4222-8333-444444444444",
            tenantId: "00000000-0000-0000-0000-000000000101",
            title: body.title ?? "Ny sak",
            status: "OPEN",
            localFirst: true
          })
        };
      }
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
            status: "source_ready",
            sha256: "somehash"
          }
        ]
      };
    }
    if (url.includes("/api/saksrom/source-coverage")) {
      return { ok: true, json: async () => sourceCoverage() };
    }
    if (url.includes("/api/saksrom/summary")) {
      return {
        ok: true,
        json: async () => ({
          caseId: "eeeeeeee-1111-4222-8333-444444444444",
          title: "Første saksforståelse",
          summary: "Kort kildebasert oppsummering.",
          findings: [],
          sources: [{ documentId: "doc_001", sourceUnitId: "unit_1", pageNumber: 2 }],
          sourceBound: true,
          warnings: [],
          coverage: sourceCoverage()
        })
      };
    }
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App startup and shell routing", () => {
  beforeEach(() => {
    clearBackendCaseIdCacheForTests();
    window.localStorage.clear();
    installDefaultFetchMock();
  });

  it("startup without active case renders Saksoversikt without AppShell", async () => {
    renderApp();

    expect(await screen.findByRole("heading", { name: "Saksoversikt" })).toBeInTheDocument();
    expect(screen.getByText("EVIDA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opprett ny sak" })).toBeInTheDocument();
    expect(screen.getByLabelText("Søk i saker")).toBeInTheDocument();
    expect(screen.queryByLabelText("Arbeidsrom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kontrollpanel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mobil bunnnavigasjon")).not.toBeInTheDocument();
    expect(screen.queryByText("Saksrom")).not.toBeInTheDocument();
    expect(screen.queryByText("Kronologi")).not.toBeInTheDocument();
    expect(screen.queryByText("Risiko")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Spør om saken/i)).not.toBeInTheDocument();
  });

  it("startup renders the backend case list", async () => {
    renderApp();

    expect(await screen.findByText("Holands Hage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Åpne sak" })).toBeInTheDocument();
  });

  it("opening a case renders AppShell and document intake", async () => {
    const user = userEvent.setup();
    renderApp();

    const caseTitle = await screen.findByText("Holands Hage");
    await user.click(within(caseTitle.closest("article") as HTMLElement).getByRole("button", { name: "Åpne sak" }));

    expect(await screen.findByRole("heading", { name: "Dokumentinntak" })).toBeInTheDocument();
    expect(screen.getByLabelText("Arbeidsrom")).toBeInTheDocument();
    expect(screen.getByLabelText("Kontrollpanel")).toBeInTheDocument();
    expect(screen.getByText("Slipp filer eller mapper her")).toBeInTheDocument();
  });

  it("shows case registration pending state only while backend resolution is pending", async () => {
    const user = userEvent.setup();
    const pendingCaseRequest = new Promise(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({ ok: true, json: async () => authResponse() });
        }
        if (url.includes("/api/v1/cases") && init?.method === "POST") {
          return pendingCaseRequest;
        }
        if (url.includes("/api/v1/cases")) {
          return Promise.resolve({ ok: true, json: async () => backendCases() });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      })
    );

    renderApp();
    await screen.findByRole("heading", { name: "Saksoversikt" });
    await user.click(screen.getByRole("button", { name: "Opprett ny sak" }));
    await user.type(screen.getByLabelText("Navn på saken"), "Morten test sak");
    await user.click(screen.getByRole("button", { name: "Opprett uten dokumenter" }));

    expect(await screen.findByText("Morten test sak klargjøres")).toBeInTheDocument();
    expect(screen.getByText(/Venter på backend-registrering/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dokumentinntak" })).not.toBeInTheDocument();
  });

  it("shows recoverable API error state for case list failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/auth/me")) {
          return { ok: true, json: async () => authResponse() };
        }
        if (url.includes("/api/v1/cases")) {
          return { ok: false, json: async () => ({ message: "offline" }) };
        }
        return { ok: true, json: async () => [] };
      })
    );

    renderApp();

    expect(await screen.findByRole("heading", { name: "Sakslisten kunne ikke hentes." })).toBeInTheDocument();
    expect(screen.getByText("Kontroller at API-et kjører, eller prøv igjen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Arbeidsrom")).not.toBeInTheDocument();
  });

  it("primary startup CTA creates a case and routes to the uploader", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: "Saksoversikt" });
    await user.click(screen.getByRole("button", { name: "Opprett ny sak" }));
    await user.type(screen.getByLabelText("Navn på saken"), "Morten test sak");
    await user.click(screen.getByRole("button", { name: "Opprett uten dokumenter" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ny sak" })).not.toBeInTheDocument()
    );
    expect(await screen.findByRole("heading", { name: "Dokumentinntak" })).toBeInTheDocument();
    expect(screen.getByText("Slipp filer eller mapper her")).toBeInTheDocument();
    expect(screen.getByLabelText("Arbeidsrom")).toBeInTheDocument();
  });
});
