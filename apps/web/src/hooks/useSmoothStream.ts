import { useEffect, useRef, useState } from "react";
import { revealRateForBacklog } from "../lib/streamingConfig";

export interface SmoothStreamState {
  /** The portion of the target text that should currently be visible. */
  shown: string;
  /** True while text is still being revealed OR the stream is still producing. Drives the cursor. */
  streaming: boolean;
  /** True when we've caught up to everything received but the stream is still open (network pause). */
  waiting: boolean;
}

/**
 * Local smoothing queue for Claude-style streaming.
 *
 * Instead of rendering raw stream deltas (which arrive in bursts and look jerky), we treat the
 * accumulated `target` text as a buffer and reveal it at a steady, readable cadence driven by
 * {@link revealRateForBacklog}. If the buffer backs up (backend faster than the display) the reveal
 * rate ramps up smoothly rather than jumping to "show everything". If the buffer drains and the
 * stream stalls, we simply stop advancing and let the caller pulse a cursor — no visible stutter.
 *
 * @param target the full text received so far (grows as tokens arrive; resets to "" on regenerate)
 * @param active whether the underlying stream is still producing tokens
 */
export function useSmoothStream(target: string, active: boolean): SmoothStreamState {
  const [shownLength, setShownLength] = useState(0);

  const targetRef = useRef(target);
  const activeRef = useRef(active);
  const shownRef = useRef(0);
  const prevTargetRef = useRef("");

  targetRef.current = target;
  activeRef.current = active;

  // Reset when a new/replaced stream starts (target is no longer an extension of what we've shown).
  useEffect(() => {
    if (!target.startsWith(prevTargetRef.current)) {
      shownRef.current = 0;
      setShownLength(0);
    } else if (shownRef.current > target.length) {
      shownRef.current = target.length;
      setShownLength(target.length);
    }
    prevTargetRef.current = target;
  }, [target]);

  // The reveal pump. Restarts whenever target/active change; self-stops once fully settled.
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;

    const tick = (timestamp: number) => {
      if (last === null) {
        last = timestamp;
      }
      // Clamp dt so a backgrounded tab doesn't dump the whole buffer at once on return.
      const dt = Math.min((timestamp - last) / 1000, 0.1);
      last = timestamp;

      const currentTarget = targetRef.current;
      const isActive = activeRef.current;
      const shown = shownRef.current;
      const backlog = currentTarget.length - shown;

      if (backlog > 0) {
        const rate = revealRateForBacklog(backlog);
        const advance = Math.max(1, Math.round(rate * dt));
        const next = Math.min(currentTarget.length, shown + advance);
        shownRef.current = next;
        setShownLength(next);
        raf = requestAnimationFrame(tick);
      } else if (isActive) {
        // Caught up, but the stream is still open — keep polling so new tokens reveal promptly.
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0; // settled and stream finished; stop the loop
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [target, active]);

  const shown = target.slice(0, shownLength);
  const caughtUp = shownLength >= target.length;

  return {
    shown,
    streaming: active || !caughtUp,
    waiting: active && caughtUp
  };
}
