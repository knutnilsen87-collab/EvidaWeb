import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { citationStore } from "../lib/CitationManager";
import { SaksromView } from "./SaksromView";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { tenantId: "tenant_123" }
  })
}));

vi.mock("../lib/api", () => ({
  fetchCaseDocuments: vi.fn().mockResolvedValue([])
}));

vi.mock("../lib/sourceUnits", () => ({
  fetchSourceWindow: vi.fn().mockResolvedValue({
    units: [
      { id: "unit_1", title: "Side 1", excerpt: "Excerpt text", hash: "hash1" }
    ],
    startPage: 1,
    endPage: 1,
    totalPages: 10
  })
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
      status: "source_ready" as const,
      sha256: "hash1",
      pages: 4,
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

    // Default document pane text must not be rendered
    expect(screen.queryByText("DOKUMENTGRUNNLAG")).not.toBeInTheDocument();
    expect(screen.queryByText("Signert klientavtale")).not.toBeInTheDocument();
    expect(screen.queryByText("Virtualisert PDF")).not.toBeInTheDocument();

    // Chat / reasoning engine should be visible
    expect(screen.getByRole("heading", { name: "Juridisk reasoning engine" })).toBeInTheDocument();
  });

  it("renders preliminary banner when source basis is incomplete", () => {
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    // 50% coverage because 1 of 2 is source_ready. Preliminary banner should show.
    expect(screen.getByText("Foreløpig kildegrunnlag")).toBeInTheDocument();
    expect(screen.getByText(/Brukes nå: 1 dokumenter/i)).toBeInTheDocument();
  });

  it("opens the preview drawer when citation is clicked, and closes it when close is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SaksromView caseId="case_123" tenantId="tenant_123" documents={mockDocs} />);

    // Initially, no close preview button
    expect(screen.queryByRole("button", { name: "Lukk preview" })).not.toBeInTheDocument();

    // Trigger jump-to-source
    citationStore.jumpToSource({
      documentId: "doc_001",
      sourceUnitId: "doc_001_p450",
      page: 450,
      pageNumber: 450,
      paragraph: "p12",
      rect: { top: 210, left: 50, width: 300, height: 30 }
    });

    // The document pane should now be visible
    const closeBtn = await screen.findByRole("button", { name: "Lukk preview" });
    expect(closeBtn).toBeInTheDocument();
    expect(screen.getByText("doc_001_p450")).toBeInTheDocument();

    // Clicking close button should clear citation and close pane
    await user.click(closeBtn);
    expect(screen.queryByRole("button", { name: "Lukk preview" })).not.toBeInTheDocument();
    expect(citationStore.activeCitation).toBeNull();
  });
});
