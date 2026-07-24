import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  EvidaDocument,
  SaksromSummary,
  SaksromSummaryFinding,
  SourceCoverage,
  SourceReference
} from "../lib/api";
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

type UnderstandingSection = {
  emptyText?: string;
  findings?: SaksromSummaryFinding[];
  id: string;
  sources?: SourceReference[];
  text?: string;
  title: string;
};

const contractTerms = /\b(avtale|kontrakt|kontraktssum|vederlag|betaling|pris|frist|garanti|sikkerhet|partene|byggherre|entreprenør|leveranse)\b/i;
const disputeTerms = /\b(tvist|tvistetema|uenighet|bestrid|motstrid|mislighold|forsink|dagmulkt|reklamasjon|mangel|erstatning|krav|ansvar)\w*/i;

function findingText(finding: SaksromSummaryFinding) {
  return `${finding.heading ?? ""} ${finding.text}`.trim();
}

function sourceDocumentName(source: SourceReference, documents: EvidaDocument[]) {
  return documents.find((document) => document.id === source.documentId)?.filename;
}

const legalTokenPattern = /(\b[A-ZÆØÅ][A-Za-zÆØÅæøå0-9&.-]*(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå0-9&.-]*){0,3}\s+(?:AS|ASA|DA|ANS)\b|\b\d[\d .]*\s*(?:NOK|kr|kroner)(?:\s*(?:eks\.|inkl\.)\s*mva\.?)?|§\s*\d+[a-z]?|punkt\s+\d+(?:\.\d+)*)/gi;

function legalText(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(legalTokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }
    const token = match[0];
    const className = /\b(?:NOK|kr|kroner)\b/i.test(token)
      ? "legal-token legal-token--amount"
      : /^(?:§|punkt)/i.test(token)
      ? "legal-token legal-token--reference"
      : "legal-token legal-token--party";
    nodes.push(<span className={className} key={`${index}:${token}`}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }
  return nodes;
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
  const completedRequestKeyRef = useRef("");
  const revealedSummaryRef = useRef<SaksromSummary | null>(null);

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
  }, [
    isPartial,
    sourceCoverage?.belowThresholdPageRanges,
    sourceCoverage?.belowThresholdPages,
    sourceCoverage?.missingOcrPageRanges,
    sourceCoverage?.missingOcrPages,
    summary?.warnings
  ]);

  const loadSummary = useCallback(async (force = false) => {
    if (!caseId || !tenantId || !hasSourceBasis) {
      return;
    }

    const requestKey = `${caseId}:${tenantId}`;
    if (!force && (requestKeyRef.current === requestKey || completedRequestKeyRef.current === requestKey)) {
      return;
    }

    requestKeyRef.current = requestKey;
    setStatus("loading");
    if (force) {
      setSummary(null);
    }
    setActiveStep(0);
    if (force) {
      setVisibleSectionCount(0);
    }

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
      completedRequestKeyRef.current = requestKey;
    } catch {
      if (requestKeyRef.current === requestKey) {
        setStatus("error");
      }
    } finally {
      if (requestKeyRef.current === requestKey) {
        requestKeyRef.current = "";
      }
    }
  }, [caseId, hasSourceBasis, tenantId]);

  useEffect(() => {
    if (!caseId || !tenantId) {
      requestKeyRef.current = "";
      completedRequestKeyRef.current = "";
      revealedSummaryRef.current = null;
      setSummary(null);
      setStatus("idle");
      setVisibleSectionCount(0);
      return;
    }
    void loadSummary();
  }, [caseId, loadSummary, tenantId]);

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

    const contractFindings: SaksromSummaryFinding[] = [];
    const disputeFindings: SaksromSummaryFinding[] = [];
    const generalFindings: SaksromSummaryFinding[] = [];
    summary.findings.forEach((finding) => {
      const text = findingText(finding);
      if (disputeTerms.test(text)) {
        disputeFindings.push(finding);
      } else if (contractTerms.test(text)) {
        contractFindings.push(finding);
      } else {
        generalFindings.push(finding);
      }
    });

    return [
      {
        id: "case-overview",
        title: "Hva saken gjelder",
        text: summary.summary,
        findings: generalFindings
      },
      {
        emptyText: "Ingen særskilte kontraktspunkter er identifisert i de tilgjengelige backend-funnene.",
        findings: contractFindings,
        id: "contract-points",
        title: "Viktige kontraktspunkter"
      },
      {
        emptyText: "Ingen mulige tvistetemaer er identifisert i de tilgjengelige backend-funnene.",
        findings: disputeFindings,
        id: "dispute-themes",
        title: "Mulige tvistetemaer"
      },
      {
        id: "source-basis",
        sources: compactSources(summary.sources ?? []),
        text: warnings.length > 0
          ? warnings.map(warningText).join(" ")
          : "Oppsummeringen bygger på kildehenvisningene nedenfor.",
        title: "Kildegrunnlag"
      }
    ] satisfies UnderstandingSection[];
  }, [summary, warnings]);

  useEffect(() => {
    if (status !== "ready" || !summary || sections.length === 0 || revealedSummaryRef.current === summary) {
      return;
    }
    revealedSummaryRef.current = summary;
    setVisibleSectionCount(0);
    const timers = sections.map((_, index) =>
      window.setTimeout(() => setVisibleSectionCount((count) => Math.max(count, index + 1)), 180 + index * 220)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sections, status, summary]);

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
          <header className="saksrom-live-summary__result-header">
            <span>Kildebundet arbeidsnotat</span>
            <h3>Første saksforståelse</h3>
            <p>
              {summary.title || "Sakstema ikke navngitt"}
              {" · "}
              {summary.sources.length} kildehenvisning{summary.sources.length === 1 ? "" : "er"}
            </p>
          </header>
          {sections.slice(0, visibleSectionCount).map((section) => (
            <section className="saksrom-live-summary__section" key={section.id}>
              <h4>{section.title}</h4>
              {section.text ? <p>{legalText(section.text)}</p> : null}
              {(section.findings ?? []).length > 0 ? (
                <ol className="saksrom-live-summary__findings">
                  {section.findings?.map((finding, findingIndex) => (
                    <li key={`${finding.heading}:${finding.text}:${findingIndex}`}>
                      <span>
                        {finding.heading ? <strong>{finding.heading}:</strong> : null} {legalText(finding.text)}
                      </span>
                      {(finding.sources ?? []).length > 0 ? (
                        <span className="saksrom-live-summary__sources" aria-label={`Kilder for funn ${findingIndex + 1}`}>
                          {compactSources(finding.sources ?? []).map((source) => (
                            <CitationChip
                              ariaContext={`for funn ${findingIndex + 1}`}
                              citation={citationFromSource(source)}
                              documentName={sourceDocumentName(source, documents)}
                              excerpt={source.quote}
                              key={`${source.documentId}:${source.sourceUnitId}:${source.pageNumber}`}
                              label={`Side ${source.pageNumber}`}
                            />
                          ))}
                        </span>
                      ) : (
                        <small>Ikke dokumentert med egen kildehenvisning.</small>
                      )}
                    </li>
                  ))}
                </ol>
              ) : section.emptyText ? (
                <p className="saksrom-live-summary__empty">{section.emptyText}</p>
              ) : null}
              {(section.sources ?? []).length > 0 ? (
                <div className="saksrom-live-summary__sources" aria-label="Kilder">
                  {section.sources?.map((source) => (
                    <CitationChip
                      citation={citationFromSource(source)}
                      documentName={sourceDocumentName(source, documents)}
                      excerpt={source.quote}
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
