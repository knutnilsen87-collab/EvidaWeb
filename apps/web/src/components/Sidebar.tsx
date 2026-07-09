import { navigationGroups, WorkspaceView } from "../navigation";
import "./Sidebar.css";

interface SidebarProps {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}

export function Sidebar({ activeView, onNavigate, onNewCase }: SidebarProps) {
  return (
    <aside className="sidebar liquid-glass-panel" aria-label="Arbeidsrom">
      <div className="logo-container">
        <img className="sidebar-logo" src="/brand/logo.svg" alt="EVIDA" />
      </div>

      <nav className="sidebar-nav">
        {navigationGroups.map((group) => (
          <section className="nav-group" key={group.title}>
            <h2 className="group-title">{group.title}</h2>
            {group.title === "Arbeid" ? (
              <button className="new-case-btn" onClick={onNewCase} type="button">
                <span aria-hidden="true">+</span>
                Opprett ny sak
              </button>
            ) : null}
            {group.items.map((item) => (
              <button
                className={`nav-item ${activeView === item.view ? "active" : ""}`}
                aria-current={activeView === item.view ? "page" : undefined}
                key={item.view}
                onClick={() => onNavigate(item.view)}
                type="button"
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </button>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}
