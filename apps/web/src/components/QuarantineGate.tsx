import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { AnalysisStatus } from "../engine/types";
import {
  approveDocumentForIngestion,
  archiveDocument,
  EvidaDocument,
  fetchCaseDocuments,
  rejectDocument,
  replaceDocumentVersion,
  startBatchIngestion
} from "../lib/api";
import { uploadQueue } from "../lib/uploadQueue";
import { BatchApprovalPanel } from "./BatchApprovalPanel";
import "./QuarantineGate.css";

interface QuarantineGateProps {
  caseId: string;
  onAnalysisStatusChange?: (status: AnalysisStatus) => void;
  onDocumentsChange?: (documents: EvidaDocument[]) => void;
  onControlActionSubmitting?: (submitting: boolean) => void;
  onOpenSaksrom?: () => void;
}

type DocumentControlAction = "approve" | "start" | "reject" | "archive" | "openSaksrom";
type ActionPhase = "idle" | "preview_open" | "submitting" | "queued" | "processing" | "completed" | "failed";

interface ActionFeedback {
  phase: ActionPhase;
  message: string;
}

export function QuarantineGate({
  caseId,
  onAnalysisStatusChange,
  onDocumentsChange,
  onControlActionSubmitting,
  onOpenSaksrom
}: QuarantineGateProps) {
  const [documents, setDocuments] = useState<EvidaDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [prevBusy, setPrevBusy] = useState(false);
  const [loadedFromBackend, setLoadedFromBackend] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<EvidaDocument | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<string, ActionFeedback>>({});
  const { loading: authLoading, user } = useAuth();

  const applyDocuments = (nextDocuments: EvidaDocument[]) => {
    setDocuments(nextDocuments);
    onDocumentsChange?.(nextDocuments);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    return uploadQueue.subscribe((state) => {
      setQueueBusy(state.isBusy);
      if (prevBusy && !state.isBusy && state.completed > 0) {
        void fetchCaseDocuments(caseId, user.tenantId).then((nextDocs) => {
          applyDocuments(nextDocs);
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
          onDocumentsChange?.([]);
        setLoadedFromBackend(false);
        setError("Du må være autentisert før dokumenter kan lastes.");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const nextDocuments = await fetchCaseDocuments(caseId, user.tenantId);
        if (!cancelled) {
          applyDocuments(nextDocuments);
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

  const setDocumentFeedback = (documentId: string, feedback: ActionFeedback) => {
    setActionFeedback((current) => ({ ...current, [documentId]: feedback }));
  };

  const refreshDocuments = async () => {
    if (!user) {
      return [];
    }
    const nextDocuments = await fetchCaseDocuments(caseId, user.tenantId);
    applyDocuments(nextDocuments);
    return nextDocuments;
  };

  async function handleApprove(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan godkjennes.");
      return;
    }
    setIsProcessing(documentId);
    onControlActionSubmitting?.(true);
    setDocumentFeedback(documentId, { phase: "submitting", message: "Registrerer handling ..." });
    setError("");
    setSuccess("");
    try {
      await approveDocumentForIngestion(documentId, user.tenantId);
      setDocumentFeedback(documentId, { phase: "queued", message: "Dokumentet er godkjent for behandling." });
      await refreshDocuments();
      setSuccess("Dokumentet er godkjent for behandling.");
      setSelectedDocument(null);
    } catch (caught) {
      setDocumentFeedback(documentId, { phase: "failed", message: "Handlingen kunne ikke fullføres. Prøv igjen." });
      setError(caught instanceof Error ? caught.message : "Kunne ikke godkjenne kilde");
    } finally {
      setIsProcessing(null);
      onControlActionSubmitting?.(false);
    }
  }

  async function handleReject(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan avvises.");
      return;
    }
    setIsProcessing(documentId);
    onControlActionSubmitting?.(true);
    setDocumentFeedback(documentId, { phase: "submitting", message: "Registrerer handling ..." });
    setError("");
    try {
      await rejectDocument(documentId, user.tenantId, "Avvist fra karantene-sluse");
      setDocumentFeedback(documentId, { phase: "completed", message: "Handlingen er registrert." });
      await refreshDocuments();
      setSuccess("Dokument er avvist.");
      setSelectedDocument(null);
    } catch (caught) {
      setDocumentFeedback(documentId, { phase: "failed", message: "Handlingen kunne ikke fullføres. Prøv igjen." });
      setError(caught instanceof Error ? caught.message : "Kunne ikke avvise dokument");
    } finally {
      setIsProcessing(null);
      onControlActionSubmitting?.(false);
    }
  }

  async function handleArchive(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før dokumenter kan arkiveres.");
      return;
    }
    setIsProcessing(documentId);
    onControlActionSubmitting?.(true);
    setDocumentFeedback(documentId, { phase: "submitting", message: "Registrerer handling ..." });
    setError("");
    try {
      await archiveDocument(documentId, user.tenantId);
      setDocumentFeedback(documentId, { phase: "completed", message: "Handlingen er registrert." });
      await refreshDocuments();
      setSuccess("Dokument er arkivert.");
      setSelectedDocument(null);
    } catch (caught) {
      setDocumentFeedback(documentId, { phase: "failed", message: "Handlingen kunne ikke fullføres. Prøv igjen." });
      setError(caught instanceof Error ? caught.message : "Kunne ikke arkivere dokument");
    } finally {
      setIsProcessing(null);
      onControlActionSubmitting?.(false);
    }
  }

  async function handleIngest(documentId: string) {
    if (!user) {
      setError("Du må være autentisert før ingestion kan startes.");
      return;
    }
    setIsProcessing(documentId);
    onControlActionSubmitting?.(true);
    setDocumentFeedback(documentId, { phase: "submitting", message: "Registrerer handling ..." });
    setError("");
    setSuccess("");
    try {
      const results = await startBatchIngestion(user.tenantId, [documentId], caseId);
      const failed = results.find((result) => result.status === "FAILED");
      if (failed) {
        throw new Error(failed.error ?? "Ingestion feilet.");
      }
      onAnalysisStatusChange?.("processing");
      setDocumentFeedback(documentId, { phase: "queued", message: "Handling registrert. Dokumentet er satt i kø." });
      await refreshDocuments();
      setSuccess("Handling registrert. Dokumentet er satt i kø.");
      setSelectedDocument(null);
    } catch (caught) {
      onAnalysisStatusChange?.("failed");
      setDocumentFeedback(documentId, { phase: "failed", message: "Handlingen kunne ikke fullføres. Prøv igjen." });
      setError(caught instanceof Error ? caught.message : "Kunne ikke starte ingestion");
    } finally {
      setIsProcessing(null);
      onControlActionSubmitting?.(false);
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

  async function handleReplace(document: EvidaDocument, fileList: FileList | null) {
    const file = fileList?.item(0);
    if (!file) {
      return;
    }
    if (!user) {
      setError("Du mÃ¥ vÃ¦re autentisert fÃ¸r en dokumentversjon kan erstattes.");
      return;
    }

    setIsProcessing(document.id);
    onControlActionSubmitting?.(true);
    setError("");
    setSuccess("");
    setDocumentFeedback(document.id, {
      phase: "submitting",
      message: "Laster opp ny versjon og ugyldiggjÃ¸r gammelt kildegrunnlag ..."
    });
    try {
      const replacement = await replaceDocumentVersion(document.id, file, user.tenantId);
      await refreshDocuments();
      setSuccess(
        `Ny versjon ${replacement.versionNumber ?? ""} er lagt i karantene. Gammelt kildegrunnlag er ugyldiggjort.`
      );
      setSelectedDocument(null);
    } catch (caught) {
      setDocumentFeedback(document.id, {
        phase: "failed",
        message: "Dokumentet ble ikke erstattet."
      });
      setError(caught instanceof Error ? caught.message : "Kunne ikke erstatte dokumentversjonen");
    } finally {
      setIsProcessing(null);
      onControlActionSubmitting?.(false);
    }
  }

  const verifiedCount = documents.filter((document) => document.status === "verified" || document.status === "source_ready").length;
  const pendingDocuments = documents.filter((document) => document.status !== "verified");
  const statusLabel = (document: EvidaDocument) => {
    switch (document.status) {
      case "quarantine":
        return "I karantene";
      case "approved_for_ingestion":
        return "Klar for ingestion";
      case "ingesting":
        return "Ingestion pågår";
      case "processing":
        return "Behandler ...";
      case "ingestion_failed":
        return document.ingestionError ?? "Ingestion feilet";
      case "partial_source_ready":
        return "Foreløpig kildeklar";
      case "source_ready":
        return "Kildeklar";
      default:
        return "Behandles";
    }
  };

  const primaryActionFor = (document: EvidaDocument): DocumentControlAction | null => {
    if (document.status === "quarantine") {
      return "approve";
    }
    if (document.status === "approved_for_ingestion") {
      return "start";
    }
    if (document.status === "ingestion_failed") {
      return "start";
    }
    if (document.status === "partial_source_ready" || document.status === "source_ready") {
      return "openSaksrom";
    }
    return null;
  };

  const canArchive = (document: EvidaDocument) =>
    document.status === "quarantine" ||
    document.status === "approved_for_ingestion" ||
    document.status === "ingestion_failed";

  const actionLabel = (action: DocumentControlAction) => {
    switch (action) {
      case "approve":
        return "Godkjenn for ingestion";
      case "start":
        return "Start ingestion";
      case "reject":
        return "Avvis";
      case "archive":
        return "Arkiver";
      case "openSaksrom":
        return "Åpne Saksrom";
    }
  };

  const actionAriaLabel = (document: EvidaDocument, action: DocumentControlAction) => {
    switch (action) {
      case "approve":
        return `Godkjenn ${document.filename} for ingestion`;
      case "start":
        return `Start ingestion for ${document.filename}`;
      case "reject":
        return `Avvis ${document.filename}`;
      case "archive":
        return `Arkiver ${document.filename}`;
      case "openSaksrom":
        return `Åpne Saksrom for ${document.filename}`;
    }
  };

  const runDocumentAction = (document: EvidaDocument, action: DocumentControlAction) => {
    if (isProcessing === document.id) return;
    switch (action) {
      case "approve":
        void handleApprove(document.id);
        break;
      case "start":
        void handleIngest(document.id);
        break;
      case "reject":
        void handleReject(document.id);
        break;
      case "archive":
        void handleArchive(document.id);
        break;
      case "openSaksrom":
        setDocumentFeedback(document.id, { phase: "completed", message: "Åpner Saksrom med tilgjengelig kildegrunnlag." });
        setSelectedDocument(null);
        onOpenSaksrom?.();
        break;
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

            <button
              className="doc-preview-trigger"
              type="button"
              aria-label={`Åpne kontrollpreview for ${document.filename}`}
              onClick={() => {
                setSelectedDocument(document);
                setDocumentFeedback(document.id, actionFeedback[document.id] ?? {
                  phase: "preview_open",
                  message: "Forhåndsvisning åpnet."
                });
              }}
            >
              <h3 className="doc-title">{document.filename}</h3>
              <p className="doc-meta">
                {document.pages} {document.pages === 1 ? "side" : "sider"} •{" "}
                {statusLabel(document)}
              </p>
              {actionFeedback[document.id] ? (
                <span className={`doc-action-feedback phase-${actionFeedback[document.id].phase}`}>
                  {actionFeedback[document.id].message}
                </span>
              ) : (
                <span className="doc-preview-hint">Åpne forhåndsvisning før handling.</span>
              )}
            </button>

            <div className="doc-card-actions" aria-label={`Handlinger for ${document.filename}`}>
              {primaryActionFor(document) ? (
                <button
                  className="btn-approve"
                  type="button"
                  aria-label={actionAriaLabel(document, primaryActionFor(document)!)}
                  onClick={() => runDocumentAction(document, primaryActionFor(document)!)}
                  disabled={isProcessing === document.id}
                >
                  {isProcessing === document.id ? "Registrerer ..." : actionLabel(primaryActionFor(document)!)}
                </button>
              ) : null}
              {document.status === "quarantine" ? (
                <button
                  className="btn-approve"
                  type="button"
                  aria-label={`Avvis ${document.filename}`}
                  onClick={() => runDocumentAction(document, "reject")}
                  disabled={isProcessing === document.id}
                >
                  Avvis
                </button>
              ) : null}
              {canArchive(document) ? (
                <button
                  className="btn-approve"
                  type="button"
                  aria-label={actionAriaLabel(document, "archive")}
                  onClick={() => runDocumentAction(document, "archive")}
                  disabled={isProcessing === document.id}
                >
                  Arkiver
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {selectedDocument ? (
        <div className="control-preview-backdrop" role="presentation" onClick={() => setSelectedDocument(null)}>
          <section
            aria-labelledby="document-control-preview-title"
            aria-modal="true"
            className="control-preview-panel liquid-glass-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <span className="dash-eyebrow">Dokumentkontroll</span>
              <h2 id="document-control-preview-title">{selectedDocument.filename}</h2>
              <p>{statusLabel(selectedDocument)}</p>
            </header>
            <dl className="control-preview-details">
              <div>
                <dt>Sider</dt>
                <dd>{selectedDocument.pages || "Ukjent"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedDocument.status}</dd>
              </div>
              <div>
                <dt>Versjon</dt>
                <dd>{selectedDocument.versionNumber ?? 1}</dd>
              </div>
              <div>
                <dt>Hvorfor kreves handling?</dt>
                <dd>
                  {selectedDocument.status === "quarantine"
                    ? "Dokumentet ligger i karantene og må godkjennes før det kan behandles."
                    : selectedDocument.status === "approved_for_ingestion"
                    ? "Dokumentet er godkjent og kan settes i behandlingskø."
                    : selectedDocument.status === "ingestion_failed"
                    ? "Forrige behandling feilet. Kontroller feilen før du prøver igjen."
                    : "Dokumentet har en kontrollstatus som må gjennomgås."}
                </dd>
              </div>
              <div>
                <dt>Hva skjer ved handling?</dt>
                <dd>
                  {primaryActionFor(selectedDocument) === "approve"
                    ? "EVIDA registrerer godkjenningen og setter dokumentet opp for sikker ingestion."
                    : primaryActionFor(selectedDocument) === "start"
                    ? "EVIDA ber backend starte eksisterende ingestion-jobb for dette dokumentet."
                    : primaryActionFor(selectedDocument) === "openSaksrom"
                    ? "EVIDA åpner Saksrom med ferdige PageUnits. Uferdige sider forblir merket som foreløpig kildegrunnlag."
                    : "Ingen primær handling er tilgjengelig for denne statusen."}
                </dd>
              </div>
              {selectedDocument.ingestionError ? (
                <div>
                  <dt>Varsel</dt>
                  <dd>{selectedDocument.ingestionError}</dd>
                </div>
              ) : null}
            </dl>
            {actionFeedback[selectedDocument.id] ? (
              <p className={`control-preview-feedback phase-${actionFeedback[selectedDocument.id].phase}`} role="status">
                {actionFeedback[selectedDocument.id].message}
              </p>
            ) : null}
            <footer>
              <button className="btn-approve btn-secondary" type="button" onClick={() => setSelectedDocument(null)}>
                Lukk
              </button>
              <label className="btn-approve btn-secondary">
                Erstatt med ny versjon
                <input
                  accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  aria-label={`Erstatt ${selectedDocument.filename} med ny versjon`}
                  className="control-preview-file-input"
                  disabled={isProcessing === selectedDocument.id}
                  type="file"
                  onChange={(event) => void handleReplace(selectedDocument, event.currentTarget.files)}
                />
              </label>
              {primaryActionFor(selectedDocument) ? (
                <button
                  className="btn-approve"
                  type="button"
                  onClick={() => runDocumentAction(selectedDocument, primaryActionFor(selectedDocument)!)}
                  disabled={isProcessing === selectedDocument.id}
                >
                  {isProcessing === selectedDocument.id
                    ? "Registrerer handling ..."
                    : actionLabel(primaryActionFor(selectedDocument)!)}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
