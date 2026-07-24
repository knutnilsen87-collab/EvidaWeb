import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import type { SourceCoverage } from "../lib/api";
import "../styles/modals.css";
import "./SaksromReadinessModal.css";

interface SaksromReadinessModalProps {
  isOpen: boolean;
  coverage: number;
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  ocrWarningCount?: number;
  sourceCoverage?: SourceCoverage | null;
  onClose: () => void;
  onConfirm: () => void;
  onInspectMissing?: () => void;
}

function pageWord(count: number) {
  return count === 1 ? "side" : "sider";
}

function listPages(spec: string | null | undefined, count: number) {
  if (!spec?.trim()) {
    return count > 0 ? `${count} ${pageWord(count)} krever kontroll.` : "Ingen sider krever kontroll.";
  }

  const pages = spec.split(",").map((part) => part.trim()).filter(Boolean);
  if (pages.length === 1) {
    return `Side ${pages[0]} har for lite lesbar tekst og blir ikke brukt i oppsummeringen.`;
  }

  const last = pages[pages.length - 1];
  const first = pages.slice(0, -1).join(", ");
  return `${count || pages.length} ${pageWord(count || pages.length)} krever kontroll: side ${first} og ${last}.`;
}

export function SaksromReadinessModal({
  isOpen,
  coverage,
  verifiedCount,
  pendingCount,
  failedCount,
  ocrWarningCount = 0,
  sourceCoverage,
  onClose,
  onConfirm,
  onInspectMissing
}: SaksromReadinessModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const issueCount = ocrWarningCount + failedCount + pendingCount;
  const isComplete = coverage === 100 && issueCount === 0;

  const consequenceText = useMemo(() => {
    if (sourceCoverage?.totalPages) {
      const ready = sourceCoverage.readyPages ?? 0;
      const total = sourceCoverage.totalPages;
      const controlCount = (sourceCoverage.belowThresholdPages ?? 0) + (sourceCoverage.missingOcrPages ?? 0);
      const controlSpec = sourceCoverage.belowThresholdPageRanges || sourceCoverage.missingOcrPageRanges;
      return `${ready} av ${total} sider er klare. ${listPages(controlSpec, controlCount)}`;
    }

    return `${verifiedCount} dokumenter er klare. ${pendingCount + failedCount + ocrWarningCount} dokumenter eller sider krever fortsatt kontroll.`;
  }, [failedCount, ocrWarningCount, pendingCount, sourceCoverage, verifiedCount]);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("evida-modal-open");
      return;
    }

    document.body.classList.add("evida-modal-open");
    window.setTimeout(() => primaryRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("evida-modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="modal-backdrop readiness-backdrop" role="presentation" onMouseDown={onClose}>
          <motion.div
            aria-describedby="readiness-modal-body"
            aria-labelledby="readiness-modal-title"
            aria-modal="true"
            className="modal-container readiness-modal"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.82, y: 28 }}
            onMouseDown={(event) => event.stopPropagation()}
            ref={modalRef}
            role="dialog"
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="modal-header readiness-modal-header">
              <span className="modal-kicker">Kildekontroll</span>
              <h2 id="readiness-modal-title">Kompletthetskontroll</h2>
              <strong className={isComplete ? "readiness-verdict readiness-verdict--passed" : "readiness-verdict"}>
                {isComplete ? "Kontrollen er bestått" : "Kildegrunnlaget er foreløpig"}
              </strong>
              <p id="readiness-modal-body">{consequenceText}</p>
            </div>

            <div className="modal-actions-area">
              <div className="readiness-metrics-card">
                <div className="readiness-coverage">
                  <span>Kildedekning</span>
                  <strong className={coverage >= 100 ? "coverage-high" : "coverage-low"}>{coverage}%</strong>
                </div>
                <ul className="readiness-checklist" aria-label="Resultat av kompletthetskontroll">
                  <li className={isComplete ? "is-passed" : "is-warning"}>
                    <span aria-hidden="true">{isComplete ? "✓" : "!"}</span>
                    {isComplete
                      ? "Ingen hull i behandlet kildegrunnlag"
                      : `${issueCount} ${issueCount === 1 ? "element" : "elementer"} krever kontroll`}
                  </li>
                  <li className={failedCount === 0 ? "is-passed" : "is-warning"}>
                    <span aria-hidden="true">{failedCount === 0 ? "✓" : "!"}</span>
                    {failedCount === 0 ? "Ingen avviste registrerte dokumenter" : `${failedCount} dokumenter er avvist`}
                  </li>
                  <li className={pendingCount === 0 ? "is-passed" : "is-warning"}>
                    <span aria-hidden="true">{pendingCount === 0 ? "✓" : "!"}</span>
                    {pendingCount === 0 ? "Alle registrerte dokumenter kontrollert" : `${pendingCount} dokumenter behandles`}
                  </li>
                </ul>
                {!isComplete ? (
                  <p>
                    EVIDA bruker bare ferdig behandlede kilder. Sider som krever OCR eller kontroll tas ikke med før de er klare.
                  </p>
                ) : null}
              </div>

              <div className="modal-footer readiness-modal-footer">
                <button className="confirm-btn readiness-confirm-btn" onClick={onConfirm} ref={primaryRef} type="button">
                  OK
                </button>
                {!isComplete ? (
                  <button className="secondary-btn" onClick={onInspectMissing ?? onClose} type="button">
                    Kontroller manglende sider
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
