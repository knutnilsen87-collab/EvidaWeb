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
  completenessAcknowledged?: boolean;
  completenessPassed?: boolean;
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

function isBeingProcessed(document: EvidaDocument) {
  return (
    document.status === "approved_for_ingestion" ||
    document.status === "ingesting" ||
    document.status === "processing"
  );
}

function sameDocuments(current: EvidaDocument[], next: EvidaDocument[]) {
  return current.length === next.length && current.every((document, index) => {
    const nextDocument = next[index];
    return (
      document.id === nextDocument?.id &&
      document.status === nextDocument.status &&
      document.pages === nextDocument.pages &&
      document.ocrRequired === nextDocument.ocrRequired
    );
  });
}

export function SaksromView({
  caseId,
  tenantId,
  completenessAcknowledged = false,
  completenessPassed = false,
  documents = [],
  onDocumentsChange,
  onNavigate,
  onOpenMissingDocuments
}: SaksromViewProps) {
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
  const shouldPollProcessing = localDocs.some(isBeingProcessed);
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

    if (!shouldPollProcessing) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const [freshDocs, freshCoverage] = await Promise.all([
          fetchCaseDocuments(caseId, tenantId),
          fetchSourceCoverage(tenantId, caseId)
        ]);
        setLocalDocs((current) => (sameDocuments(current, freshDocs) ? current : freshDocs));
        setSourceCoverage((current) => {
          if (
            current?.readyPages === freshCoverage.readyPages &&
            current?.totalPages === freshCoverage.totalPages &&
            current?.missingOcrPages === freshCoverage.missingOcrPages &&
            current?.belowThresholdPages === freshCoverage.belowThresholdPages &&
            current?.coveragePercent === freshCoverage.coveragePercent
          ) {
            return current;
          }
          return freshCoverage;
        });
        if (!sameDocuments(localDocs, freshDocs)) {
          onDocumentsChange?.(freshDocs);
        }
      } catch (err) {
        console.error("Failed to poll documents in SaksromView:", err);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [caseId, tenantId, onDocumentsChange, shouldPollProcessing, localDocs]);

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
  if (isPreviewOpen) {
    canvasClass += " saksrom-canvas--preview-open";
  }

  return (
    <section className={canvasClass} aria-labelledby="saksrom-title">
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
        <SaksromChat
              key={`chat-${caseId}`}
              caseId={caseId}
              tenantId={user?.tenantId}
              completenessAcknowledged={completenessAcknowledged}
              completenessPassed={completenessPassed}
              isPreliminary={isPreliminary}
              isProcessing={shouldPollProcessing}
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
      </aside>
    </section>
  );
}
