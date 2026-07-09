import { useMemo, useState } from "react";
import "./Kronologi.css";

type TimelineStatus = "Faktum" | "Usikkert" | "Mangler kilde";

type TimelineEvent = {
  id: string;
  date: string;
  event: string;
  sourceId: string;
  source: string;
  excerpt: string;
  status: TimelineStatus;
};

const timelineEvents: TimelineEvent[] = [
  {
    id: "t1",
    date: "12.01.2026",
    event: "Kontraktsinngåelse",
    sourceId: "doc_001",
    source: "Signert_Avtale.pdf (s. 1)",
    excerpt: "Signert avtale viser dato og parter.",
    status: "Faktum"
  },
  {
    id: "t2",
    date: "15.02.2026",
    event: "Varsel om mislighold",
    sourceId: "doc_014",
    source: "Epost_Vedlegg_A.docx",
    excerpt: "E-post beskriver forsinkelse og varsler mislighold.",
    status: "Usikkert"
  },
  {
    id: "t3",
    date: "01.03.2026",
    event: "Tapspost krever dokumentasjon",
    sourceId: "doc_missing",
    source: "Kilde mangler",
    excerpt: "Beløp og årsakssammenheng må knyttes til et verifisert dokument.",
    status: "Mangler kilde"
  }
];

function statusClass(status: TimelineStatus) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function Kronologi() {
  const [activeSourceId, setActiveSourceId] = useState(timelineEvents[0].sourceId);
  const selectedEvent = useMemo(
    () => timelineEvents.find((event) => event.sourceId === activeSourceId) ?? timelineEvents[0],
    [activeSourceId]
  );

  return (
    <section className="kronologi-workspace" aria-labelledby="kronologi-title">
      <header className="kronologi-header">
        <div>
          <span className="kronologi-eyebrow">Analyse</span>
          <h2 id="kronologi-title">Kronologi</h2>
          <p>Kildebundet tidslinje for faktum, usikkerhet og manglende dokumentasjon.</p>
        </div>
        <div className="kronologi-summary liquid-glass-panel" aria-label="Kronologi status">
          <strong>{timelineEvents.length}</strong>
          <span>hendelser</span>
        </div>
      </header>

      <div className="kronologi-grid">
        <div className="timeline" aria-label="Sakstidslinje">
          {timelineEvents.map((item) => (
            <article className="timeline-item liquid-glass-panel" key={item.id}>
              <div className="timeline-date">{item.date}</div>
              <div className="timeline-content">
                <h3>{item.event}</h3>
                <p>{item.excerpt}</p>
                <button
                  className="source-link"
                  onClick={() => setActiveSourceId(item.sourceId)}
                  type="button"
                >
                  Kilde: {item.source}
                </button>
              </div>
              <span className={`timeline-status ${statusClass(item.status)}`}>{item.status}</span>
            </article>
          ))}
        </div>

        <aside className="source-preview liquid-glass-panel" aria-label="Valgt kilde">
          <span>Valgt kilde</span>
          <h3>{selectedEvent.source}</h3>
          <p>{selectedEvent.excerpt}</p>
          <small>{selectedEvent.sourceId}</small>
        </aside>
      </div>
    </section>
  );
}
