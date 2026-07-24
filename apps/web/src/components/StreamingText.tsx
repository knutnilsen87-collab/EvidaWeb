import { STREAMING_CONFIG } from "../lib/streamingConfig";
import { useSmoothStream } from "../hooks/useSmoothStream";
import "./StreamingText.css";

interface StreamingTextProps {
  /** Full text received so far. Grows as tokens arrive; may be replaced on regenerate. */
  text: string;
  /** Whether the underlying stream is still producing. When false, the full text shows immediately. */
  streaming: boolean;
  /** Inline error message shown without discarding already-revealed text. */
  error?: string | null;
  /** Retry handler; renders a "Prøv igjen" button next to the error when provided. */
  onRetry?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Renders AI-generated text with Claude-style smooth streaming: a steady reveal cadence, a pulsing
 * cursor while generating or waiting for the next token, and inline error recovery that keeps
 * whatever was already shown. This is the shared primitive for every streamed AI response.
 */
export function StreamingText({
  text,
  streaming,
  error,
  onRetry,
  className,
  ariaLabel
}: StreamingTextProps) {
  const smooth = useSmoothStream(text, streaming);
  // When the stream has finished, reveal the full text synchronously (no dependence on animation
  // frames) so completed content is always fully present.
  const shown = streaming ? smooth.shown : text;
  const showCursor = streaming && smooth.streaming;

  return (
    <span
      className={`streaming-text${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      aria-busy={streaming}
    >
      <span className="streaming-text__content">{shown}</span>
      {showCursor ? (
        <span
          className={`streaming-text__cursor${smooth.waiting ? " is-waiting" : ""}`}
          style={{ animationDuration: `${STREAMING_CONFIG.cursorBlinkMs}ms` }}
          aria-hidden="true"
        />
      ) : null}
      {error ? (
        <span className="streaming-text__error" role="alert">
          <span className="streaming-text__error-message">{error}</span>
          {onRetry ? (
            <button type="button" className="streaming-text__retry" onClick={onRetry}>
              Prøv igjen
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

export default StreamingText;
