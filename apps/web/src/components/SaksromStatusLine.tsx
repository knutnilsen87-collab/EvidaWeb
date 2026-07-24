import "./SaksromStatusLine.css";

interface SaksromStatusLineProps {
  primary: string;
  secondary?: string | null;
  tone: "ready" | "preliminary" | "processing";
}

const indicators = {
  ready: "✓",
  preliminary: "!",
  processing: "…"
} as const;

export function SaksromStatusLine({ primary, secondary, tone }: SaksromStatusLineProps) {
  return (
    <div className={`saksrom-status-line saksrom-status-line--${tone}`} role="status">
      <span className="saksrom-status-line__indicator" aria-hidden="true">
        {indicators[tone]}
      </span>
      <span className="saksrom-status-line__copy">
        <span>{primary}</span>
        {secondary ? <small>{secondary}</small> : null}
      </span>
    </div>
  );
}
