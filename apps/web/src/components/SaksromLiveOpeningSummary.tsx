import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvidaDocument, SaksromSummary, SourceCoverage, SourceReference } from "../lib/api";
import { fetchSaksromSummary } from "../lib/api";
import { Citation } from "../lib/CitationManager";
import type { WorkspaceView } from "../navigation";
import { CitationChip } from "./chat/CitationChip";
import "./SaksromLiveOpeningSummary.css";

const progressSteps = [
  "EVIDA åpner saken ...",
  "Leser dokumentgrunnlaget ...",
  "Finner hovedpunkter ...",
  "Kontrollerer kilder ...",
  "Bygger første saksforståelse ..."
];

interface SaksromLiveOpeningSummaryProps {
  caseId: string;
  tenantId?: string;
  documents?: EvidaDocument[];
  sourceCoverage?: SourceCoverage | null;
  onNavigate?: (view: WorkspaceView) => void;
  onShowDocumentStatus?: () => void;
}

function isReadyDocument(document: EvidaDocument) {
  return document.status === "verified" || document.status === "source_ready" || document.status === "partial_source_ready";
}

function rectFromHighlight(highlightJson?: string | null) {
  if (!highlightJson) {
    return { top: 0, left: 0, width: 0, height: 0 };
  }

  try {
    const parsed = JSON.parse(highlightJson) as Partial<Citation["rect"]>;
    return {
      top: Number(parsed.top ?? 0),
      left: Number(parsed.left ?? 0),
      width: Number(parsed.width ?? 0),
      height: Number(parsed.height ?? 0)
    };
  } catch {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
}

function citationFromSource(source: SourceReference): Citation {
  return {
    documentId: source.documentId,
    sourceUnitId: source.sourceUnitId,
    page: source.pageNumber,
    pageNumber: source.pageNumber,
    paragraph: source.sourceUnitId,
    rect: rectFromHighlight(source.highlightJson)
  };
}

function compactSources(sources: SourceReference[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.documentId}:${source.sourceUnitId}:${source.pageNumber}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function warningText(warning: string) {
  if (warning === "PARTIAL_SOURCE_COVERAGE") {
    return "Foreløpig kildegrunnlag.";
  }
  if (warning.startsWith("MISSING_OCR_PAGES")) {
    return "Noen OCR-sider mangler og er ikke brukt som kilder.";
  }
  if (warning.startsWith("BELOW_THRESHOLD_PAGES")) {
    return "Noen sider krever kontroll før de kan brukes som kilder.";
  }
  if (warning === "NO_RELEVANT_SOURCE_MATCH" || warning === "INSUFFICIENT_SOURCE_MATCH") {
    return "Fant ikke nok støtte i tilgjengelige kilder.";
  }
  return warning.replace(/_/g, " ").toLowerCase();
}

export function SaksromLiveOpeningSummary({
  caseId,
  tenantId,
  documents = [],
  sourceCoverage,
  onNavigate,
  onShowDocumentStatus
}: SaksromLiveOpeningSummaryProps) {
  const [summary, setSummary] = useState<SaksromSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [visibleSectionCount, setVisibleSectionCount] = useState(0);
  const requestKeyRef = useRef("");

  const hasSourceBasis = sourceCoverage
    ? (sourceCoverage.readyPages ?? 0) > 0
    : documents.some(isReadyDocument);
  const isPartial = sourceCoverage
    ? (sourceCoverage.readyPages ?? 0) < (sourceCoverage.totalPages ?? 0)
    : documents.some((document) => document.status === "partial_source_ready");

  const warnings = useMemo(() => {
    const values = new Set<string>();
    if (isPartial) {
      values.add("PARTIAL_SOURCE_COVERAGE");
    }
    if ((sourceCoverage?.missingOcrPages ?? 0) > 0) {
      values.add(`MISSING_OCR_PAGES=${sourceCoverage?.missingOcrPageRanges || sourceCoverage?.missingOcrPages}`);
    }
    if ((sourceCoverage?.belowThresholdPages ?? 0) > 0) {
      values.add(`BELOW_THRESHOLD_PAGES=${sourceCoverage?.belowThresholdPageRanges || sourceCoverage?.belowThresholdPages}`);
    }
    summary?.warnings.forEach((warning) => values.add(warning));
    return [...values];
  }, [isPartial, sourceCoverage, summary?.warnings]);

  const loadSummary = useCallback(async () => {
    if (!caseId || !tenantId || !hasSourceBasis) {
      return;
    }

    const requestKey = `${caseId}:${tenantId}`;
    requestKeyRef.current = requestKey;
    setStatus("loading");
    setSummary(null);
    setActiveStep(0);
    setVisibleSectionCount(0);

    try {
      const response = await fetchSaksromSummary(tenantId, {
        caseId,
        includePartial: true,
        sourceBasis: "READY_PAGE_UNITS_ONLY"
      });
      if (requestKeyRef.current !== requestKey) {
        return;
      }
      setSummary(response);
      setStatus("ready");
      setActiveStep(progressSteps.length - 1);
    } catch {
      if (requestKeyRef.current === requestKey) {
        setStatus("error");
      }
    }
  }, [caseId, hasSourceBasis, tenantId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (status !== "loading") {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, progressSteps.length - 1));
    }, 520);
    return () => window.clearInterval(timer);
  }, [status]);

  const sections = useMemo(() => {
    if (!summary) {
      return [];
    }
    return [
      summary.summary
        ? {
            id: "tema",
            title: summary.title || "Kort sakstype/tema",
            text: summary.summary,
            sources: compactSources(summary.sources ?? [])
          }
        : null,
      ...summary.findings.map((finding, index) => ({
        id: `finding-${index}`,
        title: finding.heading || "Viktig punkt",
        text: finding.text,
        sources: compactSources(finding.sources ?? [])
      })),
      warnings.length > 0
        ? {
            id: "mangler",
            title: "Mulige mangler",
            text: warnings.map(warningText).join(" "),
            sources: []
          }
        : null
    ].filter(Boolean) as Array<{ id: string; title: string; text: string; sources: SourceReference[] }>;
  }, [summary, warnings]);

  useEffect(() => {
    if (status !== "ready" || sections.length === 0) {
      return;
    }
    setVisibleSectionCount(0);
    const timers = sections.map((_, index) =>
      window.setTimeout(() => setVisibleSectionCount((count) => Math.max(count, index + 1)), 180 + index * 220)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sections, status]);

  if (!hasSourceBasis) {
    return null;
  }

  if (status === "error") {
    return (
      <div className="saksrom-live-summary ai-message ai-message--unbound" role="alert">
        <strong>EVIDA klarte ikke å lage første saksoppsummering akkurat nå.</strong>
        <div className="saksrom-live-summary__actions">
          <button type="button" onClick={() => void loadSummary()}>
            Prøv igjen
          </button>
          <button type="button" onClick={onShowDocumentStatus ?? (() => onNavigate?.("quarantine"))}>
            Se dokumentstatus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="saksrom-live-summary ai-message ai-message--source">
      <p className="saksrom-live-summary__lead">Jeg går gjennom dokumentgrunnlaget nå.</p>
      <ol className="saksrom-live-summary__steps" aria-label="EVIDA bygger første saksforståelse">
        {progressSteps.map((step, index) => (
          <li
            className={index < activeStep || status === "ready" ? "complete" : index === activeStep ? "active" : ""}
            key={step}
          >
            <span aria-hidden="true">{index < activeStep || status === "ready" ? "✓" : index === activeStep ? "→" : ""}</span>
            {step}
          </li>
        ))}
      </ol>

      {warnings.length > 0 ? (
        <div className="saksrom-live-summary__warnings" role="status">
          {warnings.map((warning) => (
            <span key={warning}>{warningText(warning)}</span>
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="saksrom-live-summary__result">
          <h3>Her er første saksforståelse basert på tilgjengelige kilder:</h3>
          {sections.slice(0, visibleSectionCount).map((section) => (
            <section className="saksrom-live-summary__section" key={section.id}>
              <h4>{section.title}</h4>
              <p>{section.text}</p>
              {section.sources.length > 0 ? (
                <div className="saksrom-live-summary__sources" aria-label="Kilder">
                  {section.sources.map((source) => (
                    <CitationChip
                      citation={citationFromSource(source)}
                      key={`${source.documentId}:${source.sourceUnitId}:${source.pageNumber}`}
                      label={`Side ${source.pageNumber}`}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ))}
          {visibleSectionCount >= sections.length ? (
            <div className="saksrom-live-summary__actions">
              <button type="button" onClick={() => onNavigate?.("evidence")}>
                Bygg bevisliste
              </button>
              <button type="button" onClick={() => onNavigate?.("chronology")}>
                Bygg kronologi
              </button>
              <button type="button">Still oppfølgingsspørsmål</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
