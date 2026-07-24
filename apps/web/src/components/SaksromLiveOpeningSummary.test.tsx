import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaksromSummary } from "../lib/api";
import { fetchSaksromSummary } from "../lib/api";
import { citationStore } from "../lib/CitationManager";
import { SaksromLiveOpeningSummary } from "./SaksromLiveOpeningSummary";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    fetchSaksromSummary: vi.fn()
  };
});

const fetchSaksromSummaryMock = vi.mocked(fetchSaksromSummary);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function coverage(overrides = {}) {
  return {
    totalDocuments: 1,
    sourceReadyDocuments: 0,
    partialDocuments: 1,
    failedDocuments: 0,
    totalPages: 78,
    readyPages: 77,
    ocrReadyPages: 5,
    textReadyPages: 72,
    missingOcrPages: 1,
    belowThresholdPages: 0,
    failedPages: 0,
    coveragePercent: 98,
    missingOcrPageRanges: "75",
    belowThresholdPageRanges: "",
    documentCoverage: [],
    ...overrides
  };
}

function summary(overrides: Partial<SaksromSummary> = {}): SaksromSummary {
  return {
    caseId: "case_123",
    title: "Kort sakstype/tema",
    summary: "Saken gjelder en klage med dokumentert tidslinje.",
    findings: [
      {
        heading: "Viktigste faktum",
        text: "Vedtaket er omtalt i tilgjengelige kilder.",
        sources: [{
          documentId: "doc_1",
          sourceUnitId: "unit_1",
          pageNumber: 2,
          quote: "Vedtaket ble meddelt parten samme dag."
        }]
      }
    ],
    sources: [{
      documentId: "doc_1",
      sourceUnitId: "unit_1",
      pageNumber: 2,
      quote: "Vedtaket ble meddelt parten samme dag."
    }],
    sourceBound: true,
    warnings: ["PARTIAL_SOURCE_COVERAGE"],
    coverage: coverage(),
    ...overrides
  };
}

describe("SaksromLiveOpeningSummary", () => {
  beforeEach(() => {
    fetchSaksromSummaryMock.mockReset();
  });

  it("calls POST summary endpoint and shows progressive steps before backend resolves", async () => {
    const request = deferred<SaksromSummary>();
    fetchSaksromSummaryMock.mockReturnValue(request.promise);

    render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage()}
      />
    );

    expect(screen.getByText("Jeg går gjennom dokumentgrunnlaget nå.")).toBeInTheDocument();
    expect(screen.getByText("EVIDA åpner saken ...")).toBeInTheDocument();
    expect(screen.getByText("Leser dokumentgrunnlaget ...")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchSaksromSummaryMock).toHaveBeenCalledWith("tenant_123", {
        caseId: "case_123",
        includePartial: true,
        sourceBasis: "READY_PAGE_UNITS_ONLY"
      })
    );
  });

  it("renders structured first understanding with source popovers and existing citation navigation", async () => {
    const user = userEvent.setup();
    const jumpToSource = vi.spyOn(citationStore, "jumpToSource");
    fetchSaksromSummaryMock.mockResolvedValue(summary());

    render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        documents={[{
          id: "doc_1",
          filename: "Vedtak og korrespondanse.pdf",
          status: "partial_source_ready",
          pages: 2,
          ocrRequired: false
        }]}
        sourceCoverage={coverage()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Første saksforståelse" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Hva saken gjelder" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Viktige kontraktspunkter" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mulige tvistetemaer" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Kildegrunnlag" })).toBeInTheDocument();
    expect(await screen.findByText(/Viktigste faktum/)).toBeInTheDocument();
    const claimSource = screen.getByRole("button", { name: /Åpne kilde Side 2 doc_1 for funn 1/i });
    await user.hover(claimSource);
    expect(screen.getAllByText("Vedtak og korrespondanse.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vedtaket ble meddelt parten samme dag.").length).toBeGreaterThan(0);
    await user.click(claimSource);
    expect(jumpToSource).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_1",
      sourceUnitId: "unit_1",
      page: 2
    }));
  });

  it("does not restart the opening summary when coverage polling refreshes the same case", async () => {
    fetchSaksromSummaryMock.mockResolvedValue(summary());

    const { rerender } = render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Første saksforståelse" })).toBeInTheDocument();

    rerender(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage({ coveragePercent: 99 })}
      />
    );

    expect(fetchSaksromSummaryMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Første saksforståelse" })).toBeInTheDocument();
  });

  it("shows calm partial warnings", async () => {
    fetchSaksromSummaryMock.mockResolvedValue(summary());

    render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage()}
      />
    );

    expect(await screen.findByText("Foreløpig kildegrunnlag.")).toBeInTheDocument();
    expect(screen.getByText("Noen OCR-sider mangler og er ikke brukt som kilder.")).toBeInTheDocument();
  });

  it("shows retry state on failure", async () => {
    const user = userEvent.setup();
    fetchSaksromSummaryMock.mockRejectedValueOnce(new Error("offline"));
    fetchSaksromSummaryMock.mockResolvedValueOnce(summary());

    render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage()}
      />
    );

    expect(await screen.findByText("EVIDA klarte ikke å lage første saksoppsummering akkurat nå.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prøv igjen" }));

    expect(await screen.findByRole("heading", { name: "Første saksforståelse" })).toBeInTheDocument();
    expect(fetchSaksromSummaryMock).toHaveBeenCalledTimes(2);
  });
});
