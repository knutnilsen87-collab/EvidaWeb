import { motion, useReducedMotion } from "framer-motion";
import "./Dashboard.css";

interface DashboardProps {
  activeCaseName: string | null;
  onNewCase: () => void;
  onOpenWizard: () => void;
  onNavigate: (view: "saksrom" | "chronology" | "evidence" | "arguments" | "risk" | "quarantine") => void;
}

export function Dashboard({ activeCaseName, onNewCase, onOpenWizard, onNavigate }: DashboardProps) {
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
            Juridisk analyse, forenklet.
          </h1>

          <div className="command-portal-grid" aria-label="Hurtigvalg for ny arbeidsflyt">
            <button className="large-action-btn" type="button" onClick={onNewCase}>
              Opprett sak manuelt
            </button>
            <button className="large-action-btn" type="button" onClick={onOpenWizard}>
              Hurtiganalyse av dokument
            </button>
            <button className="large-action-btn" type="button" onClick={onNewCase}>
              Fortsett eksisterende sak
            </button>
            <button className="large-action-btn primary-wizard" type="button" onClick={onOpenWizard}>
              Jeg vet ikke hvor jeg skal starte
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
