import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchCaseDocuments,
  fetchIngestionJobsByDocumentIds,
  retryIngestionJob,
  approveDocumentForIngestion,
  startBatchIngestion,
  downloadDocumentUrl,
  EvidaDocument,
  IngestionJobResponse
} from "../lib/api";
import { uploadQueue, QueueState, QueueItem } from "../lib/uploadQueue";
import "./DocumentImport.css";

interface DocumentImportProps {
  caseId: string;
  onAnalysisStatusChange?: (status: string) => void;
  onContinueToSaksrom?: () => void;
  pollIntervalMs?: number;
}

// Utility to chunk arrays
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const countPagesInSpec = (spec: string | null | undefined): number => {
  if (!spec?.trim()) {
    return 0;
  }
  return spec.split(",").reduce((count, token) => {
    const trimmed = token.trim();
    if (!trimmed) {
      return count;
    }
    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-", 2);
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      return Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? count + end - start + 1
        : count;
    }
    return Number.isFinite(Number.parseInt(trimmed, 10)) ? count + 1 : count;
  }, 0);
};

const warningValue = (warning: string, key: string): string | null => {
  const match = warning.match(new RegExp(`(?:^|\\s)${key}=([0-9,\\-]+)`));
  return match?.[1] ?? null;
};

const formatPartialCoverageDetails = (
  doc: EvidaDocument,
  job?: IngestionJobResponse
): string => {
  const warning = job?.errorMessage || doc.ingestionError || "";
  const missingOcrPages = countPagesInSpec(warningValue(warning, "pages"));
  const belowThresholdPages = countPagesInSpec(warningValue(warning, "text_below_threshold"));
  const readyPages = job?.pagesProcessed ?? Math.max(0, (doc.pages || 0) - missingOcrPages - belowThresholdPages);
  const totalPages = job?.pagesTotal || doc.pages || readyPages + missingOcrPages + belowThresholdPages;
  const parts = [`${readyPages}/${totalPages || "?"} sider klare`];
  if (missingOcrPages > 0) {
    parts.push(`${missingOcrPages} sider krever OCR`);
  }
  if (belowThresholdPages > 0) {
    parts.push(`${belowThresholdPages} side${belowThresholdPages === 1 ? "" : "r"} krever kontroll`);
  }
  if (parts.length === 1) {
    parts.push("Noen sider krever OCR");
  }
  return `${parts.join(". ")}.`;
};

