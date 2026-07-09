import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import "../styles/modals.css";
import "./SaksromReadinessModal.css";

interface SaksromReadinessModalProps {
  isOpen: boolean;
  coverage: number;
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  ocrWarningCount?: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function SaksromReadinessModal({
  isOpen,
  coverage,
  verifiedCount,
  pendingCount,
  failedCount,
  ocrWarningCount = 0,
  onClose,
  onConfirm
}: SaksromReadinessModalProps) {
  const acknowledgementRef = useRef<HTMLInputElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("evida-modal-open");
      setAcknowledged(false);
      return;
    }

    document.body.classList.add("evida-modal-open");
    window.setTimeout(() => acknowledgementRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
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
            aria-labelledby="readiness-modal-title"
            aria-modal="true"
            className="modal-container readiness-modal"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 10 }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="modal-header">
              <span className="modal-kicker">Kildegrunnlag advarsel</span>
              <h2 id="readiness-modal-title">Fortsett med foreløpig kildegrunnlag?</h2>
              <p>
                Saksrom åpnes med ufullstendig kildegrunnlag. Svar kan mangle dokumenter eller sider
                som ikke er ferdig behandlet eller verifisert.
              </p>
            </div>

            <div className="modal-actions-area">
              <div className="readiness-metrics-card">
                <h3 className="metrics-card-title">Gjeldende status for saken</h3>
                <dl className="readiness-metrics-list">
                  <div className="metric-row">
                    <dt>Kildedekning</dt>
                    <dd className={coverage >= 80 ? "coverage-high" : "coverage-low"}>{coverage}%</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Ferdig behandlet</dt>
                    <dd>{verifiedCount}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>I karantene / venter</dt>
                    <dd className={pendingCount > 0 ? "warning-value" : ""}>{pendingCount}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>Behandling feilet</dt>
                    <dd className={failedCount > 0 ? "danger-value" : ""}>{failedCount}</dd>
                  </div>
                  <div className="metric-row">
                    <dt>OCR-varsel</dt>
                    <dd className={ocrWarningCount > 0 ? "warning-value" : ""}>{ocrWarningCount}</dd>
                  </div>
                </dl>
              </div>

              <label className="readiness-acknowledgement">
                <input
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                  ref={acknowledgementRef}
                  type="checkbox"
                />
                <span>Jeg forstår og vil fortsette med foreløpig kildegrunnlag</span>
              </label>

              <div className="modal-footer">
                <button className="cancel-btn" onClick={onClose} type="button">
                  Avbryt
                </button>
                <button
                  className="confirm-btn readiness-confirm-btn"
                  disabled={!acknowledged}
                  onClick={onConfirm}
                  type="button"
                >
                  Fortsett til Saksrom
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
