import type { CaseFileDto } from "../lib/api";

interface MoveCaseToTrashDialogProps {
  caseFile: CaseFileDto | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MoveCaseToTrashDialog({ caseFile, isSubmitting, onCancel, onConfirm }: MoveCaseToTrashDialogProps) {
  if (!caseFile) return null;

  return (
    <div className="trash-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="trash-dialog-title"
        aria-modal="true"
        className="trash-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span className="trash-dialog__kicker">Saksarkiv</span>
        <h2 id="trash-dialog-title">Flytt saken til papirkurv?</h2>
        <p className="trash-dialog__case">{caseFile.title}</p>
        <p>Dokumenter slettes ikke permanent.</p>
        <div className="trash-dialog__actions">
          <button disabled={isSubmitting} onClick={onCancel} type="button">Avbryt</button>
          <button className="trash-dialog__confirm" disabled={isSubmitting} onClick={onConfirm} type="button">
            {isSubmitting ? "Flytter …" : "Flytt til papirkurv"}
          </button>
        </div>
      </section>
    </div>
  );
}
