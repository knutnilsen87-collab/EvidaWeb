import { useState } from "react";
import { approveSourceBatch, demoSourceSections, SourceBatchSection } from "../lib/sourceUnits";
import "./BatchApprovalPanel.css";

export function BatchApprovalPanel() {
  const [sections, setSections] = useState<SourceBatchSection[]>(demoSourceSections);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<SourceBatchSection | null>(null);
  const [approvedSectionIds, setApprovedSectionIds] = useState<Set<string>>(() => new Set());
  const [sectionFeedback, setSectionFeedback] = useState<Record<string, string>>({});

  async function approveSection(sectionId: string) {
    setProcessingId(sectionId);
    setSectionFeedback((current) => ({ ...current, [sectionId]: "Registrerer handling ..." }));
    try {
      const approved = await approveSourceBatch(sectionId);
      setSections((current) =>
        current.map((section) => (section.id === sectionId ? { ...section, ...approved } : section))
      );
      setApprovedSectionIds((current) => new Set(current).add(sectionId));
      setSectionFeedback((current) => ({ ...current, [sectionId]: "Seksjonen er godkjent." }));
      setSelectedSection(null);
    } catch {
      setSectionFeedback((current) => ({
        ...current,
        [sectionId]: "Handlingen kunne ikke fullføres. Prøv igjen."
      }));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <section className="batch-approval liquid-glass-panel" aria-label="Batch-godkjenning av seksjoner">
      <header>
        <span className="dash-eyebrow">Store dokumenter</span>
        <h2>Batch-godkjenning av seksjoner</h2>
        <p>10 000 sider behandles som kildeenheter. Godkjenn bare sidene som faktisk skal brukes.</p>
      </header>

      <div className="batch-section-list">
        {sections.map((section) => {
          const approved = approvedSectionIds.has(section.id) || section.status === "source-ready";
          return (
            <article className="batch-section" key={section.id}>
              <button className="batch-section-preview" onClick={() => setSelectedSection(section)} type="button">
                <strong>{section.title}</strong>
                <span>
                  Side {section.startPage}-{section.endPage} · {section.verifiedPages}/{section.totalPages} verifisert
                </span>
                {sectionFeedback[section.id] ? <small>{sectionFeedback[section.id]}</small> : null}
              </button>
              <span className={`batch-status ${section.status}`}>{approved ? "godkjent" : section.status}</span>
              {approved ? (
                <span className="batch-completed">Seksjonen er godkjent.</span>
              ) : (
                <button
                  className="btn-approve"
                  disabled={processingId === section.id}
                  onClick={() => void approveSection(section.id)}
                  type="button"
                >
                  {processingId === section.id ? "Registrerer ..." : "Godkjenn seksjon"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {selectedSection ? (
        <div className="batch-preview-backdrop" role="presentation" onClick={() => setSelectedSection(null)}>
          <section
            aria-labelledby="section-preview-title"
            aria-modal="true"
            className="batch-preview-panel liquid-glass-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <span className="dash-eyebrow">Seksjonskontroll</span>
              <h3 id="section-preview-title">{selectedSection.title}</h3>
              <p>
                Side {selectedSection.startPage}-{selectedSection.endPage}. {selectedSection.verifiedPages} av{" "}
                {selectedSection.totalPages} sider er verifisert.
              </p>
            </header>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{selectedSection.status}</dd>
              </div>
              <div>
                <dt>Hvorfor kreves handling?</dt>
                <dd>Seksjonen er ikke ferdig godkjent som kildeenhet og må kontrolleres før den brukes fullt ut.</dd>
              </div>
              <div>
                <dt>Hva betyr godkjenning?</dt>
                <dd>Du bekrefter at denne seksjonen kan inngå i kildegrunnlaget med den dekningen som vises her.</dd>
              </div>
            </dl>
            {sectionFeedback[selectedSection.id] ? (
              <p className="batch-preview-feedback" role="status">{sectionFeedback[selectedSection.id]}</p>
            ) : null}
            <footer>
              <button className="btn-approve btn-secondary" type="button" onClick={() => setSelectedSection(null)}>
                Lukk
              </button>
              {!approvedSectionIds.has(selectedSection.id) && selectedSection.status !== "source-ready" ? (
                <button
                  className="btn-approve"
                  disabled={processingId === selectedSection.id}
                  onClick={() => void approveSection(selectedSection.id)}
                  type="button"
                >
                  {processingId === selectedSection.id ? "Registrerer handling ..." : "Godkjenn seksjon"}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
