import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useEffect, useRef, useState } from "react";
import "./NewCaseModal.css";
import "../styles/modals.css";

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (caseName: string) => void;
}

export function NewCaseModal({ isOpen, onClose, onCreate }: NewCaseModalProps) {
  const [caseName, setCaseName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) {
      setCaseName("");
      document.body.classList.remove("evida-modal-open");
      return;
    }

    document.body.classList.add("evida-modal-open");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => document.body.classList.remove("evida-modal-open");
  }, [isOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = caseName.trim();
    if (!trimmedName) {
      return;
    }
    onCreate(trimmedName);
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
              <h2 id="new-case-title">Opprett ny sak</h2>
              <p>
                Definer sakens tittel for å initialisere kildegrunnlaget. Systemet klargjør
                karantene-slusen umiddelbart.
              </p>
            </div>

            <div className="modal-actions-area">
              <input
                ref={inputRef}
                aria-label="Navn på saken"
                className="modal-input"
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="Navn på saken, f.eks. Holands Hage"
                type="text"
                value={caseName}
              />

              <div className="modal-footer">
                <button className="cancel-btn" onClick={onClose} type="button">
                  Avbryt
                </button>
                <button className="confirm-btn" disabled={!caseName.trim()} type="submit">
                  Opprett arbeidsområde
                </button>
              </div>
            </div>
          </motion.form>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
