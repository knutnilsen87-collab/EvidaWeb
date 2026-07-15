import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bevismatrise } from "./components/Bevismatrise";
import type { CommandPaletteAction } from "./components/CommandPalette";
import { Dashboard } from "./components/Dashboard";
import { Kronologi } from "./components/Kronologi";
import { AppShell } from "./components/layout/AppShell";
import { NewCaseModal } from "./components/NewCaseModal";
import { NewCaseWizard } from "./components/NewCaseWizard";
import { QuarantineGate } from "./components/QuarantineGate";
import { SaksromView } from "./components/SaksromView";
import { StartupGateway } from "./components/StartupGateway";
import { UtkastModul } from "./components/UtkastModul";
import { DocumentImport } from "./components/DocumentImport";
import { useAuth } from "./context/AuthContext";
import type { AnalysisStatus } from "./engine/types";
import { uploadQueue } from "./lib/uploadQueue";
import { navigationGroups, viewTitles, WorkspaceView } from "./navigation";
import { CaseFileDto, ensureBackendCaseId, fetchCaseDocuments, fetchSourceCoverage, EvidaDocument, isUuid, SourceCoverage } from "./lib/api";
import { SaksromReadinessModal } from "./components/SaksromReadinessModal";
import "./styles/global.css";
import "./App.css";

type ActiveCaseResolutionState = "none_selected" | "creating" | "resolving" | "resolved" | "failed";

type CaseResolutionRequest =
  | { kind: "create"; title: string }
  | { kind: "open"; id: string; title: string };

