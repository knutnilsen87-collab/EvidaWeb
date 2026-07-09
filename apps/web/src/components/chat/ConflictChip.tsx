import { Citation, citationStore } from "../../lib/CitationManager";
import { CitationChip } from "./CitationChip";
import "./ConflictChip.css";

interface ConflictChipProps {
  left: Citation;
  leftLabel: string;
  right: Citation;
  rightLabel: string;
  summary: string;
}

export function ConflictChip({ left, leftLabel, right, rightLabel, summary }: ConflictChipProps) {
  return (
    <div className="conflict-chip-container" role="group" aria-label="Motstridende kilder">
      <div className="conflict-header">
        <span>Motstrid oppdaget</span>
        <small>{summary}</small>
      </div>

      <div className="conflict-grid">
        <CitationChip ariaContext="sammenligning" citation={left} label={leftLabel} />
        <span className="vs-text">vs</span>
        <CitationChip ariaContext="sammenligning" citation={right} label={rightLabel} />
      </div>

      <button
        className="compare-btn"
        onClick={() => citationStore.compareSources({ left, right, summary })}
        type="button"
      >
        Sammenlign tekster
      </button>
    </div>
  );
}
