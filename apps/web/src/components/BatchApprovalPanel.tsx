import { useState } from "react";
import { approveSourceBatch, demoSourceSections, SourceBatchSection } from "../lib/sourceUnits";
import "./BatchApprovalPanel.css";

export function BatchApprovalPanel() {
  const [sections, setSections] = useState<SourceBatchSection[]>(demoSourceSections);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function approveSection(sectionId: string) {
    setProcessingId(sectionId);
    const approved = await approveSourceBatch(sectionId);
    setSections((current) =>
      current.map((section) => (section.id === sectionId ? { ...section, ...approved } : section))
    );
    setProcessingId(null);
  }

  return (
    <section className="batch-approval liquid-glass-panel" aria-label="Batch-godkjenning av seksjoner">
      <header>
        <span className="dash-eyebrow">Store dokumenter</span>
        <h2>Batch-godkjenning av seksjoner</h2>
        <p>10 000 sider behandles som kildeenheter. Godkjenn bare sidene som faktisk skal brukes.</p>
      </header>

      <div className="batch-section-list">
        {sections.map((section) => (
          <article className="batch-section" key={section.id}>
            <div>
              <strong>{section.title}</strong>
              <span>
                Side {section.startPage}-{section.endPage} · {section.verifiedPages}/{section.totalPages} verifisert
              </span>
            </div>
            <span className={`batch-status ${section.status}`}>{section.status}</span>
            <button
              className="btn-approve"
              disabled={section.status === "source-ready" || processingId === section.id}
              onClick={() => void approveSection(section.id)}
              type="button"
            >
              {processingId === section.id ? "Godkjenner..." : "Godkjenn seksjon"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
