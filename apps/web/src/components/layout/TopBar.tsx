import { CommandPalette } from "../CommandPalette";
import type { CommandPaletteAction } from "../CommandPalette";
import "./TopBar.css";

interface TopBarIdentity {
  name: string;
  tenantId: string;
  loading: boolean;
  authenticated: boolean;
}

interface TopBarProps {
  activeCaseName: string | null;
  actions: CommandPaletteAction[];
  identity: TopBarIdentity;
  lastAction: string;
  onLogin: () => void;
}

export function TopBar({ activeCaseName, actions, identity, lastAction, onLogin }: TopBarProps) {
  return (
    <header className="legal-os-topbar">
      <div className="top-bar-left">
        <img className="topbar-logo" src="/brand/logo.svg" alt="EVIDA" />
        <span className="topbar-live-status" aria-live="polite">
          {lastAction}
        </span>
      </div>

      <label className="search-bar">
        <span>Søk</span>
        <input readOnly type="text" placeholder="Søk i sak, dokumenter, bevis (Cmd+K)..." />
      </label>

      <div className="legal-os-tools top-bar-right">
        <div className="critical-alerts-chip" aria-label="Kritiske varsler">
          <span className="alert-badge warning">{activeCaseName ? "2 varsler" : "0 varsler"}</span>
        </div>
        <div className="identity-chip user-profile" aria-label="Aktiv identitet">
          <strong>{identity.loading ? "Validerer sesjon" : identity.name}</strong>
          <span>{identity.tenantId}</span>
        </div>
        {!identity.authenticated && !identity.loading ? (
          <button className="evida-button" onClick={onLogin} type="button">
            Dev-login
          </button>
        ) : null}
        <CommandPalette actions={actions} />
      </div>
    </header>
  );
}
