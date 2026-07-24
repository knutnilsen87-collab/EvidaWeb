import { navigationGroups, WorkspaceView } from "../navigation";
import type { EvidaDocument } from "../lib/api";
import { getSourceBasisStats, sourceCoveragePercent } from "../lib/bestNextStep";
import "./Sidebar.css";

interface SidebarProps {
  activeCaseName?: string | null;
  activeView: WorkspaceView;
  collapsed?: boolean;
  documents?: EvidaDocument[];
  hasActiveCase?: boolean;
  hasReadySourceBasis?: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
  onToggleFocus?: () => void;
}

const navigationIcons: Partial<Record<WorkspaceView, string>> = {
  import: "▣",
  quarantine: "✓",
  saksrom: "§",
  chronology: "↗",
  evidence: "≡",
  risk: "!",
  arguments: "¶",
  draft: "✎",
  export: "⇩"
};

function lockedReason(view: WorkspaceView, hasActiveCase: boolean, hasReadySourceBasis: boolean) {
  if (!hasActiveCase) {
    if (view === "import" || view === "quarantine") {
      return null;
    }
    return "Opprett sak og last opp kilder for å åpne dette arbeidsrommet.";
  }

  if (!hasReadySourceBasis) {
    if (view === "import" || view === "quarantine") {
      return null;
    }
    if (view === "saksrom") {
      return "Last opp kilder for å åpne Saksrommet.";
    }
    return "Last opp kilder før analyse og leveranse åpnes.";
  }

  return null;
}

export function Sidebar({
  activeCaseName,
  activeView,
  collapsed = false,
  documents = [],
  hasActiveCase = true,
  hasReadySourceBasis = true,
  onNavigate,
  onNewCase,
  onToggleFocus
}: SidebarProps) {
  const sourceStats = getSourceBasisStats(documents);
  const coverage = sourceCoveragePercent(sourceStats.readyPages, sourceStats.totalPages);

  return (
    <aside
      className={`sidebar liquid-glass-panel ${collapsed ? "sidebar--collapsed" : ""}`}
      aria-label="Arbeidsrom"
    >
      <div className="logo-container">
        <img className="sidebar-logo" src="/brand/logo.svg" alt="EVIDA" />
      </div>

      <button
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Avslutt fokusmodus og åpne sidemenyen" : "Aktiver fokusmodus og skjul sidemenytekst"}
        className="sidebar-focus-toggle"
        onClick={onToggleFocus}
        title={collapsed ? "Avslutt fokusmodus" : "Fokusmodus"}
        type="button"
      >
        <span aria-hidden="true">⛶</span>
        <span className="sidebar-focus-toggle__label">{collapsed ? "Avslutt fokus" : "Fokus"}</span>
      </button>

      {activeCaseName ? (
        <section className="sidebar-active-case" aria-label="Aktiv sak" title={activeCaseName}>
          <span className="sidebar-active-case__compact" aria-hidden="true">A</span>
          <div className="sidebar-active-case__chips">
            <span>Pilot</span>
            <span>Testdata only</span>
          </div>
          <small>Aktiv sak</small>
          <strong>{activeCaseName}</strong>
          <dl>
            <div>
              <dt>Klare sider</dt>
              <dd>{sourceStats.readyPages}</dd>
            </div>
            <div>
              <dt>Kildegrunnlag</dt>
              <dd>{coverage}%</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <nav className="sidebar-nav">
        {navigationGroups.map((group) => (
          <section className="nav-group" key={group.title}>
            <h2 className="group-title sidebar-section-title">{group.title}</h2>
            {group.title === "Kilder" ? (
              <button className="new-case-btn" onClick={onNewCase} type="button">
                <span aria-hidden="true">+</span>
                <span className="new-case-btn__label">Opprett ny sak</span>
              </button>
            ) : null}
            {group.items.map((item) => {
              const reason = lockedReason(item.view, hasActiveCase, hasReadySourceBasis);
              const isLocked = Boolean(reason);
              return (
                <button
                  className={`nav-item sidebar-nav-item ${activeView === item.view ? "active" : ""} ${isLocked ? "nav-item--locked" : ""}`}
                  aria-current={activeView === item.view ? "page" : undefined}
                  aria-describedby={isLocked ? `${item.view}-locked-help` : undefined}
                  aria-disabled={isLocked}
                  key={item.view}
                  onClick={() => {
                    if (!isLocked) {
                      onNavigate(item.view);
                    }
                  }}
                  title={reason ?? item.description}
                  type="button"
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">
                    {navigationIcons[item.view] ?? item.label.slice(0, 1)}
                  </span>
                  <span className="sidebar-nav-item-title">
                    {item.label}
                  </span>
                  {isLocked ? <span className="nav-lock-icon" aria-hidden="true">Låst</span> : null}
                  <small className="sidebar-nav-item-description" id={isLocked ? `${item.view}-locked-help` : undefined}>
                    {isLocked ? reason : item.description}
                  </small>
                </button>
              );
            })}
          </section>
        ))}
      </nav>
    </aside>
  );
}
