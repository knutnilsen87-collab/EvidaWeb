import { useCallback, useState, type ReactNode } from "react";
import { useCourtEngine } from "../../hooks/useCourtEngine";
import type { AnalysisStatus, CourtEngineMessage } from "../../engine/types";
import { ChatArea } from "../chat/ChatArea";
import { StickyChatBar } from "../chat/StickyChatBar";
import { Sidebar } from "../Sidebar";
import { ControlPanel } from "./ControlPanel";
import { TopBar } from "./TopBar";
import type { CommandPaletteAction } from "../CommandPalette";
import type { WorkspaceView } from "../../navigation";
import "./AppShell.css";

interface AppShellIdentity {
  name: string;
  tenantId: string;
  loading: boolean;
  authenticated: boolean;
}

interface AppShellProps {
  activeCaseName: string | null;
  activeView: WorkspaceView;
  actions: CommandPaletteAction[];
  children: ReactNode;
  courtEngine?: {
    analysisStatus: AnalysisStatus;
    caseId: string | null;
    tenantId?: string;
  };
  identity: AppShellIdentity;
  lastAction: string;
  onLogin: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}

export function AppShell({
  activeCaseName,
  activeView,
  actions,
  children,
  courtEngine,
  identity,
  lastAction,
  onLogin,
  onNavigate,
  onNewCase
}: AppShellProps) {
  const [courtMessages, setCourtMessages] = useState<CourtEngineMessage[]>([]);
  const addCourtMessage = useCallback((message: CourtEngineMessage) => {
    setCourtMessages((messages) => [...messages, message]);
  }, []);

  useCourtEngine({
    caseId: courtEngine?.caseId ?? null,
    tenantId: courtEngine?.tenantId,
    analysisStatus: courtEngine?.analysisStatus ?? "idle",
    addMessageToChat: addCourtMessage
  });

  return (
    <div className="evida-legal-os">
      <TopBar
        activeCaseName={activeCaseName}
        actions={actions}
        identity={identity}
        lastAction={lastAction}
        onLogin={onLogin}
      />
      <Sidebar activeView={activeView} onNavigate={onNavigate} onNewCase={onNewCase} />
      <main className="main-work-area">
        <div
          className={`content-scroll-area ${
            !activeCaseName && activeView === "dashboard" ? "content-center-stage" : ""
          }`}
        >
          {children}
          {courtMessages.length > 0 ? (
            <section className="court-engine-chat-panel" aria-label="Operativ lederoppsummering">
              <ChatArea messages={courtMessages} />
            </section>
          ) : null}
        </div>
        <StickyChatBar activeCaseName={activeCaseName} onNavigate={onNavigate} />
      </main>
      <ControlPanel activeCaseName={activeCaseName} activeView={activeView} onNavigate={onNavigate} onNewCase={onNewCase} />
    </div>
  );
}
