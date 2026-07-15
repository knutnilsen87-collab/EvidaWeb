import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { EvidaDocument, fetchCaseDocuments, fetchSourceCoverage, SourceCoverage } from "../lib/api";
import { Citation, CitationComparison, citationStore } from "../lib/CitationManager";
import type { WorkspaceView } from "../navigation";
import { PDFViewer } from "./PDFViewer";
import { SaksromChat } from "./SaksromChat";
import { SaksromLiveOpeningSummary } from "./SaksromLiveOpeningSummary";
import "./SaksromView.css";

interface SaksromViewProps {
  caseId: string;
  tenantId: string;
  documents?: EvidaDocument[];
  onDocumentsChange?: (docs: EvidaDocument[]) => void;
  onNavigate?: (view: WorkspaceView) => void;
  onOpenMissingDocuments?: () => void;
}

function isSourceReady(document: EvidaDocument) {
  return document.status === "verified" || document.status === "source_ready";
}

function isPartialSourceReady(document: EvidaDocument) {
  return document.status === "partial_source_ready";
}

export function SaksromView({
  caseId,
  tenantId,
  documents = [],
  onDocumentsChange,
  onNavigate,
  onOpenMissingDocuments
}: SaksromViewProps) {
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [localDocs, setLocalDocs] = useState<EvidaDocument[]>(documents);
  const [sourceCoverage, setSourceCoverage] = useState<SourceCoverage | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const { user } = useAuth();
  const prevReadyCountRef = useRef<number | null>(null);

  const [activeCitation, setActiveCitation] = useState<Citation | null>(citationStore.activeCitation);
  const [activeComparison, setActiveComparison] = useState<CitationComparison | null>(citationStore.activeComparison);

  useEffect(() => {
    const unsubCitation = citationStore.subscribe((citation) => {
      setActiveCitation(citation);
    });
    const unsubComparison = citationStore.subscribeToComparison((comparison) => {
      setActiveComparison(comparison);
    });
    return () => {
      unsubCitation();
      unsubComparison();
    };
  }, []);

  useEffect(() => {
    citationStore.clear();
  }, [caseId]);

  const isPreviewOpen = !!activeCitation || !!activeComparison;
  const activeDocumentId = activeCitation
    ? activeCitation.documentId
    : activeComparison
    ? activeComparison.left.documentId
    : null;

  useEffect(() => {
    setLocalDocs(documents);
  }, [documents]);

  const totalCount = localDocs.length;
  const fullReadyCount = localDocs.filter(isSourceReady).length;
  const partialReadyCount = localDocs.filter(isPartialSourceReady).length;
  const verifiedCount = fullReadyCount + partialReadyCount;
  const pendingCount = localDocs.filter(
    (document) =>
      document.status === "quarantine" ||
      document.status === "approved_for_ingestion" ||
      document.status === "ingesting" ||
      document.status === "processing"
  ).length;
  const failedCount = localDocs.filter(
    (document) => document.status === "ingestion_failed" || document.status === "rejected"
  ).length;
  const coverage = sourceCoverage?.totalPages
    ? sourceCoverage.coveragePercent
    : totalCount > 0
    ? Math.round((fullReadyCount / totalCount) * 100)
    : 0;
  const isPreliminary = sourceCoverage?.totalPages
    ? sourceCoverage.readyPages < sourceCoverage.totalPages
    : coverage < 100 || partialReadyCount > 0;

  useEffect(() => {
    if (!caseId || !tenantId) {
      return;
    }

    const refreshCoverage = async () => {
      try {
        setSourceCoverage(await fetchSourceCoverage(tenantId, caseId));
      } catch (err) {
        console.error("Failed to fetch source coverage in SaksromView:", err);
      }
    };
    void refreshCoverage();

    const interval = window.setInterval(async () => {
      try {
        const [freshDocs, freshCoverage] = await Promise.all([
          fetchCaseDocuments(caseId, tenantId),
          fetchSourceCoverage(tenantId, caseId)
        ]);
        setLocalDocs(freshDocs);
        setSourceCoverage(freshCoverage);
        onDocumentsChange?.(freshDocs);
      } catch (err) {
        console.error("Failed to poll documents in SaksromView:", err);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [caseId, tenantId, onDocumentsChange]);

  useEffect(() => {
    if (prevReadyCountRef.current === null) {
      prevReadyCountRef.current = verifiedCount;
      return;
    }

    if (verifiedCount > prevReadyCountRef.current) {
      setNotification("Kildegrunnlaget er oppdatert.");
      const timer = window.setTimeout(() => setNotification(null), 5000);
      prevReadyCountRef.current = verifiedCount;
      return () => window.clearTimeout(timer);
    }

    prevReadyCountRef.current = verifiedCount;
  }, [verifiedCount]);

  let canvasClass = "saksrom-canvas";
  if (chatCollapsed) {
    canvasClass += " chat-collapsed";
  }
  if (isPreviewOpen) {
    canvasClass += " saksrom-canvas--preview-open";
  }

  return (
    <section className={canvasClass} aria-labelledby="saksrom-title">
      {isPreliminary ? (
        <div className="saksrom-preliminary-banner" role="status" data-evida-saksrom-chat-first="true">
          <div className="saksrom-preliminary-banner__title" data-evida-saksrom-chat-first="true">
            <span className="banner-pulse" />
            <strong>Foreløpig kildegrunnlag</strong>
          </div>
          {sourceCoverage?.totalPages ? (
            <p>
              Denne oppsummeringen bygger på {sourceCoverage.readyPages} av {sourceCoverage.totalPages} sider.
              {sourceCoverage.missingOcrPages > 0
                ? ` ${sourceCoverage.missingOcrPages} sider krever OCR og er ikke vurdert.`
                : ""}
              {sourceCoverage.belowThresholdPages > 0
                ? ` ${sourceCoverage.belowThresholdPages} side${sourceCoverage.belowThresholdPages === 1 ? "" : "r"} krever kontroll.`
                : ""}
            </p>
          ) : (
            <p>Foreløpig kildegrunnlag - svar kan være ufullstendige.</p>
          )}
          <p>
            Saksrom bruker bare sider med faktiske kildeenheter. Manglende OCR-sider og sider med for lite lesbar tekst brukes ikke som kilder.
          </p>
          <div className="banner-status-details">
            {sourceCoverage?.totalPages ? (
              <span>Kildedekning: {sourceCoverage.coveragePercent}%.</span>
            ) : verifiedCount === 0 ? (
              <span>
                Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst ett dokument er ferdig behandlet.
              </span>
            ) : (
              <span>Brukes nå: {verifiedCount} dokumenter.</span>
            )}
            {sourceCoverage?.missingOcrPageRanges ? <span>Mangler OCR: side {sourceCoverage.missingOcrPageRanges}.</span> : null}
            {sourceCoverage?.belowThresholdPageRanges ? <span>Krever kontroll: side {sourceCoverage.belowThresholdPageRanges}.</span> : null}
            {partialReadyCount > 0 ? <span>Delvis behandlet: {partialReadyCount} dokumenter.</span> : null}
            <span>Mangler fortsatt: {pendingCount} dokumenter.</span>
            <span>Feilet / krever kontroll: {failedCount} dokumenter.</span>
          </div>
        </div>
      ) : null}

      {notification ? (
        <div className="saksrom-notification" role="status" data-evida-saksrom-chat-first="true">
          <span className="banner-pulse" />
          {notification}
        </div>
      ) : null}

      {activeDocumentId ? (
        <section className="doc-pane" aria-label="Kildedokument visning">
          <header className="pane-header">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
              <div>
                <span className="pane-kicker">Dokumentgrunnlag</span>
                <h1 id="saksrom-title">
                  {activeComparison ? "Sammenligning" : activeCitation?.sourceUnitId ?? "Kildedokument"}
                </h1>
                <p style={{ margin: 0 }}>
                  {activeComparison
                    ? `${activeComparison.left.documentId} vs ${activeComparison.right.documentId}`
                    : activeCitation
                    ? `${activeCitation.documentId} · side ${activeCitation.page}`
                    : ""}
                </p>
              </div>
              <button
                className="pane-close-btn"
                onClick={() => citationStore.clear()}
                aria-label="Tilbake til Saksrom"
                type="button"
              >
                Tilbake til Saksrom
              </button>
            </div>
          </header>
          <PDFViewer documentId={activeDocumentId} tenantId={user?.tenantId} />
        </section>
      ) : null}

      <aside className="analysis-pane" aria-label="Kildebundet AI-chat">
        <header className="pane-header analysis-pane__header">
          <div>
            <span className="pane-kicker">AI-assistert analyse</span>
            <h2>Juridisk reasoning engine</h2>
          </div>
          <button
            aria-expanded={!chatCollapsed}
            aria-label={chatCollapsed ? "Vis chat" : "Skjul chat"}
            className="analysis-collapse-btn"
            onClick={() => setChatCollapsed((isCollapsed) => !isCollapsed)}
            type="button"
          >
            <span aria-hidden="true">{chatCollapsed ? "<" : ">"}</span>
          </button>
        </header>

        {chatCollapsed ? null : (
          <>
            <SaksromChat
              key={`chat-${caseId}`}
              caseId={caseId}
              tenantId={user?.tenantId}
              isPreliminary={isPreliminary}
              sourceCoverage={sourceCoverage}
              verifiedCount={verifiedCount}
              openingSummary={
                <SaksromLiveOpeningSummary
                  caseId={caseId}
                  tenantId={tenantId || user?.tenantId}
                  documents={localDocs}
                  sourceCoverage={sourceCoverage}
                  onNavigate={onNavigate}
                  onShowDocumentStatus={onOpenMissingDocuments}
                />
              }
            />
          </>
        )}
      </aside>
    </section>
  );
}