export function DocumentImport({ caseId, onAnalysisStatusChange, onContinueToSaksrom, pollIntervalMs = 3000 }: DocumentImportProps) {
  const { user, loading } = useAuth();
  const tenantId = user?.tenantId || "";

  // Upload Queue State
  const [queueState, setQueueState] = useState<QueueState>(() => uploadQueue.getState());
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // Ingestion Tracking State
  const [documents, setDocuments] = useState<EvidaDocument[]>([]);
  const [jobs, setJobs] = useState<Record<string, IngestionJobResponse>>({});
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);
  const [problemDoc, setProblemDoc] = useState<EvidaDocument | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Subscribe to Upload Queue
  useEffect(() => {
    uploadQueue.setContext(tenantId, caseId);
    return uploadQueue.subscribe((state) => {
      setQueueState(state);
    });
  }, [tenantId, caseId]);

  // Refresh documents when caseId or tenantId changes
  useEffect(() => {
    void refreshDocuments();
    return () => {
      stopPolling();
    };
  }, [caseId, tenantId]);

  // Refresh documents and trigger polling if active uploads finish
  useEffect(() => {
    if (queueState.completed > 0 && !queueState.isBusy) {
      void refreshDocuments();
    }
  }, [queueState.completed, queueState.isBusy]);

  const refreshDocuments = async () => {
    if (!tenantId || !caseId) return;
    setLoadingDocs(true);
    setActionError(null);
    try {
      const docs = await fetchCaseDocuments(caseId, tenantId);
      setDocuments(docs);

      // Check ingestion jobs for non-ready / non-failed-safe documents
      const activeOrFailedDocs = docs.filter(
        (d) => d.status !== "verified" && d.status !== "source_ready"
      );

      if (activeOrFailedDocs.length > 0) {
        await refreshIngestionJobs(activeOrFailedDocs.map((d) => d.id));
      }
    } catch (err: any) {
      setActionError(err?.message || "Kunne ikke hente dokumenter.");
    } finally {
      setLoadingDocs(false);
    }
  };

  const refreshIngestionJobs = async (docIds: string[]) => {
    if (!tenantId || docIds.length === 0) return;

    try {
      const chunkedIds = chunkArray(docIds, 200);
      let allJobs: IngestionJobResponse[] = [];
      for (const batch of chunkedIds) {
        const batchJobs = await fetchIngestionJobsByDocumentIds(batch, tenantId, caseId);
        allJobs = [...allJobs, ...batchJobs];
      }

      setJobs((prev) => {
        const next = { ...prev };
        allJobs.forEach((job) => {
          next[job.documentId] = job;
        });
        return next;
      });

      // Start/adjust polling loop based on active jobs
      const hasActive = allJobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");
      if (hasActive) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch (err) {
      console.error("Kunne ikke hente ingestion-jobber", err);
    }
  };

  // 2. Polling loop
  const startPolling = () => {
    if (pollTimeoutRef.current) return;

    const poll = async () => {
      if (document.visibilityState === "hidden") {
        // Yield/pause when tab is hidden
        pollTimeoutRef.current = setTimeout(poll, pollIntervalMs);
        return;
      }

      if (!tenantId) {
        stopPolling();
        return;
      }

      // Gather document IDs that are pending or running in ingestion jobs
      const activeDocIds = Object.values(jobsRef.current)
        .filter((job) => job.status === "PENDING" || job.status === "RUNNING")
        .map((job) => job.documentId);

      if (activeDocIds.length === 0) {
        stopPolling();
        // Refresh document list to reflect final statuses (Kildeklar / Ingestion feilet)
        void refreshDocuments();
        return;
      }

      try {
        const chunkedIds = chunkArray(activeDocIds, 200);
        let updatedJobs: IngestionJobResponse[] = [];
        for (const batch of chunkedIds) {
          const batchJobs = await fetchIngestionJobsByDocumentIds(batch, tenantId, caseId);
          updatedJobs = [...updatedJobs, ...batchJobs];
        }

        setJobs((prev) => {
          const next = { ...prev };
          updatedJobs.forEach((job) => {
            next[job.documentId] = job;
          });
          return next;
        });

        // If any job completed or changed status, notify parent
        const anyCompleted = updatedJobs.some((j) => j.status === "COMPLETED");
        if (anyCompleted) {
          onAnalysisStatusChange?.("completed");
        }

        // If all are now terminal
        const stillActive = updatedJobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");
        if (!stillActive) {
          stopPolling();
          void refreshDocuments();
        } else {
          pollTimeoutRef.current = setTimeout(poll, pollIntervalMs);
        }
      } catch (err) {
        console.error("Feil under polling av ingestion-jobber", err);
        pollTimeoutRef.current = setTimeout(poll, pollIntervalMs);
      }
    };

    pollTimeoutRef.current = setTimeout(poll, pollIntervalMs);
  };

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  // Visibility change listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Check if there are active jobs to poll
        const hasActive = Object.values(jobs).some((j) => j.status === "PENDING" || j.status === "RUNNING");
        if (hasActive) {
          startPolling();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [jobs]);

  if (loading) {
    return (
      <div className="document-import-workspace">
        <div className="workspace-header">
          <h1>Dokumentinntak</h1>
          <p>Laster sesjon...</p>
        </div>
      </div>
    );
  }



  // Translate error messages and suggest actions
  const translateError = (errorMsg: string | null | undefined): string => {
    if (!errorMsg) return "Ukjent feil.";
    const err = String(errorMsg);
    if (err.includes("PDF_PARSE_FAILED") || err.includes("UNSUPPORTED_DOCUMENT_TYPE_FOR_INGESTION")) {
      return "PDF-en kunne ikke leses";
    }
    if (err.includes("OCR_RUNTIME_UNAVAILABLE")) {
      return "OCR-motor mangler eller er ikke riktig konfigurert";
    }
    if (err.includes("PARTIAL_OCR_RUNTIME_MISSING")) {
      return "Noen sider krever OCR. Tekstsider er klare som foreløpig kildegrunnlag.";
    }
    if (err.includes("MISSING_TEXT") || err.includes("PAGE_TEXT_BELOW_THRESHOLD") || err.includes("OCR_TEXT_BELOW_THRESHOLD")) {
      return "Dokumentet mangler lesbar tekst";
    }
    if (err.includes("OCR error") || err.includes("OCR_ERROR") || err.includes("OCR-feil")) {
      return "OCR-feil på side 3";
    }
    return "Behandling feilet";
  };

  const suggestedAction = (errorMsg: string | null | undefined): string => {
    if (!errorMsg) return "Vennligst prøv å starte behandlingen på nytt. Hvis problemet vedvarer, ta kontakt med systemadministrator.";
    const err = String(errorMsg);
    if (err.includes("PDF_PARSE_FAILED") || err.includes("UNSUPPORTED_DOCUMENT_TYPE_FOR_INGESTION")) {
      return "Dette dokumentet kunne ikke leses som PDF. Kontroller at filen ikke er skadet, kryptert, eller passordbeskyttet.";
    }
    if (err.includes("OCR_RUNTIME_UNAVAILABLE")) {
      return "Dette dokumentet ser ut til å kreve OCR, men OCR-motoren er ikke tilgjengelig.";
    }
    if (err.includes("MISSING_TEXT") || err.includes("PAGE_TEXT_BELOW_THRESHOLD") || err.includes("OCR_TEXT_BELOW_THRESHOLD")) {
      return "Kontroller at dokumentet inneholder faktisk tekst og ikke bare tomme sider eller lavoppløselige bilder.";
    }
    if (err.includes("OCR error") || err.includes("OCR_ERROR") || err.includes("OCR-feil")) {
      return "En feil oppstod under OCR-tekstgjenkjenning. Vennligst kontroller bildekvaliteten på dokumentet og prøv igjen.";
    }
    return "Prøv å starte behandlingen på nytt. Hvis feilen vedvarer, sjekk om dokumentet er gyldig.";
  };

  const handleOpenDocument = async (docId: string) => {
    if (!tenantId) return;
    setActionError(null);
    try {
      const url = await downloadDocumentUrl(docId, tenantId);
      window.open(url, "_blank");
      // Revoking immediately can abort the new tab's load of the blob URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      setActionError(err?.message || "Kunne ikke åpne dokumentet.");
    }
  };

  // 3. User Actions
  const handleStartIngest = async (docId: string) => {
    if (!tenantId) return;
    setProcessingDocId(docId);
    setActionError(null);
    setActionSuccess(null);
    try {
      // Approve queues an async ingestion job; the worker claims it and the status list
      // below polls progress. The old synchronous /ingest endpoint is retired (410 Gone).
      await approveDocumentForIngestion(docId, tenantId);

      setActionSuccess("Dokument godkjent — ingestion-jobb er satt i kø.");
      void refreshDocuments();
    } catch (err: any) {
      setActionError(err?.message || "Kunne ikke starte ingestion.");
    } finally {
      setProcessingDocId(null);
    }
  };

  const handleStartBatchIngest = async (docIds: string[]) => {
    if (!tenantId || docIds.length === 0) return;
    setProcessingDocId("batch-all");
    setActionError(null);
    setActionSuccess(null);
    try {
      const results = await startBatchIngestion(tenantId, docIds, caseId);
      const failed = results.filter(r => r.status === "FAILED");
      const successCount = results.length - failed.length;
      
      if (failed.length > 0) {
        setActionError(`${failed.length} dokumenter kunne ikke behandles. Se detaljer.`);
      }
      if (successCount > 0) {
        setActionSuccess(`${successCount} dokumenter er satt i behandlingskø.`);
      }
      void refreshDocuments();
    } catch (err: any) {
      setActionError(err?.message || "Kunne ikke starte batch-behandling.");
    } finally {
      setProcessingDocId(null);
    }
  };

  const handleRetryJob = async (docId: string, jobId: string) => {
    if (!tenantId) return;
    setProcessingDocId(docId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await retryIngestionJob(jobId, tenantId, caseId);
      setActionSuccess("Ingestion-jobb sendt til gjentatt forsøk.");
      void refreshDocuments();
    } catch (err: any) {
      setActionError(err?.message || "Kunne ikke starte jobb på nytt.");
    } finally {
      setProcessingDocId(null);
    }
  };

  // 4. File Drag and Drop Traversal
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items) {
      const files: File[] = [];
      const entries: FileSystemEntry[] = [];

      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }

      if (entries.length > 0) {
        const traversedFiles = await traverseEntries(entries);
        uploadQueue.addFiles(traversedFiles);
      }
    } else if (e.dataTransfer.files) {
      uploadQueue.addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const traverseEntries = async (entries: FileSystemEntry[]): Promise<File[]> => {
    const files: File[] = [];

    const traverse = async (entry: FileSystemEntry) => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        files.push(file);
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();

        const readAllEntries = async (): Promise<FileSystemEntry[]> => {
          let allResults: FileSystemEntry[] = [];
          const readBatch = async (): Promise<void> => {
            const results = await new Promise<FileSystemEntry[]>((resolve, reject) => {
              reader.readEntries(resolve, reject);
            });
            if (results.length > 0) {
              allResults = [...allResults, ...results];
              // Yield to event loop to avoid UI freezing
              await new Promise((resolve) => setTimeout(resolve, 0));
              await readBatch();
            }
          };
          await readBatch();
          return allResults;
        };

        const subEntries = await readAllEntries();
        for (const subEntry of subEntries) {
          await traverse(subEntry);
        }
      }
    };

    for (const entry of entries) {
      await traverse(entry);
    }

    return files;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadQueue.addFiles(Array.from(e.target.files));
    }
  };

  // Group completed items to avoid rendering too many live DOM rows
  const completedItems = queueState.items.filter(
    (x) => x.status === "QUARANTINE" || x.status === "SKIPPED_DUPLICATE"
  );
  const activeOrFailedItems = queueState.items.filter(
    (x) => x.status !== "QUARANTINE" && x.status !== "SKIPPED_DUPLICATE"
  );

  const getStatusText = (status: string) => {
    switch (status) {
      case "QUEUED":
        return "I kø";
      case "HASHING":
        return "Beregner hash...";
      case "DUPLICATE_CHECK":
        return "Sjekker duplikater...";
      case "SKIPPED_DUPLICATE":
        return "Duplikat (Hoppet over)";
      case "UPLOADING":
        return "Laster opp...";
      case "QUARANTINE":
        return "Karantene";
      case "FAILED":
        return "Feilet";
      case "CANCELLED":
        return "Avbrutt";
      default:
        return "Ukjent";
    }
  };

  const sourceReadyCount = documents.filter(
    (d) => d.status === "source_ready" || d.status === "verified" || d.status === "partial_source_ready"
  ).length;
  const pendingBasisCount = documents.filter(
    (d) => d.status === "quarantine" || d.status === "approved_for_ingestion" || d.status === "ingesting" || d.status === "processing"
  ).length;
  const failedBasisCount = documents.filter((d) => d.status === "ingestion_failed" || d.status === "rejected").length;
  const coverage = documents.length > 0 ? Math.round((sourceReadyCount / documents.length) * 100) : 0;
  const canContinueToSaksrom = Boolean(onContinueToSaksrom) && documents.length > 0;

  return (
    <div className="document-import-workspace">
      <div className="workspace-header">
        <h1>Dokumentinntak</h1>
        <p>Last opp dokumenter til karantene-slusen. De vil hashes og sjekkes for duplikater før de sendes til prosessering.</p>
      </div>

      {/* Main Upload Dropzone */}
      <div
        className={`dropzone-container liquid-glass-panel ${isDragActive ? "drag-active" : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <div className="dropzone-content">
          <svg className="upload-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h3>Slipp filer eller mapper her</h3>
          <p>Støtter PDF, DOCX, TXT, PNG, JPG</p>
          <div className="picker-actions">
            <label className="picker-btn">
              Velg filer
              <input id="select-files-input" type="file" multiple onChange={handleFileChange} style={{ display: "none" }} />
            </label>
            <label className="picker-btn">
              Velg mappe
              <input
                id="select-folder-input"
                type="file"
                {...{ webkitdirectory: "", directory: "" }}
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Upload Queue Panel */}
      {(queueState.total > 0 || queueState.ignoredSystemFiles > 0 || queueState.rejectedFiles.length > 0) && (
        <section className="queue-section liquid-glass-panel" aria-label="Opplastingskø">
          <div className="queue-header">
            <h3>Opplastingskø</h3>
            {queueState.isBusy && (
              <button className="btn-cancel-all" onClick={() => uploadQueue.cancelAll()}>
                Avbryt alle
              </button>
            )}
            <button className="btn-clear-queue" onClick={() => uploadQueue.clearQueue()}>
              Tøm liste
            </button>
          </div>

          <div className="queue-summary-line">
            <span>
              {queueState.completed} av {queueState.total} i karantene ·{" "}
              {queueState.skippedDuplicate} duplikater hoppet over ·{" "}
              {queueState.failed} feilet · {queueState.remaining} gjenstår
            </span>
            {queueState.ignoredSystemFiles > 0 && (
              <span className="system-files-badge">
                {queueState.ignoredSystemFiles} systemfil{queueState.ignoredSystemFiles === 1 ? "" : "er"} ignorert
              </span>
            )}
          </div>

          {/* Rejected Files Summary */}
          {queueState.rejectedFiles.length > 0 && (
            <div className="rejected-files-box">
              <strong>{queueState.rejectedFiles.length} fil{queueState.rejectedFiles.length === 1 ? "" : "er"} avvist:</strong>
              <ul>
                {queueState.rejectedFiles.slice(0, 5).map((f, idx) => (
                  <li key={idx}>
                    {f.name}: {f.reason}
                  </li>
                ))}
                {queueState.rejectedFiles.length > 5 && (
                  <li>... og {queueState.rejectedFiles.length - 5} til.</li>
                )}
              </ul>
            </div>
          )}

          <div className="queue-list">
            {/* Expanded active / failed rows */}
            {activeOrFailedItems.map((item) => (
              <div key={item.id} className={`queue-row status-${item.status.toLowerCase()}`}>
                <div className="row-info">
                  <span className="file-name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="file-size">
                    {(item.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                <div className="row-status-wrapper">
                  <span className="status-label">{getStatusText(item.status)}</span>
                  {item.status === "FAILED" && item.errorMessage && (
                    <span className="error-message" title={item.errorMessage}>
                      {item.errorMessage}
                    </span>
                  )}
                  {(item.status === "HASHING" || item.status === "UPLOADING") && (
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${item.progress}%` }} />
                      <span className="progress-percentage">{item.progress}%</span>
                    </div>
                  )}
                </div>

                <div className="row-actions">
                  {item.status === "FAILED" && (
                    <button className="btn-row-action" onClick={() => uploadQueue.retryFile(item.id)}>
                      Prøv igjen
                    </button>
                  )}
                  {(item.status === "QUEUED" ||
                    item.status === "HASHING" ||
                    item.status === "DUPLICATE_CHECK" ||
                    item.status === "UPLOADING") && (
                    <button className="btn-row-action btn-row-cancel" onClick={() => uploadQueue.cancelFile(item.id)}>
                      Avbryt
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Collapsed completed items */}
            {completedItems.length > 0 && (
              <div className="collapsed-completed-summary">
                <button
                  className="toggle-completed-btn"
                  onClick={() => setShowQueueDetails(!showQueueDetails)}
                >
                  {showQueueDetails ? "Skjul" : "Vis"} {completedItems.length} fullførte filer og duplikater
                </button>
                {showQueueDetails && (
                  <div className="completed-details-list">
                    {completedItems.map((item) => (
                      <div key={item.id} className="completed-detail-row">
                        <span className="file-name">{item.name}</span>
                        <span className={`status-tag ${item.status.toLowerCase()}`}>
                          {item.status === "SKIPPED_DUPLICATE" ? "Duplikat" : "Lastet opp"}
                        </span>
                        {item.status === "SKIPPED_DUPLICATE" && item.duplicateDocRef && (
                          <span className="dup-ref">Ref ID: {item.duplicateDocRef.slice(0, 8)}...</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ingestion Jobs / Documents List */}
      <section className="documents-section liquid-glass-panel" aria-label="Dokumenter i saken">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>Behandlingsstatus for kildegrunnlag</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="btn-primary btn-bulk-start"
              disabled={documents.filter(d => d.status === "quarantine").length === 0 || processingDocId === "batch-all"}
              onClick={() => void handleStartBatchIngest(documents.filter(d => d.status === "quarantine").map(d => d.id))}
              style={{
                background: documents.filter(d => d.status === "quarantine").length === 0 ? "rgba(255, 255, 255, 0.05)" : "var(--primary)",
                color: documents.filter(d => d.status === "quarantine").length === 0 ? "rgba(255, 255, 255, 0.3)" : "black",
                cursor: documents.filter(d => d.status === "quarantine").length === 0 ? "not-allowed" : "pointer",
                padding: "6px 12px",
                border: "none",
                borderRadius: "4px",
                fontWeight: 600,
                fontSize: "0.9rem"
              }}
              title={documents.filter(d => d.status === "quarantine").length === 0 ? "Ingen dokumenter er klare for behandling." : undefined}
            >
              {documents.filter(d => d.status === "quarantine").length === 0 ? "Ingen dokumenter klare for behandling" : `Start behandling av ${documents.filter(d => d.status === "quarantine").length} dokumenter`}
            </button>
            <button className="btn-refresh" onClick={() => void refreshDocuments()} disabled={loadingDocs}>
              {loadingDocs ? "Oppdaterer..." : "Oppdater"}
            </button>
          </div>
        </div>

        {canContinueToSaksrom ? (
          <div className="preliminary-saksrom-action" aria-label="Foreløpig Saksrom-handling">
            <div>
              <strong>Arbeidet kan fortsette mens kildegrunnlaget oppdateres.</strong>
              <span>
                {sourceReadyCount} av {documents.length} dokumenter er klart som kildegrunnlag for de dokumentene som er ferdig behandlet.
                {pendingBasisCount > 0 ? ` ${pendingBasisCount} dokumenter er fortsatt under behandling eller i karantene.` : ""}
                {failedBasisCount > 0 ? ` ${failedBasisCount} dokumenter krever kontroll.` : ""}
              </span>
            </div>
            <button
              className="btn-preliminary-saksrom"
              onClick={onContinueToSaksrom}
              type="button"
            >
              Fortsett til Saksrom med foreløpig kildegrunnlag
            </button>
            <small>Kildedekning: {coverage}%</small>
          </div>
        ) : null}

        {actionError && <div className="notice error-notice">{actionError}</div>}
        {actionSuccess && <div className="notice success-notice">{actionSuccess}</div>}

        {documents.length === 0 && !loadingDocs ? (
          <p className="no-docs-message">Ingen dokumenter er registrert i denne saken enda. Last opp filer for å starte.</p>
        ) : (
          <div className="docs-table-wrapper">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Dokument</th>
                  <th>Status</th>
                  <th>Prosesserte sider</th>
                  <th>Detaljer / Handlinger</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const job = jobs[doc.id];
                  const isProcessing = processingDocId === doc.id;

                  let displayStatus: string = doc.status;
                  let detailsText = "";
                  let showRetry = false;
                  let showStart = false;

                  if (doc.status === "quarantine") {
                    displayStatus = "I karantene";
                    detailsText = "Venter på godkjenning for prosessering";
                    showStart = true;
                  } else if (doc.status === "approved_for_ingestion") {
                    displayStatus = "Godkjent";
                    detailsText = "Klar til prosessering";
                    showStart = true;
                  } else if (doc.status === "ingesting") {
                    displayStatus = "Behandles nå";
                    if (job) {
                      detailsText = `Side ${job.pagesProcessed} av ${job.pagesTotal || "?"}`;
                    } else {
                      detailsText = "Starter prosessering...";
                    }
                  } else if (doc.status === "ingestion_failed") {
                    displayStatus = "Behandling feilet";
                    detailsText = translateError(doc.ingestionError || job?.errorMessage);
                    showRetry = true;
                  } else if (doc.status === "partial_source_ready") {
                    displayStatus = "Delvis kildeklart";
                    detailsText = formatPartialCoverageDetails(doc, job);
                    showRetry = Boolean(job?.id);
                  } else if (doc.status === "source_ready") {
                    displayStatus = "Klar som kildegrunnlag";
                    detailsText = "Klar for AI-analyse";
                  } else if (doc.status === "verified") {
                    displayStatus = "Verifisert";
                    detailsText = "Godkjent kildegrunnlag";
                  }

                  // If job status is active but doc status is laggy
                  if (job && (job.status === "PENDING" || job.status === "RUNNING")) {
                    displayStatus = job.status === "PENDING" ? "Venter på behandling" : "Behandles nå";
                    detailsText = `Side ${job.pagesProcessed} av ${job.pagesTotal || "?"}`;
                    showStart = false;
                    showRetry = false;
                  } else if (job && job.status === "FAILED") {
                    displayStatus = "Behandling feilet";
                    detailsText = translateError(job.errorMessage);
                    showRetry = true;
                    showStart = false;
                  } else if (job && job.status === "COMPLETED_WITH_WARNINGS") {
                    displayStatus = "Delvis kildeklart";
                    detailsText = formatPartialCoverageDetails(doc, job);
                    showRetry = true;
                    showStart = false;
                  }

                  return (
                    <tr key={doc.id} className={`doc-row status-${doc.status}`}>
                      <td className="doc-name-cell">
                        <div className="doc-indicator" />
                        <span className="doc-filename" title={doc.filename}>
                          {doc.filename}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill status-${doc.status}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td>{job ? `${job.pagesProcessed}/${job.pagesTotal || "?"}` : doc.pages || "-"}</td>
                      <td className="doc-action-cell">
                        <span className="details-text">{detailsText}</span>
                        {showStart && (
                          <button
                            className="btn-table-action btn-start"
                            disabled={isProcessing}
                            onClick={() => void handleStartIngest(doc.id)}
                          >
                            {isProcessing ? "Starter..." : "Start behandling"}
                          </button>
                        )}
                        {showRetry && job && (
                          <button
                            className="btn-table-action btn-retry"
                            disabled={isProcessing}
                            onClick={() => void handleRetryJob(doc.id, job.id)}
                          >
                            {isProcessing ? "Prøver..." : "Prøv igjen"}
                          </button>
                        )}
                        {(doc.status === "ingestion_failed" || (job && job.status === "FAILED")) && (
                          <button
                            className="btn-table-action btn-show-problem"
                            onClick={() => {
                              setProblemDoc(doc);
                              setShowTechnicalDetails(false);
                            }}
                            style={{ marginLeft: "8px" }}
                          >
                            Vis problem
                          </button>
                        )}
                        {(doc.status === "quarantine" || doc.status === "approved_for_ingestion" || doc.status === "ingesting") && (
                          <button
                            className="btn-table-action btn-open-doc"
                            onClick={() => void handleOpenDocument(doc.id)}
                            style={{ marginLeft: "8px" }}
                          >
                            Åpne dokument
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {problemDoc && (
        <div className="modal-backdrop" onClick={() => setProblemDoc(null)} style={{ zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)" }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', padding: '2rem', background: "var(--evida-space-card)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="modal-header">
              <span className="modal-kicker" style={{ color: "var(--evida-status-danger)", fontSize: "0.85rem", textTransform: "uppercase" }}>Feil ved dokumentbehandling</span>
              <h2 style={{ fontSize: "1.5rem", marginTop: "0.25rem", color: "white" }}>{problemDoc.filename}</h2>
            </div>
            <div style={{ marginTop: '1rem', color: '#cbd5e1' }}>
              <p style={{ fontWeight: 500, color: '#f8fafc', fontSize: "1.1rem" }}>
                {translateError(problemDoc.ingestionError || jobs[problemDoc.id]?.errorMessage)}
              </p>
              
              <div style={{ marginTop: '1.5rem' }}>
                <strong>Anbefalt handling:</strong>
                <p style={{ marginTop: '0.25rem', fontSize: '0.95rem', color: '#94a3b8' }}>
                  {suggestedAction(problemDoc.ingestionError || jobs[problemDoc.id]?.errorMessage)}
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.9rem',
                    textDecoration: 'underline'
                  }}
                >
                  {showTechnicalDetails ? "Skjul tekniske detaljer" : "Vis tekniske detaljer"}
                </button>
                {showTechnicalDetails && (
                  <pre style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    overflowX: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {problemDoc.ingestionError || jobs[problemDoc.id]?.errorMessage || "Ingen teknisk feilkode tilgjengelig."}
                  </pre>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: '2rem', display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button className="cancel-btn" onClick={() => setProblemDoc(null)} type="button" style={{ padding: "8px 16px", borderRadius: "4px", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "none", color: "white" }}>
                Lukk
              </button>
              {(problemDoc.status === "ingestion_failed" || (jobs[problemDoc.id] && jobs[problemDoc.id].status === "FAILED")) && (
                <button
                  className="confirm-btn"
                  onClick={() => {
                    const job = jobs[problemDoc.id];
                    if (job) {
                      void handleRetryJob(problemDoc.id, job.id);
                    } else {
                      void handleStartIngest(problemDoc.id);
                    }
                    setProblemDoc(null);
                  }}
                  type="button"
                  style={{ padding: "8px 16px", borderRadius: "4px", cursor: "pointer", background: "var(--primary)", border: "none", color: "black", fontWeight: 600 }}
                >
                  Prøv igjen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
