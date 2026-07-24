import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useCourtEngine } from "../../hooks/useCourtEngine";
import type { AnalysisStatus, CourtEngineMessage } from "../../engine/types";
import { ChatArea } from "../chat/ChatArea";
import { StickyChatBar } from "../chat/StickyChatBar";
import { Sidebar } from "../Sidebar";
import { ControlPanel } from "./ControlPanel";
import { TopBar } from "./TopBar";
import type { CommandPaletteAction } from "../CommandPalette";
import { navigationGroups, viewTitles, type WorkspaceView } from "../../navigation";
import type { EvidaDocument } from "../../lib/api";
import { Citation, CitationComparison, citationStore } from "../../lib/CitationManager";
import { PDFViewer } from "../PDFViewer";
import { getBestNextStep, getSourceBasisStats } from "../../lib/bestNextStep";
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
  navigationState?: {
    hasActiveCase: boolean;
    hasReadySourceBasis: boolean;
  };
  documents?: EvidaDocument[];
  queueBusy?: boolean;
  actionSubmitting?: boolean;
  onLogin: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}

type ViewportMode = "phone" | "tablet" | "desktop";

const mobilePrimaryViews: Array<{ view: WorkspaceView; label: string; icon: string }> = [
  { view: "dashboard", label: "Saker", icon: "S" },
  { view: "import", label: "Dokumenter", icon: "D" },
  { view: "saksrom", label: "Saksrom", icon: "A" }
];

const mobileMoreViews: Array<{ view: WorkspaceView; label: string }> = [
  { view: "chronology", label: "Kronologi" },
  { view: "evidence", label: "Bevismatrise" },
  { view: "risk", label: "Risiko" },
  { view: "draft", label: "Utkast" },
  { view: "export", label: "Eksport" }
];

function viewportMode(width: number): ViewportMode {
  if (width <= 767) return "phone";
  if (width <= 1023) return "tablet";
  return "desktop";
}