function WorkroomPlaceholder({
  title,
  status,
  body
}: {
  title: string;
  status: "Mock API" | "Backend senere" | "Planlagt";
  body: string;
}) {
  return (
    <section className="evida-web-placeholder liquid-glass-panel">
      <span className="status-pill status-pill--processing">{status}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("dashboard");
  const [activeCaseName, setActiveCaseName] = useState<string | null>(null);
  const [caseResolutionState, setCaseResolutionState] = useState<ActiveCaseResolutionState>("none_selected");
  const [caseResolutionError, setCaseResolutionError] = useState<string | null>(null);
  const [caseResolutionRequest, setCaseResolutionRequest] = useState<CaseResolutionRequest | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseWizardOpen, setNewCaseWizardOpen] = useState(false);
  const [lastAction, setLastAction] = useState("Velg eller opprett en sak.");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [queueBusy, setQueueBusy] = useState(false);
  const [controlActionSubmitting, setControlActionSubmitting] = useState(false);
  
  // Preliminary kildegrunnlag states
  const [documents, setDocuments] = useState<EvidaDocument[]>([]);
  const [readinessCoverage, setReadinessCoverage] = useState<SourceCoverage | null>(null);
  const [readinessModalOpen, setReadinessModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState<WorkspaceView | null>(null);
  const [acknowledgedFingerprints, setAcknowledgedFingerprints] = useState<Record<string, string>>({});

  const { user: currentUser, login, loading } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  // documents.case_id has an FK to cases(id) in backend, so the active case must be a
  // backend-created UUID before any upload/fetch can be case-scoped. Empty string while
  // resolving; case-scoped views are gated until it is set.
  const [activeCaseId, setActiveCaseId] = useState("");


  const refreshDocs = useCallback(async () => {
    if (activeCaseId && currentUser?.tenantId) {
      try {
        const docs = await fetchCaseDocuments(activeCaseId, currentUser.tenantId);
        setDocuments(docs);
      } catch (err) {
        console.error("Error refreshing docs in App:", err);
      }
    } else {
      setDocuments([]);
    }
  }, [activeCaseId, currentUser?.tenantId]);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  useEffect(() => {
    return uploadQueue.subscribe((state) => {
      setQueueBusy(state.isBusy);
    });
  }, []);

  useEffect(() => {
    if (!queueBusy) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Opplasting pågår. Er du sikker på at du vil forlate siden?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [queueBusy]);

  async function openView(view: WorkspaceView) {
    if (activeCaseId && currentUser?.tenantId) {
      try {
        const docs = await fetchCaseDocuments(activeCaseId, currentUser.tenantId);
        setDocuments(docs);

        if (view === "saksrom") {
          let liveCoverage: SourceCoverage | null = null;
          try {
            liveCoverage = await fetchSourceCoverage(currentUser.tenantId, activeCaseId);
            setReadinessCoverage(liveCoverage);
          } catch (coverageError) {
            console.error("Error fetching live source coverage:", coverageError);
            setReadinessCoverage(null);
          }
          const total = docs.length;
          const verified = docs.filter(
            (d) => d.status === "verified" || d.status === "source_ready" || d.status === "partial_source_ready"
          ).length;
          const cov = liveCoverage?.totalPages
            ? liveCoverage.coveragePercent ?? Math.round(((liveCoverage.readyPages ?? 0) / liveCoverage.totalPages) * 100)
            : total > 0
            ? Math.round((verified / total) * 100)
            : 0;
          const currentFingerprint = docs.map((d) => `${d.id}:${d.status}`).join(",")
            + `:${liveCoverage?.readyPages ?? "x"}/${liveCoverage?.totalPages ?? "x"}`;
          const isAcked = acknowledgedFingerprints[activeCaseId] === currentFingerprint;
          const hasOcrWarning = docs.some((d) => d.ocrRequired) || Boolean(liveCoverage && ((liveCoverage.missingOcrPages ?? 0) > 0 || (liveCoverage.belowThresholdPages ?? 0) > 0));

          if ((cov < 100 || hasOcrWarning) && !isAcked) {
            setPendingView(view);
            setReadinessModalOpen(true);
            return;
          }
        }
      } catch (err) {
        console.error("Error fetching docs on navigation:", err);
      }
    }

    setActiveView(view);
    setLastAction(`${viewTitles[view]} er åpnet.`);
  }

  function handleConfirmReadiness() {
    const currentFingerprint = documents.map((d) => `${d.id}:${d.status}`).join(",")
      + `:${readinessCoverage?.readyPages ?? "x"}/${readinessCoverage?.totalPages ?? "x"}`;
    setAcknowledgedFingerprints((prev) => ({
      ...prev,
      [activeCaseId]: currentFingerprint
    }));
    setReadinessModalOpen(false);
    if (pendingView) {
      setActiveView(pendingView);
      setLastAction(`${viewTitles[pendingView]} er åpnet.`);
      setPendingView(null);
    }
  }

  function handleCloseReadiness() {
    setReadinessModalOpen(false);
    setPendingView(null);
  }

  function openNewCaseModal() {
    setNewCaseOpen(true);
  }

  function openNewCaseWizard() {
    setNewCaseWizardOpen(true);
  }

  async function resolveCase(request: CaseResolutionRequest) {
    const tenantId = currentUser?.tenantId;
    setCaseResolutionRequest(request);
    setCaseResolutionError(null);
    setActiveCaseName(request.title);
    setActiveCaseId("");
    setDocuments([]);
    setActiveView("import");
    setCaseResolutionState(request.kind === "create" ? "creating" : "resolving");
    setLastAction(
      request.kind === "create"
        ? `${request.title} opprettes.`
        : `${request.title} åpnes.`
    );

    if (!tenantId) {
      setCaseResolutionState("failed");
      setCaseResolutionError("Saken kunne ikke klargjøres fordi tenant mangler.");
      setLastAction("Saken kunne ikke klargjøres fordi tenant mangler.");
      return;
    }

    try {
      const id = request.kind === "open" ? request.id : await ensureBackendCaseId(request.title, tenantId);
      if (!isUuid(id)) {
        throw new Error("Backend returnerte ikke en gyldig case UUID.");
      }
      setActiveCaseId(id);
      setCaseResolutionState("resolved");
      setLastAction(
        request.kind === "create"
          ? `${request.title} er opprettet. Last opp dokumenter for å starte kildegrunnlaget.`
          : `${request.title} er valgt. Last opp dokumenter for å starte kildegrunnlaget.`
      );
    } catch (err) {
      console.error("Kunne ikke klargjøre sak i backend:", err);
      setCaseResolutionState("failed");
      setCaseResolutionError("Saken kunne ikke klargjøres i backend. Kontroller at API-et kjører.");
      setLastAction("Saken kunne ikke klargjøres i backend. Kontroller at API-et kjører.");
    }
  }

  function createNewCase(caseName: string) {
    const trimmedName = caseName.trim();
    if (!trimmedName) {
      return;
    }
    setNewCaseOpen(false);
    setNewCaseWizardOpen(false);
    void resolveCase({ kind: "create", title: trimmedName });
  }

  function openExistingCase(caseFile: CaseFileDto) {
    void resolveCase({ kind: "open", id: caseFile.id, title: caseFile.title });
  }

  function startCaseAndImport() {
    openNewCaseModal();
  }

  function retryCaseResolution() {
    if (caseResolutionRequest) {
      void resolveCase(caseResolutionRequest);
    }
    setLastAction("Prøver å klargjøre saken på nytt.");
  }

  function returnToDashboard() {
    setActiveView("dashboard");
    setActiveCaseName(null);
    setActiveCaseId("");
    setCaseResolutionRequest(null);
    setCaseResolutionState("none_selected");
    setCaseResolutionError(null);
    setDocuments([]);
    setLastAction("Velg eller opprett en sak.");
  }

  const actions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: "new-case",
        label: "Opprett ny sak",
        description: "Start en ny juridisk analyse",
        shortcut: "N",
        onRun: openNewCaseModal
      },
      {
        id: "new-case-wizard",
        label: "Start ny sak med veiviser",
        description: "La EVIDA foreslå fail-closed arbeidsløp",
        shortcut: "W",
        onRun: openNewCaseWizard
      },
      ...navigationGroups.flatMap((group) =>
        group.items.map((item) => ({
          id: `open-${item.view}`,
          label: `Åpne ${item.label}`,
          description: `${group.title}: ${item.description}`,
          onRun: () => openView(item.view)
        }))
      )
    ],
    []
  );

  const verifiedCount = readinessCoverage?.readyPages ?? documents.filter(
    (d) => d.status === "verified" || d.status === "source_ready" || d.status === "partial_source_ready"
  ).length;
  const pendingCount = documents.filter(
    (d) => d.status === "quarantine" || d.status === "approved_for_ingestion" || d.status === "ingesting" || d.status === "processing"
  ).length;
  const failedCount = documents.filter(
    (d) => d.status === "ingestion_failed" || d.status === "rejected"
  ).length;
  const ocrWarningCount = readinessCoverage
    ? (readinessCoverage.missingOcrPages ?? 0) + (readinessCoverage.belowThresholdPages ?? 0)
    : documents.filter((d) => d.ocrRequired).length;
  const coverage = readinessCoverage?.totalPages
    ? readinessCoverage.coveragePercent ?? Math.round(((readinessCoverage.readyPages ?? 0) / readinessCoverage.totalPages) * 100)
    : documents.length > 0
    ? Math.round((verifiedCount / documents.length) * 100)
    : 0;

  function renderWorkroom() {
    const needsBackendCase = activeView === "quarantine" || activeView === "saksrom" || activeView === "import";
    if (needsBackendCase && !activeCaseId) {
      if (caseResolutionState === "failed") {
        return (
          <section className="evida-web-placeholder liquid-glass-panel" aria-live="polite">
            <span className="status-pill status-pill--blocked">Krever handling</span>
            <h2>Saken kunne ikke klargjøres</h2>
            <p>{caseResolutionError ?? "Backend registrerte ikke saken. Prøv igjen før dokumenter lastes opp."}</p>
            <button className="btn-primary" type="button" onClick={retryCaseResolution}>
              Prøv igjen
            </button>
            <button className="btn-secondary" type="button" onClick={returnToDashboard}>
              Tilbake
            </button>
          </section>
        );
      }
      return (
        <section className="evida-web-placeholder liquid-glass-panel" aria-live="polite">
          <span className="status-pill status-pill--processing">Klargjør sak</span>
          <h2>Saken klargjøres</h2>
          <p>Venter på at saken registreres i backend før dokumenter kan lastes opp.</p>
        </section>
      );
    }
    switch (activeView) {
      case "dashboard":
        return (
          <Dashboard
            activeCaseName={activeCaseName}
            onNavigate={openView}
            onNewCase={startCaseAndImport}
            onOpenWizard={openNewCaseWizard}
          />
        );
      case "quarantine":
        return (
          <QuarantineGate
            key={activeCaseId}
            caseId={activeCaseId}
            onAnalysisStatusChange={(status) => setAnalysisStatus(status as any)}
            onDocumentsChange={setDocuments}
            onControlActionSubmitting={setControlActionSubmitting}
            onOpenSaksrom={() => void openView("saksrom")}
          />
        );
      case "saksrom":
        return (
          <SaksromView
            key={activeCaseId}
            caseId={activeCaseId}
            tenantId={currentUser?.tenantId || ""}
            documents={documents}
            onDocumentsChange={setDocuments}
            onNavigate={openView}
            onOpenMissingDocuments={() => void openView("quarantine")}
          />
        );
      case "import":
        return (
          <DocumentImport
            key={activeCaseId}
            caseId={activeCaseId}
            onAnalysisStatusChange={(status) => setAnalysisStatus(status as any)}
            onDocumentsChange={setDocuments}
            onContinueToSaksrom={() => void openView("saksrom")}
          />
        );
      case "chronology":
        return <Kronologi />;
      case "evidence":
        return <Bevismatrise />;
      case "arguments":
        return (
          <WorkroomPlaceholder
            title="Anførselstavle"
            status="Planlagt"
            body="Anførselstavlen skal samle prosessuelle standpunkt og markere hva som mangler kilde."
          />
        );
      case "risk":
        return (
          <WorkroomPlaceholder
            title="Risikoanalyse"
            status="Planlagt"
            body="Risiko skal vise usikkerhet, motstrid og svake ledd før utkast eller eksport."
          />
        );
      case "draft":
        return <UtkastModul isPreliminary={coverage < 100} />;
      case "export":
        return <UtkastModul isPreliminary={coverage < 100} />;
    }
  }

  const startupModals = (
    <>
      <NewCaseModal
        isOpen={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreate={createNewCase}
      />
      <NewCaseWizard
        isOpen={newCaseWizardOpen}
        onClose={() => setNewCaseWizardOpen(false)}
        onCreate={createNewCase}
      />
    </>
  );

  if (!activeCaseId || caseResolutionState === "none_selected") {
    return (
      <>
        <StartupGateway
          activeCaseName={activeCaseName}
          caseResolutionError={caseResolutionError}
          caseResolutionState={caseResolutionState}
          tenantId={currentUser?.tenantId}
          onNewCase={startCaseAndImport}
          onOpenCase={openExistingCase}
          onRetryCaseResolution={retryCaseResolution}
        />
        {startupModals}
      </>
    );
  }

  return (
    <AppShell
      activeCaseName={activeCaseName}
      activeView={activeView}
      actions={actions}
      courtEngine={{
        analysisStatus,
        caseId: activeCaseId,
        tenantId: currentUser?.tenantId
      }}
      identity={{
        authenticated: Boolean(currentUser),
        loading,
        name: loading ? "Validerer sesjon" : currentUser?.name ?? "Ikke autentisert",
        tenantId: currentUser?.tenantId ?? "Ingen tenant"
      }}
      lastAction={lastAction}
      documents={documents}
      navigationState={{
        hasActiveCase: Boolean(activeCaseId),
        hasReadySourceBasis: verifiedCount > 0
      }}
      queueBusy={queueBusy}
      actionSubmitting={controlActionSubmitting}
      onLogin={() => login("00000000-0000-0000-0000-000000000101")}
      onNavigate={openView}
      onNewCase={openNewCaseModal}
    >
      {queueBusy ? (
        <div className="in-app-warning-banner" role="alert" style={{
          background: "rgba(217, 119, 6, 0.15)",
          borderBottom: "1px solid rgba(217, 119, 6, 0.3)",
          color: "#f59e0b",
          padding: "8px 16px",
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          zIndex: 1000,
          position: "sticky",
          top: 0
        }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" }} />
          Aktiv dokumentopplasting eller hashing pågår. Vennligst ikke lukk eller oppdater applikasjonen.
        </div>
      ) : null}
        <motion.div
          key={activeView}
          className="legal-os-stage"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {renderWorkroom()}
        </motion.div>
      <NewCaseModal
        isOpen={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreate={createNewCase}
      />
      <NewCaseWizard
        isOpen={newCaseWizardOpen}
        onClose={() => setNewCaseWizardOpen(false)}
        onCreate={createNewCase}
      />
      <SaksromReadinessModal
        isOpen={readinessModalOpen}
        coverage={coverage}
        verifiedCount={verifiedCount}
        pendingCount={pendingCount}
        failedCount={failedCount}
        ocrWarningCount={ocrWarningCount}
        sourceCoverage={readinessCoverage}
        onClose={handleCloseReadiness}
        onConfirm={handleConfirmReadiness}
        onInspectMissing={() => {
          setReadinessModalOpen(false);
          setPendingView(null);
          void openView("quarantine");
        }}
      />
    </AppShell>
  );
}

export default App;
