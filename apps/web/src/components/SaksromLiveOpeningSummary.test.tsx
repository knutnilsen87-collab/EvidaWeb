import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaksromSummary } from "../lib/api";
import { fetchSaksromSummary } from "../lib/api";
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
        sources: [{ documentId: "doc_1", sourceUnitId: "unit_1", pageNumber: 2 }]
      }
    ],
    sources: [{ documentId: "doc_1", sourceUnitId: "unit_1", pageNumber: 2 }],
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

  it("renders source chips from backend response", async () => {
    fetchSaksromSummaryMock.mockResolvedValue(summary());

    render(
      <SaksromLiveOpeningSummary
        caseId="case_123"
        tenantId="tenant_123"
        sourceCoverage={coverage()}
      />
    );

    expect(await screen.findByText("Her er første saksforståelse basert på tilgjengelige kilder:")).toBeInTheDocument();
    expect(await screen.findByText("Viktigste faktum")).toBeInTheDocument();
    expect(await screen.findAllByText("Side 2")).toHaveLength(2);
    expect(screen.getAllByText("s. 2").length).toBeGreaterThan(0);
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

    expect(await screen.findByText("Her er første saksforståelse basert på tilgjengelige kilder:")).toBeInTheDocument();
    expect(fetchSaksromSummaryMock).toHaveBeenCalledTimes(2);
  });
});
