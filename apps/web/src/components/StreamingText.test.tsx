import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StreamingText } from "./StreamingText";

describe("StreamingText", () => {
  it("shows the full text immediately when the stream is finished", () => {
    const { container } = render(<StreamingText text="Ferdig oppsummering." streaming={false} />);
    expect(screen.getByText("Ferdig oppsummering.")).toBeInTheDocument();
    expect(container.querySelector(".streaming-text__cursor")).toBeNull();
  });

  it("renders a pulsing cursor while streaming and reveals the text", async () => {
    const { container } = render(<StreamingText text="Strømmer inn tekst nå." streaming />);
    expect(container.querySelector(".streaming-text__cursor")).not.toBeNull();
    await waitFor(() => expect(screen.getByText("Strømmer inn tekst nå.")).toBeInTheDocument());
  });

  it("keeps already-shown text and offers retry on error", async () => {
    const onRetry = vi.fn();
    render(
      <StreamingText
        text="Delvis generert innhold."
        streaming={false}
        error="Strømmen ble avbrutt."
        onRetry={onRetry}
      />
    );

    expect(screen.getByText("Delvis generert innhold.")).toBeInTheDocument();
    expect(screen.getByText("Strømmen ble avbrutt.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
