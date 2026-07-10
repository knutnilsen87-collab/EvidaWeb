import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidaDocument, SaksromSummary, SourceCoverage } from "../lib/api";
import { fetchSaksromSummary } from "../lib/api";
import { citationStore } from "../lib/CitationManager";
import { SaksromCaseSummary } from "./SaksromCaseSummary";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    fetchSaksromSummary: vi.fn()
  };
});

function doc(id: string, filename: string, status: EvidaDocument["status"]): EvidaDocument {
  return {
    id,
    filename,
    status,
    pages: 4,
    ocrRequired: false
  };
}

function coverage(readyPages: number, totalPages: number): SourceCoverage {
  return {
    totalDocuments: 1,
    sourceReadyDocuments: readyPages === totalPages ? 1 : 0,
    partialDocuments: readyPages > 0 && readyPages < totalPages ? 1 : 0,
    failedDocuments: 0,
    totalPages,
    readyPages,
    ocrReadyPages: 0,
    textReadyPages: readyPages,
    missingOcrPages: Math.max(0, totalPages - readyPages),
    belowThresholdPages: 0,
    failedPages: 0,
    coveragePercent: totalPages > 0 ? Math.round((readyPages / totalPages) * 100) : 0,
    missingOcrPageRanges: readyPages < totalPages ? `${readyPages + 1}-${totalPages}` : "",
    belowThresholdPageRanges: "",
    documentCoverage: []
  };
}

function summary(text: string, findingCount = 1): SaksromSummary {
  const findings = Array.from({ length: findingCount }, (_, index) => ({
    heading: `Side ${index + 1}`,
    text: index === 0
      ? "UTSKRIFT AV RETTSBOK viser rettens behandling."
      : `Rettsboken dokumenterer faktisk funn ${index + 1}.`,
    sources: [
      {
        documentId: "10243936-021f-4464-a4a5-80a68a392f40",
        sourceUnitId: `doc_10243936_p${String(index + 1).padStart(4, "0")}_b0001`,
        pageNumber: index + 1,
        quote: index === 0 ? "UTSKRIFT AV RETTSBOK" : `Funn ${index + 1}`
      }
    ]
  }));

  return {
    caseId: "case-1",
    title: "Forelopig kildebundet saksoppsummering",
    summary: text,
    findings,
    sources: findings.flatMap((finding) => finding.sources),
    sourceBound: true,
    warnings: ["PARTIAL_SOURCE_COVERAGE"]
  };
}

describe("SaksromCaseSummary", () => {
  beforeEach(() => {
    vi.mocked(fetchSaksromSummary).mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn()
      }
    });
  });

  it("renders a preliminary source summary for partial 153/156 coverage instead of fallback text", async () => {
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Forelopig analyse fra 153 ferdige sider."));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={98}
        documents={[doc("doc_partial", "masterdoc.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(153, 156)}
      />
    );

    expect(await screen.findByText(/Forelopig analyse fra 153 ferdige sider/)).toBeInTheDocument();
    expect(screen.getByText(/Forel.pig kildegrunnlag/i)).toBeInTheDocument();
    expect(screen.getAllByText("153 av 156 sider").length).toBeGreaterThan(0);
    expect(screen.queryByText(/ikke ferdig behandlet kildegrunnlag/i)).not.toBeInTheDocument();
    expect(screen.queryByText("READY_PAGE_UNITS_ONLY")).not.toBeInTheDocument();
  });

  it("renders a calm preliminary notice for partial 77/78 coverage", async () => {
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Rettsboken er OCR-lest fra klare PageUnits."));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={99}
        documents={[doc("doc_partial", "Masterdoc_001.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(77, 78)}
      />
    );

    expect(await screen.findByText(/Rettsboken er OCR-lest fra klare PageUnits/)).toBeInTheDocument();
    expect(screen.getAllByText("77 av 78 sider").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 sider krever OCR").length).toBeGreaterThan(0);
  });

  it("keeps the no-source fallback when partial coverage has zero ready pages", () => {
    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={0}
        documents={[doc("doc_partial", "venter.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(0, 156)}
      />
    );

    expect(screen.getByText(/ikke ferdig behandlet kildegrunnlag/i)).toBeInTheDocument();
    expect(fetchSaksromSummary).not.toHaveBeenCalled();
  });

  it("keeps technical metadata collapsed by default and reveals it on demand", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Kildebundet tekst."));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={99}
        documents={[doc("doc_partial", "Masterdoc_001.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(77, 78)}
      />
    );

    await screen.findByText("Kildebundet tekst.");
    expect(screen.queryByText("READY_PAGE_UNITS_ONLY")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vis tekniske detaljer/i }));
    expect(screen.getByText("READY_PAGE_UNITS_ONLY")).toBeInTheDocument();
    expect(screen.getByText(/doc_10243936_p0001_b0001/)).toBeInTheDocument();
  });

  it("collapses long finding lists behind Vis flere funn", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Kildebundet tekst.", 7));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={99}
        documents={[doc("doc_partial", "Masterdoc_001.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(77, 78)}
      />
    );

    await screen.findByText("Kildebundet tekst.");
    expect(screen.queryByText(/faktisk funn 7/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vis flere funn/i }));
    expect(screen.getByText(/faktisk funn 7/i)).toBeInTheDocument();
  });

  it("wires regenerate, source, missing-document, and copy actions", async () => {
    const user = userEvent.setup();
    const goToMissing = vi.fn();
    const jumpSpy = vi.spyOn(citationStore, "jumpToSource");
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Kildebundet tekst."));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={99}
        documents={[doc("doc_partial", "Masterdoc_001.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(77, 78)}
        onGoToMissingDocuments={goToMissing}
      />
    );

    await screen.findByText("Kildebundet tekst.");
    await user.click(screen.getByRole("button", { name: "Oppsummer saken på nytt" }));
    expect(fetchSaksromSummary).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Vis kildegrunnlag" }));
    expect(jumpSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));

    await user.click(screen.getByRole("button", { name: "Gå til manglende dokumenter" }));
    expect(goToMissing).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Kopier oppsummering" }));
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining("Kildebundet tekst."));
    expect(await screen.findByText("Oppsummeringen er kopiert.")).toBeInTheDocument();
  });

  it("opens source pills through CitationManager", async () => {
    const user = userEvent.setup();
    const jumpSpy = vi.spyOn(citationStore, "jumpToSource");
    vi.mocked(fetchSaksromSummary).mockResolvedValue(summary("Kildebundet tekst."));

    render(
      <SaksromCaseSummary
        caseId="case-1"
        tenantId="tenant-1"
        coverage={99}
        documents={[doc("doc_partial", "Masterdoc_001.pdf", "partial_source_ready")]}
        failedCount={0}
        pendingCount={0}
        sourceCoverage={coverage(77, 78)}
      />
    );

    const finding = await screen.findByText(/UTSKRIFT AV RETTSBOK viser/i);
    await user.click(within(finding.closest("li") as HTMLElement).getByRole("button", { name: /side 1/i }));
    expect(jumpSpy).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "10243936-021f-4464-a4a5-80a68a392f40",
      sourceUnitId: "doc_10243936_p0001_b0001",
      page: 1
    }));
  });
});
