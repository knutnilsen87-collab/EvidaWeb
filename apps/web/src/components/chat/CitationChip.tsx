import { useOptionalAuth } from "../../context/AuthContext";
import { Citation, citationStore } from "../../lib/CitationManager";
import { auditClientEvent } from "../../lib/api";
import "./CitationChip.css";

interface CitationChipProps {
  ariaContext?: string;
  citation: Citation;
  label: string;
}

export function CitationChip({ ariaContext, citation, label }: CitationChipProps) {
  const auth = useOptionalAuth();

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
    <button
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
  );
}