function useViewportMode() {
  const [mode, setMode] = useState<ViewportMode>(() =>
    typeof window === "undefined" ? "desktop" : viewportMode(window.innerWidth)
  );

  useEffect(() => {
    const update = () => setMode(viewportMode(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mode;
}

function lockedReason(view: WorkspaceView, hasActiveCase: boolean, hasReadySourceBasis: boolean) {
  if (!hasActiveCase) {
    if (view === "dashboard" || view === "import" || view === "quarantine") {
      return null;
    }
    return "Opprett sak og last opp kilder for å åpne.";
  }
  if (!hasReadySourceBasis && !["dashboard", "import", "quarantine", "saksrom"].includes(view)) {
    return "Last opp kilder før dette arbeidsrommet åpnes.";
  }
  return null;
}

function MobileTopBar({
  activeCaseName,
  activeView,
  onBack,
  onMenu
}: {
  activeCaseName: string | null;
  activeView: WorkspaceView;
  onBack: () => void;
  onMenu: () => void;
}) {
  const canGoBack = activeView !== "dashboard";
  return (
    <header className="mobile-topbar" aria-label="Mobil toppfelt">
      <button
        aria-label="Tilbake til Saksoversikt"
        className="mobile-icon-btn"
        disabled={!canGoBack}
        onClick={onBack}
        type="button"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div className="mobile-topbar__title">
        <strong>EVIDA</strong>
        <span>{activeCaseName ?? viewTitles[activeView]}</span>
      </div>
      <button aria-label="Åpne mobilmeny" className="mobile-icon-btn" onClick={onMenu} type="button">
        <span aria-hidden="true">☰</span>
      </button>
    </header>
  );
}

function MobileBottomNav({
  activeView,
  hasActiveCase,
  hasReadySourceBasis,
  moreOpen,
  onNavigate,
  onMore
}: {
  activeView: WorkspaceView;
  hasActiveCase: boolean;
  hasReadySourceBasis: boolean;
  moreOpen: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onMore: () => void;
}) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobil bunnnavigasjon">
      {mobilePrimaryViews.map((item) => {
        const reason = lockedReason(item.view, hasActiveCase, hasReadySourceBasis);
        const active = activeView === item.view;
        return (
          <button
            aria-current={active ? "page" : undefined}
            aria-disabled={Boolean(reason)}
            aria-label={`${item.label}${reason ? ` låst: ${reason}` : ""}`}
            className={active ? "mobile-bottom-nav__item is-active" : "mobile-bottom-nav__item"}
            disabled={Boolean(reason)}
            key={item.view}
            onClick={() => onNavigate(item.view)}
            type="button"
          >
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </button>
        );
      })}
      <button
        aria-expanded={moreOpen}
        aria-label="Mer"
        className={moreOpen ? "mobile-bottom-nav__item is-active" : "mobile-bottom-nav__item"}
        onClick={onMore}
        type="button"
      >
        <span aria-hidden="true">•••</span>
        <small>Mer</small>
      </button>
    </nav>
  );
}

function MobileMoreSheet({
  activeView,
  hasActiveCase,
  hasReadySourceBasis,
  open,
  onClose,
  onNavigate,
  onNewCase
}: {
  activeView: WorkspaceView;
  hasActiveCase: boolean;
  hasReadySourceBasis: boolean;
  open: boolean;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
}) {
  if (!open) return null;
  return (
    <div className="mobile-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Mer"
        aria-modal="true"
        className="mobile-bottom-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <span>Arbeidsrom</span>
          <button aria-label="Lukk meny" className="mobile-sheet-close" onClick={onClose} type="button">
            Lukk
          </button>
        </header>
        <button className="mobile-sheet-action" onClick={onNewCase} type="button">
          Opprett ny sak
        </button>
        <div className="mobile-more-grid">
          {mobileMoreViews.map((item) => {
            const reason = lockedReason(item.view, hasActiveCase, hasReadySourceBasis);
            return (
              <button
                aria-current={activeView === item.view ? "page" : undefined}
                aria-disabled={Boolean(reason)}
                className="mobile-more-item"
                disabled={Boolean(reason)}
                key={item.view}
                onClick={() => {
                  onNavigate(item.view);
                  onClose();
                }}
                type="button"
              >
                <strong>{item.label}</strong>
                <span>{reason ?? navigationGroups.flatMap((group) => group.items).find((nav) => nav.view === item.view)?.description}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MobileStatusSheet({
  activeCaseName,
  activeView,
  actionSubmitting,
  documents,
  open,
  queueBusy,
  onClose,
  onNavigate,
  onNewCase,
  onOpen
}: {
  activeCaseName: string | null;
  activeView: WorkspaceView;
  actionSubmitting: boolean;
  documents: EvidaDocument[];
  open: boolean;
  queueBusy: boolean;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNewCase: () => void;
  onOpen: () => void;
}) {
  const sourceStats = getSourceBasisStats(documents);
  const nextStep = getBestNextStep({
    activeCaseName,
    activeView,
    documents,
    queueState: { isBusy: queueBusy, total: 0, failed: 0 },
    actionSubmitting
  });
  const sourceLabel = sourceStats.totalPages > 0
    ? `Kildegrunnlag: ${sourceStats.readyPages} av ${sourceStats.totalPages} sider klare`
    : documents.length > 0
    ? `Kildegrunnlag: ${sourceStats.sourceReadyDocuments} av ${documents.length} dokumenter klare`
    : "Kildegrunnlag: ikke bygget";
  const handleNext = () => {
    if (nextStep.disabled) return;
    if (nextStep.kind === "create_case") {
      onNewCase();
      return;
    }
    onNavigate(nextStep.targetView ?? "import");
    onClose();
  };

  return (
    <>
      <button className="mobile-status-row" onClick={onOpen} type="button">
        <span>{sourceLabel}</span>
        <strong>Detaljer</strong>
      </button>
      {open ? (
        <div className="mobile-sheet-backdrop" role="presentation" onClick={onClose}>
          <section
            aria-label="Kildegrunnlag og neste steg"
            aria-modal="true"
            className="mobile-bottom-sheet mobile-status-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <span>Status</span>
              <button aria-label="Lukk statuspanel" className="mobile-sheet-close" onClick={onClose} type="button">
                Lukk
              </button>
            </header>
            <dl className="mobile-status-metrics">
              <div>
                <dt>Klare sider</dt>
                <dd>{sourceStats.readyPages}</dd>
              </div>
              <div>
                <dt>Krever kontroll</dt>
                <dd>{sourceStats.failedPages + sourceStats.failedDocuments}</dd>
              </div>
              <div>
                <dt>Dokumenter</dt>
                <dd>{documents.length}</dd>
              </div>
            </dl>
            <div className="mobile-next-step">
              <span>Anbefalt neste steg</span>
              <strong>{nextStep.title}</strong>
              <p>{nextStep.body}</p>
              <button disabled={nextStep.disabled} onClick={handleNext} type="button">
                {nextStep.kind === "create_case" ? "Opprett ny sak" : nextStep.label}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function AppShell({
  activeCaseName,
  activeView,
  actions,
  children,
  courtEngine,
  identity,
  lastAction,
  navigationState,
  documents = [],
  queueBusy = false,
  actionSubmitting = false,
  onLogin,
  onNavigate,
  onNewCase
}: AppShellProps) {
  const viewport = useViewportMode();
  const isDesktop = viewport === "desktop";
  const isMobileShell = !isDesktop;
  const [moreOpen, setMoreOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [courtMessages, setCourtMessages] = useState<CourtEngineMessage[]>([]);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(citationStore.activeCitation);
  const [activeComparison, setActiveComparison] = useState<CitationComparison | null>(citationStore.activeComparison);
  const addCourtMessage = useCallback((message: CourtEngineMessage) => {
    setCourtMessages((messages) => [...messages, message]);
  }, []);

  useEffect(() => {
    const unsubscribeCitation = citationStore.subscribe(setActiveCitation);
    const unsubscribeComparison = citationStore.subscribeToComparison(setActiveComparison);
    return () => {
      unsubscribeCitation();
      unsubscribeComparison();
    };
  }, []);

  useCourtEngine({
    caseId: courtEngine?.caseId ?? null,
    tenantId: courtEngine?.tenantId,
    analysisStatus: courtEngine?.analysisStatus ?? "idle",
    addMessageToChat: addCourtMessage
  });

  const globalSourceDocumentId =
    activeView === "saksrom" || isMobileShell
      ? null
      : activeCitation?.documentId ?? activeComparison?.left.documentId ?? null;
  const hasActiveCase = navigationState?.hasActiveCase ?? Boolean(activeCaseName);
  const hasReadySourceBasis = navigationState?.hasReadySourceBasis ?? true;
  const mobileSourceOverlayOpen = isMobileShell && Boolean(activeCitation || activeComparison);
  const shellClass = `evida-legal-os evida-legal-os--${viewport} ${
    isDesktop && sidebarCollapsed ? "evida-legal-os--focus" : ""
  }`;

  useEffect(() => {
    if (!mobileSourceOverlayOpen) return;
    setMoreOpen(false);
    setStatusOpen(false);
  }, [mobileSourceOverlayOpen]);

  return (
    <div className={shellClass}>
      {isDesktop ? (
        <>
          <TopBar
            activeCaseName={activeCaseName}
            actions={actions}
            identity={identity}
            lastAction={lastAction}
            onLogin={onLogin}
          />
          <Sidebar
            activeCaseName={activeCaseName}
            activeView={activeView}
            collapsed={sidebarCollapsed}
            documents={documents}
            hasActiveCase={hasActiveCase}
            hasReadySourceBasis={hasReadySourceBasis}
            onNavigate={onNavigate}
            onNewCase={onNewCase}
            onToggleFocus={() => setSidebarCollapsed((value) => !value)}
          />
        </>
      ) : (
        <MobileTopBar
          activeCaseName={activeCaseName}
          activeView={activeView}
          onBack={() => onNavigate("dashboard")}
          onMenu={() => setMoreOpen(true)}
        />
      )}
      <main className="main-work-area">
        {isMobileShell && !mobileSourceOverlayOpen ? (
          <MobileStatusSheet
            activeCaseName={activeCaseName}
            activeView={activeView}
            actionSubmitting={actionSubmitting}
            documents={documents}
            open={statusOpen}
            queueBusy={queueBusy}
            onClose={() => setStatusOpen(false)}
            onNavigate={onNavigate}
            onNewCase={onNewCase}
            onOpen={() => setStatusOpen(true)}
          />
        ) : null}
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
          {globalSourceDocumentId ? (
            <section className="global-source-preview liquid-glass-panel" aria-label="Global kildevisning">
              <header>
                <div>
                  <span>Dokumentgrunnlag</span>
                  <h2>{activeComparison ? "Sammenligning" : activeCitation?.sourceUnitId ?? "Kildedokument"}</h2>
                  <p>
                    {activeComparison
                      ? `${activeComparison.left.documentId} vs ${activeComparison.right.documentId}`
                      : activeCitation
                      ? `${activeCitation.documentId} · side ${activeCitation.page}`
                      : ""}
                  </p>
                </div>
                <button aria-label="Lukk preview" onClick={() => citationStore.clear()} type="button">
                  Lukk preview
                </button>
              </header>
              <PDFViewer documentId={globalSourceDocumentId} tenantId={courtEngine?.tenantId} />
            </section>
          ) : null}
        </div>
        {isDesktop && activeView !== "saksrom"
          ? <StickyChatBar activeCaseName={activeCaseName} onNavigate={onNavigate} />
          : null}
      </main>
      {isDesktop ? (
        <ControlPanel
          activeCaseName={activeCaseName}
          activeView={activeView}
          documents={documents}
          queueBusy={queueBusy}
          actionSubmitting={actionSubmitting}
          onNavigate={onNavigate}
          onNewCase={onNewCase}
        />
      ) : (
        !mobileSourceOverlayOpen ? (
        <>
          <MobileBottomNav
            activeView={activeView}
            hasActiveCase={hasActiveCase}
            hasReadySourceBasis={hasReadySourceBasis}
            moreOpen={moreOpen}
            onNavigate={onNavigate}
            onMore={() => setMoreOpen(true)}
          />
          <MobileMoreSheet
            activeView={activeView}
            hasActiveCase={hasActiveCase}
            hasReadySourceBasis={hasReadySourceBasis}
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            onNavigate={onNavigate}
            onNewCase={onNewCase}
          />
        </>
        ) : null
      )}
    </div>
  );
}
