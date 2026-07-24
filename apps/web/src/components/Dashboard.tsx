import { motion, useReducedMotion } from "framer-motion";
import "./Dashboard.css";

interface DashboardProps {
  activeCaseName: string | null;
  onNewCase: () => void;
  onOpenWizard: () => void;
  onNavigate: (view: "saksrom" | "chronology" | "evidence" | "arguments" | "risk" | "quarantine") => void;
}

export function Dashboard({ activeCaseName, onNewCase, onNavigate }: DashboardProps) {
  const prefersReducedMotion = useReducedMotion();
  const criticalAlerts = [
    "Mangler kilde for 3 påstander i bevismatrisen.",
    "OCR-usikkerhet i 6 sider fra skannet vedlegg.",
    "Karantene-slusen inneholder dokumenter som venter på kildeverifisering."
  ];

  if (!activeCaseName) {
    return (
      <section className="dashboard-portal-container" aria-labelledby="dashboard-title">
        <img className="portal-watermark" src="/brand/lady-justice-watermark.svg" alt="" aria-hidden="true" />
        <div className="portal-content">
          <span className="portal-kicker">EVIDA // Command Portal</span>
          <h1 className="portal-title serif-title" id="dashboard-title">
            Bygg en kildebundet oversikt over saken
          </h1>
          <p className="portal-supporting-text">
            Last opp dokumentene. EVIDA viser hvilke kilder som kan brukes, hva som mangler, og hvor hvert funn kommer fra.
          </p>

          <div className="command-portal-grid command-portal-grid--single" aria-label="Anbefalt start">
            <button className="large-action-btn primary-wizard" type="button" onClick={onNewCase}>
              Opprett sak og last opp dokumenter
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-control-room control-room-dashboard" aria-labelledby="dashboard-title">
      <header className="case-command-card">
        <div>
          <div className="breadcrumb">EVIDA / Operativt kontrollrom</div>
          <div className="case-anchor__line">
            <h1 id="dashboard-title">{activeCaseName}</h1>
            <div className="status-badge">Dokumentanalyse pågår</div>
          </div>
          <p>Frist: 14. august · Saksansvarlig: Advokat Hansen</p>
        </div>
        <dl className="pulse-cards-grid case-command-metrics" aria-label="Saksstatus">
          <div>
            <dt>Dokumentdekning</dt>
            <dd>97%</dd>
            <span className="card-status green">Analysert</span>
          </div>
          <div>
            <dt>Kildebrudd</dt>
            <dd>12</dd>
            <span className="card-status red">Kritisk sjekk kreves</span>
          </div>
          <div>
            <dt>Kommende frist</dt>
            <dd>14.08.2026</dd>
            <span className="card-status yellow">Ikke verifisert</span>
          </div>
        </dl>
      </header>

      <div className="control-room-grid">
        <section className="critical-alerts" aria-labelledby="critical-alerts-title">
          <span className="control-room-kicker">Kritiske varsler</span>
          <h2 id="critical-alerts-title">Det som må avklares før analyse</h2>
          <ul>
            {criticalAlerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        </section>

        <motion.section
          aria-label="Anbefalt neste handling"
          className="action-engine"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: "easeOut" }}
        >
          <span className="control-room-kicker">Action Engine</span>
          <h2>Verifiser kildegrunnlaget</h2>
          <p className="sub-headline">Du har 12 dokumenter som krever din verifisering.</p>
          <button className="cta-button" type="button" onClick={() => onNavigate("quarantine")}>
            Gå til Karantene-slusen
          </button>
        </motion.section>

        <section className="source-integrity" aria-labelledby="source-integrity-title">
          <span className="control-room-kicker">Source Integrity</span>
          <h2 id="source-integrity-title">Kildebrudd og analyseberedskap</h2>
          <div className="integrity-list">
            <div>
              <strong>Kronologi</strong>
              <span>80% strukturert</span>
            </div>
            <div>
              <strong>Bevismatrise</strong>
              <span>3 påstander mangler kilde</span>
            </div>
            <div>
              <strong>Saksrom</strong>
              <span>Foreløpig åpnet med sporbare kilder</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
