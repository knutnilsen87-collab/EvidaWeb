import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { SaksromView } from "./SaksromView";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { tenantId: "tenant_123" },
  }),
}));

vi.mock("../lib/api", () => ({
  fetchCaseDocuments: vi.fn().mockResolvedValue([]),
  fetchSaksromSummary: vi.fn().mockResolvedValue({
    caseId: "case_123",
    title: "Forelopig saksoppsummering",
    summary: "Forelopig kildebundet oversikt.",
    findings: [],
    sources: [],
    sourceBound: true,
    warnings: ["PARTIAL_SOURCE_COVERAGE"],
  }),
  fetchSourceCoverage: vi.fn().mockResolvedValue({
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
    documentCoverage: [],
  }),
}));

vi.mock("../lib/sourceUnits", () => ({
  fetchSourceWindow: vi.fn().mockResolvedValue({
    units: [
      { id: "unit_1", title: "Side 1", excerpt: "Excerpt text", hash: "hash1" },
    ],
    startPage: 1,
    endPage: 1,
    totalPages: 10,
  }),
}));

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
      ocrRequired: false,
    },
    {
      id: "doc_002",
      tenantId: "tenant_123",
      filename: "quarantine_doc.pdf",
      status: "quarantine" as const,
      sha256: "hash2",
      pages: 4,
      ocrRequired: false,
    },
  ];

  it("does not render the default document pane initially", () => {
    render(
      <SaksromView
        caseId="case_123"
        tenantId="tenant_123"
        documents={mockDocs}
      />,
    );

    expect(screen.queryByText("DOKUMENTGRUNNLAG")).not.toBeInTheDocument();
    expect(screen.queryByText("Signert klientavtale")).not.toBeInTheDocument();
    expect(screen.queryByText("Virtualisert PDF")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Juridisk reasoning engine" }),
    ).toBeInTheDocument();
  });

  it("renders preliminary banner when source basis is incomplete", async () => {
    render(
      <SaksromView
        caseId="case_123"
        tenantId="tenant_123"
        documents={mockDocs}
      />,
    );

    expect(
      screen.getAllByText("Foreløpig kildegrunnlag").length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/72 av 78 sider/i)).length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/5 sider krever OCR/i)).length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/1 side krever kontroll/i)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Mangler OCR: side 1-5/i)).toBeInTheDocument();
  });

  it("opens the preview drawer when citation is clicked, and closes it when close is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <SaksromView
        caseId="case_123"
        tenantId="tenant_123"
        documents={mockDocs}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Lukk preview" }),
    ).not.toBeInTheDocument();

    citationStore.jumpToSource({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p450",
      page: 450,
      pageNumber: 450,
      paragraph: "p12",
      rect: { top: 210, left: 50, width: 300, height: 30 },
    });

    const closeBtn = await screen.findByRole("button", {
      name: "Lukk preview",
    });
    expect(closeBtn).toBeInTheDocument();
    expect(screen.getByText("doc_001_p450")).toBeInTheDocument();

    await user.click(closeBtn);
    expect(
      screen.queryByRole("button", { name: "Lukk preview" }),
    ).not.toBeInTheDocument();
    expect(citationStore.activeCitation).toBeNull();
  });
});
