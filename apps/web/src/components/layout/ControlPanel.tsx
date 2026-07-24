import type { WorkspaceView } from "../../navigation";
import type { EvidaDocument } from "../../lib/api";
import { getBestNextStep, getSourceBasisStats, sourceCoveragePercent } from "../../lib/bestNextStep";
import "./ControlPanel.css";

interface ControlPanelProps {
  activeCaseName: string | null;
  activeView: WorkspaceView;
  documents?: EvidaDocument[];
  queueBusy?: boolean;
  actionSubmitting?: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}

export function ControlPanel({
  activeCaseName,
  activeView,
  documents = [],
  queueBusy = false,
  actionSubmitting = false,
  onNavigate,
  onNewCase
}: ControlPanelProps) {
  const nextStep = getBestNextStep({
    activeCaseName,
    activeView,
    documents,
    queueState: { isBusy: queueBusy, total: 0, failed: 0 },
    actionSubmitting
  });
  const sourceStats = getSourceBasisStats(documents);
  const coverage = sourceCoveragePercent(sourceStats.readyPages, sourceStats.totalPages);
  const actionLabel = nextStep.kind === "create_case" ? "Opprett ny sak" : nextStep.label;

  const handlePrimaryAction = () => {
    if (nextStep.disabled) return;
    if (nextStep.kind === "create_case") {
      onNewCase();
      return;
    }
    if (nextStep.targetView) {
      onNavigate(nextStep.targetView);
      return;
    }
    if (nextStep.kind === "start_processing" || nextStep.kind === "inspect_error" || nextStep.kind === "focus_upload") {
      onNavigate("import");
    }
  };

  return (
    <aside className="legal-os-control-panel control-panel" aria-label="Kontrollpanel">
      <section className="control-panel-section next-step-module">
        <span className="control-kicker">Anbefalt neste steg</span>
        <h2>{nextStep.title}</h2>
        <div className="next-step-card">
          <p>{nextStep.body}</p>
          <button
            className="control-primary-action action-btn"
            disabled={nextStep.disabled}
            type="button"
            onClick={handlePrimaryAction}
          >
            {actionLabel}
          </button>
        </div>
      </section>

      {activeCaseName ? (
        <>
          <section className="control-panel-section risk-module">
            <span className="control-kicker">Risiko & varsler</span>
            <ul className="alert-list">
              {sourceStats.failedDocuments > 0 ? (
                <li className="alert-item red">{sourceStats.failedDocuments} dokument krever kontroll</li>
              ) : null}
              {sourceStats.failedPages > 0 && sourceStats.readyPages > 0 ? (
                <li className="alert-item yellow">{sourceStats.failedPages} sider mangler i foreløpig kildegrunnlag</li>
              ) : null}
              {sourceStats.failedDocuments === 0 && sourceStats.failedPages === 0 ? (
                <li className="alert-item green">Ingen kjente kildeblokker akkurat nå</li>
              ) : null}
            </ul>
          </section>

          <section className="control-panel-section">
            <span className="control-kicker">Kildegrunnlag</span>
            <dl className="source-metrics">
              <div>
                <dt>Kildedekning</dt>
                <dd>{coverage}%</dd>
              </div>
              <div>
                <dt>Klare sider</dt>
                <dd>{sourceStats.readyPages}</dd>
              </div>
              <div>
                <dt>Krever kontroll</dt>
                <dd>{sourceStats.failedPages + sourceStats.failedDocuments}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}

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
