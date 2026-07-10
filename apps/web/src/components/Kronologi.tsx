import { useMemo, useState } from "react";
import { citationStore } from "../lib/CitationManager";
import "./Kronologi.css";

type TimelineStatus = "Faktum" | "Usikkert" | "Mangler kilde";

type TimelineEvent = {
  id: string;
  date: string;
  event: string;
  sourceId: string;
  sourceUnitId: string;
  source: string;
  excerpt: string;
  page: number;
  status: TimelineStatus;
};

const timelineEvents: TimelineEvent[] = [
  {
    id: "t1",
    date: "12.01.2026",
    event: "Kontraktsinngaaelse",
    sourceId: "doc_001",
    sourceUnitId: "doc_001_p1",
    source: "Signert_Avtale.pdf (s. 1)",
    excerpt: "Signert avtale viser dato og parter.",
    page: 1,
    status: "Faktum"
  },
  {
    id: "t2",
    date: "15.02.2026",
    event: "Varsel om mislighold",
    sourceId: "doc_014",
    sourceUnitId: "doc_014_p2",
    source: "Epost_Vedlegg_A.docx",
    excerpt: "E-post beskriver forsinkelse og varsler mislighold.",
    page: 2,
    status: "Usikkert"
  },
  {
    id: "t3",
    date: "01.03.2026",
    event: "Tapspost krever dokumentasjon",
    sourceId: "doc_missing",
    sourceUnitId: "doc_missing_p0",
    source: "Kilde mangler",
    excerpt: "Belop og aarsakssammenheng maa knyttes til et verifisert dokument.",
    page: 0,
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

  function selectSource(item: TimelineEvent) {
    setActiveSourceId(item.sourceId);
    if (item.status === "Mangler kilde") {
      return;
    }
    citationStore.jumpToSource({
      documentId: item.sourceId,
      sourceUnitId: item.sourceUnitId,
      page: item.page,
      paragraph: "timeline",
      rect: { top: 120, left: 48, width: 360, height: 42 }
    });
  }

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
                  onClick={() => selectSource(item)}
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
