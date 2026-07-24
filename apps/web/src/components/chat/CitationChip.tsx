import { useId } from "react";
import { useOptionalAuth } from "../../context/AuthContext";
import { Citation, citationStore } from "../../lib/CitationManager";
import { auditClientEvent } from "../../lib/api";
import "./CitationChip.css";

interface CitationChipProps {
  ariaContext?: string;
  citation: Citation;
  documentName?: string;
  excerpt?: string;
  label: string;
}

export function CitationChip({ ariaContext, citation, documentName, excerpt, label }: CitationChipProps) {
  const auth = useOptionalAuth();
  const popoverId = useId();

  function openCitation() {
    if (auth?.user) {
      void auditClientEvent(auth.user.tenantId, {
        eventType: "CITATION_OPENED",
        entityType: "SOURCE_UNIT",
        metadataJson: JSON.stringify({
          documentId: citation.documentId,
          sourceUnitId: citation.sourceUnitId,
          page: citation.page
        })
      }).catch(() => undefined);
    }
    citationStore.jumpToSource(citation);
  }

  return (
    <span className="citation-chip-anchor">
      <button
        aria-describedby={popoverId}
        aria-label={`Åpne kilde ${label} ${citation.documentId}${ariaContext ? ` ${ariaContext}` : ""} side ${
          citation.page
        }`}
        className="citation-chip"
        onClick={openCitation}
        title={`Hopp til side ${citation.page}`}
        type="button"
      >
        <span className="citation-chip__label">{label}</span>
        <span className="citation-chip__page">s. {citation.page}</span>
      </button>
      <span
        aria-label={`Kildedetaljer for side ${citation.page}`}
        className="citation-chip-popover"
        id={popoverId}
        role="group"
      >
        <span className="citation-chip-popover__eyebrow">Kildehenvisning</span>
        <strong>{documentName || citation.documentId}</strong>
        <span>Side {citation.page}</span>
        {excerpt?.trim() ? <q>{excerpt.trim()}</q> : null}
        <button onClick={openCitation} type="button">
          Åpne kilde
        </button>
      </span>
    </span>
  );
}
