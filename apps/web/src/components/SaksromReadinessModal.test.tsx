import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaksromReadinessModal } from "./SaksromReadinessModal";

describe("SaksromReadinessModal", () => {
  it("shows live coverage counts instead of hardcoded zeroes", () => {
    render(
      <SaksromReadinessModal
        isOpen
        coverage={99}
        verifiedCount={77}
        pendingCount={0}
        failedCount={0}
        ocrWarningCount={1}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("99%")).toBeInTheDocument();
    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.getByText("OCR-varsel").closest(".metric-row")).toHaveTextContent("1");
  });
});
