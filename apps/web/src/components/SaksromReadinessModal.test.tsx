import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SourceCoverage } from "../lib/api";
import { SaksromReadinessModal } from "./SaksromReadinessModal";

function coverage(overrides: Partial<SourceCoverage> = {}): SourceCoverage {
  return {
    totalDocuments: 1,
    sourceReadyDocuments: 0,
    partialDocuments: 1,
    failedDocuments: 0,
    totalPages: 78,
    readyPages: 77,
    ocrReadyPages: 0,
    textReadyPages: 77,
    missingOcrPages: 0,
    belowThresholdPages: 1,
    failedPages: 0,
    coveragePercent: 99,
    missingOcrPageRanges: "",
    belowThresholdPageRanges: "75",
    documentCoverage: [],
    ...overrides
  };
}

describe("SaksromReadinessModal", () => {
  it("renders consequence-based live coverage without acknowledgement checkbox", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onInspectMissing = vi.fn();

    render(
      <SaksromReadinessModal
        isOpen
        coverage={99}
        verifiedCount={77}
        pendingCount={0}
        failedCount={0}
        ocrWarningCount={1}
        sourceCoverage={coverage()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onInspectMissing={onInspectMissing}
      />
    );

    expect(screen.getByRole("heading", { name: "Kompletthetskontroll" })).toBeInTheDocument();
    expect(screen.getByText("Kildegrunnlaget er foreløpig")).toBeInTheDocument();
    expect(screen.getByText(/77 av 78 sider er klare/i)).toBeInTheDocument();
    expect(screen.getByText(/Side 75 har for lite lesbar tekst/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Kontroller manglende sider" }));
    expect(onInspectMissing).toHaveBeenCalledTimes(1);
  });

  it("shows a compact passed checklist for complete coverage", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SaksromReadinessModal
        isOpen
        coverage={100}
        verifiedCount={78}
        pendingCount={0}
        failedCount={0}
        sourceCoverage={coverage({
          readyPages: 78,
          sourceReadyDocuments: 1,
          partialDocuments: 0,
          missingOcrPages: 0,
          belowThresholdPages: 0,
          coveragePercent: 100,
          missingOcrPageRanges: "",
          belowThresholdPageRanges: ""
        })}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Kontrollen er bestått")).toBeInTheDocument();
    expect(screen.getByText("Ingen hull i behandlet kildegrunnlag")).toBeInTheDocument();
    expect(screen.getByText("Ingen avviste registrerte dokumenter")).toBeInTheDocument();
    expect(screen.getByText("Alle registrerte dokumenter kontrollert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kontroller manglende sider" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
