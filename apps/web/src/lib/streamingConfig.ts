/**
 * Central configuration for Claude-style AI response streaming.
 *
 * This is the single source of truth for perceived reading speed. Adjust it here and every
 * AI-generated response in the app (summaries, chat answers, analysis) inherits the change — the
 * cadence is never hard-coded per feature.
 *
 * Perceived speed is deliberately paced on the client with a local smoothing queue so text reveals
 * at a steady, readable rate regardless of how bursty the backend / network delivery is.
 */
export const STREAMING_CONFIG = {
  /** Target perceived reading speed. Kept inside the product's 20–40 tokens/second band. */
  tokensPerSecond: 32,

  /** Floor the adaptive drain never goes below. */
  minTokensPerSecond: 20,

  /**
   * Adaptive ceiling. When the buffer backs up (backend faster than the display), the drain rate
   * ramps up toward this instead of jumping straight to "show everything" — so text never visibly
   * springs forward in a block.
   */
  maxTokensPerSecond: 90,

  /** Average characters per token; converts the tokens/second target into a character reveal rate. */
  averageTokenChars: 5.5,

  /**
   * Buffer size, in characters, at which the drain rate starts ramping up. Below this the rate stays
   * at the calm target; above it the rate scales with backlog.
   */
  catchUpThresholdChars: 220,

  /** Time-to-first-token grace. Past this with an empty buffer, the cursor is treated as "waiting". */
  firstTokenGraceMs: 500,

  /** Cursor blink cadence while generating or waiting for the next token (ms). */
  cursorBlinkMs: 900
} as const;

/** Calm baseline reveal rate in characters/second. */
export const TARGET_CHARS_PER_SECOND = STREAMING_CONFIG.tokensPerSecond * STREAMING_CONFIG.averageTokenChars;

/** Absolute ceiling reveal rate in characters/second when catching up on a backlog. */
export const MAX_CHARS_PER_SECOND = STREAMING_CONFIG.maxTokensPerSecond * STREAMING_CONFIG.averageTokenChars;

/**
 * Compute the current reveal rate (chars/second) given how many characters are still buffered.
 * Stays at the calm target for small buffers and ramps smoothly toward the ceiling as the backlog
 * grows past {@link STREAMING_CONFIG.catchUpThresholdChars}, so the reader never sees a sudden jump.
 */
export function revealRateForBacklog(backlogChars: number): number {
  if (backlogChars <= STREAMING_CONFIG.catchUpThresholdChars) {
    return TARGET_CHARS_PER_SECOND;
  }
  const overflow = backlogChars - STREAMING_CONFIG.catchUpThresholdChars;
  const ramp = overflow / STREAMING_CONFIG.catchUpThresholdChars; // 1.0 per threshold of extra backlog
  const rate = TARGET_CHARS_PER_SECOND * (1 + ramp);
  return Math.min(rate, MAX_CHARS_PER_SECOND);
}
