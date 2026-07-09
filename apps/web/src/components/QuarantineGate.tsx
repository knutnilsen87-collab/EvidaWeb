import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { AnalysisStatus } from "../engine/types";
import {
  approveDocumentForIngestion,
  archiveDocument,
  EvidaDocument,
  fetchCaseDocuments,
  ingestDocument,
  rejectDocument,
  startCourtEngineAnalysis,
  uploadDocuments
} from "../lib/api";
import { uploadQueue } from "../lib/uploadQueue";
import { BatchApprovalPanel } from "./BatchApprovalPanel";
import "./QuarantineGate.css";

interface QuarantineGateProps {
  caseId: string;
  onAnalysisStatusChange?: (status: AnalysisStatus) => void;
}

export function QuarantineGate({ caseId, onAnalysisStatusChange }: QuarantineGateProps) {
  const [documents, setDocuments] = useState<EvidaDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [prevBusy, setPrevBusy] = useState(false);
  const [loadedFromBackend, setLoadedFromBackend] = useState(false);
  const { loading: authLoading, user } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return;
    return uploadQueue.subscribe((state) => {
      setQueueBusy(state.isBusy);
      if (prevBusy && !state.isBusy && state.completed > 0) {
        void fetchCaseDocuments(caseId, user.tenantId).then((nextDocs) => {
          setDocuments(nextDocs);
        });
      }
      setPrevBusy(state.isBusy);
    });
  }, [prevBusy, caseId, user, authLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      if (authLoading) {
        return;
      }

      if (!user) {
        setLoading(false);
        setDocuments([]);
        setLoadedFromBackend(false);
        setError("Du må være autentisert før dokumenter kan lastes.");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const nextDocuments = await fetchCaseDocuments(caseId, user.tenantId);
        if (!cancelled) {
          setDocuments(nextDocuments);
          setLoadedFromBackend(true);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Kunne ikke hente dokumenter");
          setLoadedFromBackend(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [authLoading, caseId, user]);

  async function handleApprove(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan godkjennes.");
      return;
    }
    setIsProcessing(documentId);
    setError("");
    try {
      await approveDocumentForIngestion(documentId, user.tenantId);
      setDocuments(await fetchCaseDocuments(caseId, user.tenantId));
      setSuccess("Dokument er godkjent for ingestion.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke godkjenne kilde");
    } finally {
      setIsProcessing(null);
    }
  }

  async function handleReject(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan avvises.");
      return;
    }
    setIsProcessing(documentId);
    setError("");
    try {
      await rejectDocument(documentId, user.tenantId, "Avvist fra karantene-sluse");
      setDocuments(await fetchCaseDocuments(caseId, user.tenantId));
      setSuccess("Dokument er avvist.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke avvise dokument");
    } finally {
      setIsProcessing(null);
    }
  }

  async function handleArchive(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan arkiveres.");
      return;
    }
    setIsProcessing(documentId);
    setError("");
    try {
      await archiveDocument(documentId, user.tenantId);
      setDocuments(await fetchCaseDocuments(caseId, user.tenantId));
      setSuccess("Dokument er arkivert.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke arkivere dokument");
    } finally {
      setIsProcessing(null);
    }
  }

  async function handleIngest(documentId: string) {
    if (!user) {
      setError("Du mÃ¥ vÃ¦re autentisert fÃ¸r ingestion kan startes.");
      return;
    }
    setIsProcessing(documentId);
    setError("");
    setSuccess("");
    try {
      const result = await ingestDocument(documentId, user.tenantId);
      setDocuments(await fetchCaseDocuments(caseId, user.tenantId));
      if (result.status === "SOURCE_READY") {
        onAnalysisStatusChange?.("processing");
        const analysis = await startCourtEngineAnalysis(user.tenantId, {
          caseId,
          fileIds: [documentId]
        });
        onAnalysisStatusChange?.(analysis.analysisStatus === "completed" ? "completed" : "processing");
        setSuccess(`Ingestion fullfÃ¸rt med ${result.sourceUnitCount} kildeenhet(er).`);
      } else {
        onAnalysisStatusChange?.("failed");
        setError(result.errorCode ?? "Ingestion feilet.");
      }
    } catch (caught) {
      onAnalysisStatusChange?.("failed");
      setError(caught instanceof Error ? caught.message : "Kunne ikke starte ingestion");
    } finally {
      setIsProcessing(null);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    if (!user) {
      setError("Du må være autentisert før dokumenter kan lastes opp.");
      return;
    }

    setError("");
    setSuccess("");
    uploadQueue.setContext(user.tenantId, caseId);
    uploadQueue.addFiles(files);
  }

  const verifiedCount = documents.filter((document) => document.status === "verified").length;
  const pendingDocuments = documents.filter((document) => document.status !== "verified");
  const statusLabel = (document: EvidaDocument) => {
    switch (document.status) {
      case "quarantine":
        return "I karantene";
      case "approved_for_ingestion":
        return "Klar for ingestion";
      case "ingesting":
        return "Ingestion pÃ¥gÃ¥r";
      case "ingestion_failed":
        return document.ingestionError ?? "Ingestion feilet";
      case "source_ready":
        return "Kildeklar";
      default:
        return "Behandles";
    }
  };

  return (
    <section className="quarantine-workspace" aria-labelledby="quarantine-title">
      <div className="workspace-header">
        <h1 id="quarantine-title">Karantene</h1>
        <p>Analyse-rommet er åpnet. Verifiser dokumenter for å inkludere dem i sakens kildegrunnlag.</p>

        <div className="stats-bar" aria-label="Karanteneoversikt">
          <div className="stat-card">
            <span className="stat-value">{verifiedCount}</span>
            <span className="stat-label">Verifisert</span>
          </div>
          <div className="stat-card active">
            <span className="stat-value">{pendingDocuments.length}</span>
            <span className="stat-label">I karantene</span>
          </div>
        </div>

        <label className="upload-dropzone">
          <span>{queueBusy ? "Laster opp til karantene ..." : "Last opp dokument til karantene"}</span>
          <input
            aria-label="Last opp dokument"
            disabled={queueBusy}
            multiple
            onChange={(event) => void handleUpload(event.currentTarget.files)}
            type="file"
          />
        </label>
      </div>

      {loading ? <p className="quarantine-notice">Henter dokumenter ...</p> : null}
      {!loading && loadedFromBackend ? (
        <p className="quarantine-notice">Dokumentlisten er lastet fra backend.</p>
      ) : null}
      {success ? <p className="quarantine-notice">{success}</p> : null}
      {error ? (
        <p className="quarantine-notice quarantine-notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <BatchApprovalPanel />

      {!loading && pendingDocuments.length === 0 ? (
        <div className="liquid-glass-panel quarantine-empty">
          <strong>Ingen dokumenter i karantene</strong>
          <span>Backend har ingen karantene-dokumenter for aktiv tenant.</span>
        </div>
      ) : null}

      <div className="document-grid" aria-label="Dokumenter i karantene">
        {pendingDocuments.map((document) => (
          <article key={document.id} className="liquid-glass-panel doc-card">
            <div className={`status-indicator ${document.status}`} aria-hidden="true" />

            <div className="doc-content">
              <h3 className="doc-title">{document.filename}</h3>
              <p className="doc-meta">
                {document.pages} {document.pages === 1 ? "side" : "sider"} •{" "}
                {statusLabel(document)}
              </p>
            </div>

            <button
              className="btn-approve"
              type="button"
              aria-label={`Godkjenn ${document.filename} for ingestion`}
              onClick={() => void handleApprove(document.id)}
              disabled={document.status !== "quarantine" || isProcessing === document.id}
            >
              {isProcessing === document.id ? "Behandler..." : "Godkjenn for ingestion"}
            </button>
            <button
              className="btn-approve"
              type="button"
              aria-label={`Start ingestion for ${document.filename}`}
              onClick={() => void handleIngest(document.id)}
              disabled={document.status !== "approved_for_ingestion" || isProcessing === document.id}
            >
              {isProcessing === document.id ? "Ingest..." : "Start ingestion"}
            </button>
            <button
              className="btn-approve"
              type="button"
              aria-label={`Avvis ${document.filename}`}
              onClick={() => void handleReject(document.id)}
              disabled={document.status !== "quarantine" || isProcessing === document.id}
            >
              Avvis
            </button>
            <button
              className="btn-approve"
              type="button"
              aria-label={`Arkiver ${document.filename}`}
              onClick={() => void handleArchive(document.id)}
              disabled={isProcessing === document.id}
            >
              Arkiver
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
