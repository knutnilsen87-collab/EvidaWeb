import { useEffect, useState } from "react";
import { Citation, CitationComparison, citationStore, CITATION_COMPARISON_EVENT, CITATION_EVENT } from "../lib/CitationManager";
import { fetchSourceWindow, SourceWindow } from "../lib/sourceUnits";
import "./PDFViewer.css";

interface PDFViewerProps {
  documentId: string;
  tenantId?: string;
}

export function PDFViewer({ documentId, tenantId }: PDFViewerProps) {
  const [activeHighlight, setActiveHighlight] = useState<Citation | null>(citationStore.activeCitation);
  const [sourceWindow, setSourceWindow] = useState<SourceWindow | null>(null);
  const [activeComparison, setActiveComparison] = useState<CitationComparison | null>(citationStore.activeComparison);
  const [comparisonWindows, setComparisonWindows] = useState<{
    left: SourceWindow;
    right: SourceWindow;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWindow(citation: Citation | null) {
      if (!citation || citation.documentId !== documentId) {
        const initialWindow = await fetchSourceWindow(documentId, 7, undefined, tenantId);
        if (!cancelled) {
          setSourceWindow(initialWindow);
          setActiveHighlight(null);
        }
        return;
      }

      const nextWindow = await fetchSourceWindow(documentId, citation.page, undefined, tenantId);
      if (!cancelled) {
        setSourceWindow(nextWindow);
        setActiveHighlight(citation);
        setActiveComparison(null);
        setComparisonWindows(null);
      }
    }

    async function loadComparison(comparison: CitationComparison | null) {
      if (!comparison) {
        if (!cancelled) {
          setActiveComparison(null);
          setComparisonWindows(null);
        }
        return;
      }

      const [leftWindow, rightWindow] = await Promise.all([
        fetchSourceWindow(comparison.left.documentId, comparison.left.page, undefined, tenantId),
        fetchSourceWindow(comparison.right.documentId, comparison.right.page, undefined, tenantId)
      ]);

      if (!cancelled) {
        setActiveComparison(comparison);
        setComparisonWindows({ left: leftWindow, right: rightWindow });
        setActiveHighlight(null);
      }
    }

    void loadWindow(citationStore.activeCitation);
    void loadComparison(citationStore.activeComparison);

    const unsubscribe = citationStore.subscribe((citation) => {
      void loadWindow(citation);
    });
    const unsubscribeComparison = citationStore.subscribeToComparison((comparison) => {
      void loadComparison(comparison);
    });

    const citationHandler = (event: Event) => {
      void loadWindow((event as CustomEvent<Citation>).detail);
    };
    const comparisonHandler = (event: Event) => {
      void loadComparison((event as CustomEvent<CitationComparison>).detail);
    };

    window.addEventListener(CITATION_EVENT, citationHandler);
    window.addEventListener(CITATION_COMPARISON_EVENT, comparisonHandler);
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeComparison();
      window.removeEventListener(CITATION_EVENT, citationHandler);
      window.removeEventListener(CITATION_COMPARISON_EVENT, comparisonHandler);
    };
  }, [documentId, tenantId]);

  function renderPageStack(window: SourceWindow | null, activeCitation: Citation | null, label: string) {
    return (
      <div className="pdf-pane-canvas" aria-label={label}>
        <div className="pdf-page-stack" aria-label="Lazy-renderte sideenheter">
          {(window?.units ?? []).map((unit) => (
            <article
              aria-label={`Sideenhet ${unit.id}`}
              className={unit.id === activeCitation?.sourceUnitId ? "pdf-page is-active" : "pdf-page"}
              key={unit.id}
            >
              <h2>{unit.title}</h2>
              <p>{unit.excerpt}</p>
              <small>{unit.hash}</small>
            </article>
          ))}
        </div>

        {activeCitation ? (
          <div
            aria-label={`Aktiv kilde ${activeCitation.sourceUnitId}`}
            className="highlight-overlay"
            style={{
              top: activeCitation.rect.top,
              left: activeCitation.rect.left,
              width: activeCitation.rect.width,
              height: activeCitation.rect.height
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={activeComparison ? "pdf-viewer-container split" : "pdf-viewer-container"} aria-label="Dokument-viewer">
      <div className="pdf-viewer-toolbar">
        <span>{activeComparison ? "Sammenligning" : "Virtualisert PDF"}</span>
        <strong>{activeComparison ? "Motstridende kilder" : documentId}</strong>
        <small>
          {activeComparison
            ? activeComparison.summary
            : `Side ${sourceWindow?.startPage ?? 1}-${sourceWindow?.endPage ?? 1} av ${
                sourceWindow?.totalPages ?? 10_000
              }`}
        </small>
      </div>
      {activeComparison ? (
        <div className="split-layout" aria-label="Sammenligningsvisning">
          <section className="pdf-pane pdf-pane--left" aria-label={`Venstre kilde ${activeComparison.left.documentId}`}>
            <div className="pdf-pane-header">
              <strong>{activeComparison.left.documentId}</strong>
              <span>Side {activeComparison.left.page}</span>
            </div>
            {renderPageStack(comparisonWindows?.left ?? null, activeComparison.left, "Venstre dokument")}
          </section>
          <section className="pdf-pane pdf-pane--right" aria-label={`Høyre kilde ${activeComparison.right.documentId}`}>
            <div className="pdf-pane-header">
              <strong>{activeComparison.right.documentId}</strong>
              <span>Side {activeComparison.right.page}</span>
            </div>
            {renderPageStack(comparisonWindows?.right ?? null, activeComparison.right, "Høyre dokument")}
          </section>
        </div>
      ) : (
        <div className="pdf-canvas">{renderPageStack(sourceWindow, activeHighlight, "Aktivt dokument")}</div>
      )}
    </div>
  );
}
