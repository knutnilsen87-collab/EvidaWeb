import type { WorkspaceView } from "../../navigation";
import "./ControlPanel.css";

interface ControlPanelProps {
  activeCaseName: string | null;
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}

function getNextStep(activeCaseName: string | null, activeView: WorkspaceView) {
  if (!activeCaseName) {
    return {
      title: "Opprett første sak",
      body: "Initialiser sak før import, karantene og kildeverifisering.",
      label: "Opprett ny sak",
      view: null
    };
  }

  if (activeView === "import") {
    return {
      title: "Bygg kildegrunnlag",
      body: "Last opp dokumentene og send dem gjennom karantene-slusen.",
      label: "Gå til kontroll",
      view: "quarantine" as WorkspaceView
    };
  }

  if (activeView === "quarantine") {
    return {
      title: "Verifiser kilder",
      body: "Godkjenn kildeklare dokumenter før Saksrommet brukes aktivt.",
      label: "Åpne Saksrom",
      view: "saksrom" as WorkspaceView
    };
  }

  return {
    title: "Neste juridiske steg",
    body: "Koble manglende kilder til påstander før utkastet produseres.",
    label: "Åpne Bevismatrise",
    view: "evidence" as WorkspaceView
  };
}

export function ControlPanel({ activeCaseName, activeView, onNavigate, onNewCase }: ControlPanelProps) {
  const nextStep = getNextStep(activeCaseName, activeView);

  return (
    <aside className="legal-os-control-panel control-panel" aria-label="Kontrollpanel">
      <section className="control-panel-section next-step-module">
        <span className="control-kicker">Anbefalt neste steg</span>
        <h2>{nextStep.title}</h2>
        <div className="next-step-card">
          <p>{nextStep.body}</p>
          <button
            className="control-primary-action action-btn"
            type="button"
            onClick={() => (nextStep.view ? onNavigate(nextStep.view) : onNewCase())}
          >
            {nextStep.label}
          </button>
        </div>
      </section>

      <section className="control-panel-section risk-module">
        <span className="control-kicker">Risiko & varsler</span>
        <ul className="alert-list">
          <li className="alert-item red">Mangler kilde for 8 faktapåstander</li>
          <li className="alert-item yellow">3 dokumenter har dårlig OCR</li>
        </ul>
      </section>

      <section className="control-panel-section">
        <span className="control-kicker">Kildegrunnlag</span>
        <dl className="source-metrics">
          <div>
            <dt>Kildedekning</dt>
            <dd>{activeCaseName ? "97%" : "0%"}</dd>
          </div>
          <div>
            <dt>Karantene</dt>
            <dd>{activeCaseName ? "12" : "0"}</dd>
          </div>
          <div>
            <dt>Risikohull</dt>
            <dd>{activeCaseName ? "3" : "0"}</dd>
          </div>
        </dl>
      </section>

      <section className="control-panel-section assistant-module">
        <span className="control-kicker">Saksassistent</span>
        <div className="reasoning-modes" aria-label="Tilgjengelige reasoning-moduser">
          <span>Spørre</span>
          <span>Argumentere</span>
          <span>Simulere</span>
        </div>
        <div className="chat-history" aria-label="Saksassistent historikk">
          <p>Alle svar skal være kildebundet og kunne hoppe direkte til dokumentvisning.</p>
        </div>
        <div className="sticky-input-zone">
          <textarea placeholder="Spør om sak, kilder eller risiko..." />
        </div>
      </section>
    </aside>
  );
}
