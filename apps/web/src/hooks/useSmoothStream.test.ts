import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSmoothStream } from "./useSmoothStream";

describe("useSmoothStream", () => {
  it("reveals text gradually rather than all at once", async () => {
    const target = "Dette er en kildebundet oppsummering av saken som strømmes jevnt.";
    const { result } = renderHook(() => useSmoothStream(target, true));

    // Immediately after the first paint the buffer should not be fully drained.
    expect(result.current.shown.length).toBeLessThan(target.length);

    // It should eventually reveal the whole thing.
    await waitFor(() => expect(result.current.shown).toBe(target));
  });

  it("keeps the cursor alive (waiting) when caught up while the stream is still active", async () => {
    const target = "Kort tekst.";
    const { result } = renderHook(() => useSmoothStream(target, true));
    await waitFor(() => expect(result.current.shown).toBe(target));
    expect(result.current.waiting).toBe(true);
    expect(result.current.streaming).toBe(true);
  });

  it("stops streaming once caught up and the stream is no longer active", async () => {
    const { result } = renderHook(() => useSmoothStream("Ferdig tekst.", false));
    await waitFor(() => expect(result.current.shown).toBe("Ferdig tekst."));
    expect(result.current.streaming).toBe(false);
    expect(result.current.waiting).toBe(false);
  });

  it("resets when the target is replaced by a non-extension (regenerate)", async () => {
    const { result, rerender } = renderHook(
      ({ text, active }: { text: string; active: boolean }) => useSmoothStream(text, active),
      { initialProps: { text: "Første generering ferdig.", active: false } }
    );
    await waitFor(() => expect(result.current.shown).toBe("Første generering ferdig."));

    act(() => {
      rerender({ text: "Helt ny generering.", active: true });
    });
    // After a reset the new text is revealed from the start, not spliced onto the old text.
    await waitFor(() => expect(result.current.shown).toBe("Helt ny generering."));
    expect(result.current.shown.startsWith("Første")).toBe(false);
  });
});
