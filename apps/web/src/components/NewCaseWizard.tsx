import { FormEvent, useEffect, useRef, useState } from "react";
import "../styles/modals.css";
import "./NewCaseWizard.css";

interface NewCaseWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (caseName: string) => void;
}

const matterTypes = ["Strafferett", "Kontrakt & avtale", "Arbeidsrett", "Eiendomstvist", "Familie & arv"];

const defaultWorkflow = [
  "Dokumentimport & OCR-kontroll",
  "Etablering av kildebundet kronologi",
  "Beviskobling mot krav og faktum",
  "Risikovurdering av motargumenter",
  "Fail-closed utkastproduksjon"
];

const criminalWorkflow = [
  "Karantene-sluse for politidokumenter og saksdokumenter",
  "Kildebundet tidslinje koblet mot straffebud og hendelser",
  "Bevismatrise for objektiv gjerningsbeskrivelse og skyldkrav",
  "Tvilskontroll mot beviskravet utover enhver rimelig tvil",
  "Fail-closed prosedyregrunnlag med kildehopp"
];

export function NewCaseWizard({ isOpen, onClose, onCreate }: NewCaseWizardProps) {
  const [step, setStep] = useState(1);
  const [matterType, setMatterType] = useState(matterTypes[0]);
  const [caseName, setCaseName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workflow = matterType === "Strafferett" ? criminalWorkflow : defaultWorkflow;

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setMatterType(matterTypes[0]);
      setCaseName("");
      document.body.classList.remove("evida-modal-open");
      return;
    }

    document.body.classList.add("evida-modal-open");
    if (step === 3) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }

    return () => document.body.classList.remove("evida-modal-open");
  }, [isOpen, step]);

  if (!isOpen) {
    return null;
  }

  function selectMatterType(selectedType: string) {
    setMatterType(selectedType);
    setStep(2);
  }

  function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = caseName.trim();
    if (!trimmedName) {
      return;
    }
    onCreate(trimmedName);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        aria-labelledby="new-case-wizard-title"
        aria-modal="true"
        className="modal-container wizard-container"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitCase}
        role="dialog"
      >
        <div className="modal-header">
          <span className="modal-kicker">Steg {step} av 3</span>
          <h2 id="new-case-wizard-title">
            {step === 1 ? "Hva gjelder saken?" : step === 2 ? "Anbefalt arbeidsflyt" : "Navngi arbeidsområdet"}
          </h2>
          <p>
            Veiviseren setter opp en fail-closed juridisk arbeidsflyt med import,
            karantene, kildekontroll og analyse før utkast.
          </p>
        </div>

        <div className="wizard-body">
          {step === 1 ? (
            <div className="options-grid" aria-label="Sakstype">
              {matterTypes.map((type) => (
                <button className={type === "Strafferett" ? "criminal-option" : undefined} key={type} type="button" onClick={() => selectMatterType(type)}>
                  {type}
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="workflow-proposal">
              <p>
                Basert på {matterType.toLowerCase()} anbefaler EVIDA følgende arbeidsløp:
              </p>
              <ol className="workflow-steps">
                {workflow.map((stepText) => (
                  <li key={stepText}>{stepText}</li>
                ))}
              </ol>
              {matterType === "Strafferett" ? (
                <div className="criminal-workflow-note" role="note">
                  Strafferettsmodus prioriterer bevisbyrde, politidokumenter, skyldkrav og tvilspunkter før utkast.
                </div>
              ) : null}
              <div className="modal-footer">
                <button className="cancel-btn" type="button" onClick={() => setStep(1)}>
                  Tilbake
                </button>
                <button className="confirm-btn" type="button" onClick={() => setStep(3)}>
                  Start anbefalt løp
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-final-step">
              <input
                ref={inputRef}
                aria-label="Navn på saken"
                className="modal-input"
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="Navn på saken, f.eks. Hansen vs. Bygg AS"
                type="text"
                value={caseName}
              />
              <div className="modal-footer">
                <button className="cancel-btn" type="button" onClick={() => setStep(2)}>
                  Tilbake
                </button>
                <button className="confirm-btn" disabled={!caseName.trim()} type="submit">
                  Opprett arbeidsområde
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
