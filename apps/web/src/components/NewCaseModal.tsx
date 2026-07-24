import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useEffect, useRef, useState } from "react";
import { SUPPORTED_UPLOAD_ACCEPT, SUPPORTED_UPLOAD_HELP_TEXT } from "../lib/uploadPolicy";
import { prepareDroppedUpload, prepareUploadFiles, suggestedCaseNameForFiles } from "../lib/uploadPreparation";
import "./NewCaseModal.css";
import "../styles/modals.css";

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    caseName: string,
    files?: File[],
    onProgress?: (phase: CreationPhase) => void
  ) => Promise<void> | void;
}

export type CreationPhase = "creating_case" | "registering_documents" | "starting_source_basis" | "opening_intake";

const creationSteps: Array<{ phase: CreationPhase; label: string }> = [
  { phase: "creating_case", label: "Oppretter sak" },
  { phase: "registering_documents", label: "Registrerer dokumenter" },
  { phase: "starting_source_basis", label: "Starter kildegrunnlag" },
  { phase: "opening_intake", label: "Åpner dokumentinntak" }
];

export function NewCaseModal({ isOpen, onClose, onCreate }: NewCaseModalProps) {
  const [caseName, setCaseName] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [fileError, setFileError] = useState("");
  const [creationPhase, setCreationPhase] = useState<CreationPhase | null>(null);
  const [pendingCreation, setPendingCreation] = useState<{ name: string; files: File[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) {
      setCaseName("");
      setIsDragActive(false);
      setIsPreparing(false);
      setFileError("");
      setCreationPhase(null);
      setPendingCreation(null);
      document.body.classList.remove("evida-modal-open");
      return;
    }

    document.body.classList.add("evida-modal-open");
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("evida-modal-open");
    };
  }, [isOpen, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = caseName.trim();
    if (trimmedName) void submitCreation(trimmedName, []);
  }

  async function submitCreation(name: string, files: File[]) {
    const request = { name: name.trim() || "Ny sak", files };
    setPendingCreation(request);
    setFileError("");
    setIsPreparing(true);
    setCreationPhase("creating_case");
    try {
      await onCreate(request.name, request.files, setCreationPhase);
      setIsPreparing(false);
      setPendingCreation(null);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Saken ble opprettet, men dokumentinntaket må prøves på nytt.");
      setIsPreparing(false);
    }
  }

  async function createFromFiles(files: File[], suggestedName: string) {
    setIsPreparing(true);
    setFileError("");
    const prepared = await prepareUploadFiles(files);
    if (prepared.files.length === 0) {
      setFileError(prepared.rejected[0]?.reason ?? "Fant ingen støttede dokumenter.");
      setIsPreparing(false);
      return;
    }
    await submitCreation((caseName.trim() || suggestedName || "Ny sak").trim(), prepared.files);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    setIsPreparing(true);
    setFileError("");
    const prepared = await prepareDroppedUpload(event.dataTransfer);
    if (prepared.files.length === 0) {
      setFileError(prepared.rejected[0]?.reason ?? "Fant ingen støttede dokumenter.");
      setIsPreparing(false);
      return;
    }
    await submitCreation((caseName.trim() || prepared.suggestedCaseName || "Ny sak").trim(), prepared.files);
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length > 0) void createFromFiles(files, suggestedCaseNameForFiles(files));
    event.currentTarget.value = "";
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="modal-backdrop new-case-backdrop" role="presentation" onMouseDown={onClose}>
          <motion.form
            aria-labelledby="new-case-title"
            aria-modal="true"
            className="modal-container new-case-modal"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 10 }}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            role="dialog"
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="modal-header">
              <span className="modal-kicker">Ny juridisk arbeidsflyt</span>
              <h2 id="new-case-title">Ny sak</h2>
              <p>Slipp dokumenter her for å opprette sak og starte dokumentinntak.</p>
            </div>

            <div className="modal-actions-area">
              <label className="new-case-name-field">
                <span>Eller skriv saksnavn</span>
                <input
                ref={inputRef}
                aria-label="Navn på saken"
                className="modal-input"
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="Valgfritt navn, f.eks. Holands Hage"
                type="text"
                value={caseName}
                />
              </label>

              <div
                className={`new-case-dropzone ${isDragActive ? "new-case-dropzone--active" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void handleDrop(event)}
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6H16a5 5 0 011 9.9M15 13l-3-3m0 0-3 3m3-3v10" />
                </svg>
                <strong>{isPreparing ? "Klargjør saken …" : "Slipp dokumenter her for å opprette sak og starte dokumentinntak"}</strong>
                <span>{SUPPORTED_UPLOAD_HELP_TEXT}</span>
                <div className="new-case-dropzone__actions">
                  <label>
                    Velg filer
                    <input accept={SUPPORTED_UPLOAD_ACCEPT} disabled={isPreparing} multiple onChange={handleFileSelection} type="file" />
                  </label>
                  <label>
                    Velg mappe
                    <input
                      accept={SUPPORTED_UPLOAD_ACCEPT}
                      disabled={isPreparing}
                      multiple
                      onChange={handleFileSelection}
                      type="file"
                      {...{ webkitdirectory: "", directory: "" }}
                    />
                  </label>
                </div>
              </div>

              {fileError ? <p className="new-case-dropzone__error" role="alert">{fileError}</p> : null}

              {creationPhase ? (
                <ol className="new-case-progress" aria-label="Fremdrift for ny sak">
                  {creationSteps.map((step) => {
                    const activeIndex = creationSteps.findIndex((candidate) => candidate.phase === creationPhase);
                    const stepIndex = creationSteps.findIndex((candidate) => candidate.phase === step.phase);
                    return <li className={stepIndex < activeIndex ? "complete" : step.phase === creationPhase ? "active" : ""} key={step.phase}>{step.label}</li>;
                  })}
                </ol>
              ) : null}

              <div className="modal-footer">
                <button className="cancel-btn" onClick={onClose} type="button">Avbryt</button>
                {fileError && pendingCreation ? (
                  <button className="confirm-btn" onClick={() => void submitCreation(pendingCreation.name, pendingCreation.files)} type="button">
                    Prøv igjen
                  </button>
                ) : null}
                <button className="confirm-btn" disabled={!caseName.trim() || isPreparing} type="submit">
                  Opprett uten dokumenter
                </button>
              </div>
            </div>
          </motion.form>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
