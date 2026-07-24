import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCaseDocuments, fetchSaksromSummary } from "../lib/api";
import { citationStore } from "../lib/CitationManager";
import { SaksromView } from "./SaksromView";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { tenantId: "tenant_123" }
  }),
  useOptionalAuth: () => ({
    user: { tenantId: "tenant_123" }
  })
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  const sourceCoverage = {
    totalDocuments: 1,
    sourceReadyDocuments: 0,
    partialDocuments: 1,
    failedDocuments: 0,
    totalPages: 78,
    readyPages: 72,
    ocrReadyPages: 0,
    textReadyPages: 72,
    missingOcrPages: 5,
    belowThresholdPages: 1,
    failedPages: 0,
    coveragePercent: 92,
    missingOcrPageRanges: "1-5",
    belowThresholdPageRanges: "75",
    documentCoverage: []
  };
  const summary = {
    caseId: "case_123",
    title: "Første saksforståelse",
    summary: "Foreløpig kildebundet oversikt.",
    findings: [
      {
        heading: "Viktigste faktum",
        text: "Et viktig punkt er støttet i dokumentgrunnlaget.",
        sources: [{ documentId: "doc_001", sourceUnitId: "unit_1", pageNumber: 2 }]
      }
    ],
    sources: [{ documentId: "doc_001", sourceUnitId: "unit_1", pageNumber: 2 }],
    sourceBound: true,
    warnings: ["PARTIAL_SOURCE_COVERAGE"],
    coverage: sourceCoverage
  };
  return {
    ...actual,
    auditClientEvent: vi.fn().mockResolvedValue(undefined),
    fetchCaseDocuments: vi.fn().mockResolvedValue([]),
    fetchSaksromSummary: vi.fn().mockResolvedValue(summary),
    fetchSourceCoverage: vi.fn().mockResolvedValue(sourceCoverage)
  };
});

describe("SaksromView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    citationStore.clear();
  });

  const mockDocs = [
    {
      id: "doc_001",
      tenantId: "tenant_123",
      filename: "Holands_Hage_Kontrakt_2026.pdf",
      status: "partial_source_ready" as const,
      sha256: "hash1",
      pages: 78,
      ocrRequired: false
    },
    {
      id: "doc_002",
      tenantId: "tenant_123",
      filename: "quarantine_doc.pdf",
      status: "quarantine" as const,
      sha256: "hash2",
      pages: 4,
      ocrRequired: false
    }
  ];

  it("does not render the default document pane initially", () => {
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    expect(screen.queryByText("DOKUMENTGRUNNLAG")).not.toBeInTheDocument();
    expect(screen.queryByText("Signert klientavtale")).not.toBeInTheDocument();
    expect(screen.queryByText("Virtualisert PDF")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Saksrom chatlogg")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Juridisk reasoning engine" })).not.toBeInTheDocument();
  });

  it("renders preliminary source basis as a compact coverage status by the input", async () => {
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    expect(await screen.findByText(/Foreløpig kildegrunnlag · 72 av 78 sider klare/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/72 av 78 sider/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/5 sider krever OCR/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1 side krever kontroll/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Mangler OCR: side/i)).not.toBeInTheDocument();
  });

  it("renders live opening summary when source basis exists", async () => {
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    expect(screen.getByText("Jeg går gjennom dokumentgrunnlaget nå.")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchSaksromSummary).toHaveBeenCalledWith("tenant_123", {
        caseId: "case_123",
        includePartial: true,
        sourceBasis: "READY_PAGE_UNITS_ONLY"
      })
    );
    expect(await screen.findByRole("heading", { name: "Første saksforståelse" })).toBeInTheDocument();
    expect(await screen.findByText(/Viktigste faktum/)).toBeInTheDocument();
  });

  it("does not poll settled documents while the user reads Saksrom", async () => {
    vi.useFakeTimers();
    const fetchCaseDocumentsMock = vi.mocked(fetchCaseDocuments);

    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    await vi.advanceTimersByTimeAsync(12_000);

    expect(fetchCaseDocumentsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("opens the source overlay when citation is clicked, and closes it when back is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    expect(screen.queryByRole("button", { name: "Tilbake til Saksrom" })).not.toBeInTheDocument();

    citationStore.jumpToSource({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p450",
      page: 450,
      pageNumber: 450,
      paragraph: "p12",
      rect: { top: 210, left: 50, width: 300, height: 30 }
    });

    const closeBtn = await screen.findByRole("button", { name: "Tilbake til Saksrom" });
    expect(closeBtn).toBeInTheDocument();
    expect(screen.getByText("doc_001_p450")).toBeInTheDocument();

    await user.click(closeBtn);
    expect(screen.queryByRole("button", { name: "Tilbake til Saksrom" })).not.toBeInTheDocument();
    expect(citationStore.activeCitation).toBeNull();
  });
});
