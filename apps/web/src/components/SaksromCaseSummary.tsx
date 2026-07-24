import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EvidaDocument,
  fetchSaksromSummary,
  SaksromSummary,
  SaksromSummaryFinding,
  SaksromSummaryStreamEvent,
  SaksromSummaryStreamUnavailableError,
  SourceCoverage,
  SourceReference,
  streamSaksromSummary
} from "../lib/api";
import { AiStreamServerError, streamSaksromSummarySse } from "../lib/aiStream";
import { citationStore } from "../lib/CitationManager";
import type { WorkspaceView } from "../navigation";
import { StreamingText } from "./StreamingText";
import "./SaksromCaseSummary.css";

interface SaksromCaseSummaryProps {
  documents: EvidaDocument[];
  coverage: number;
  pendingCount: number;
  failedCount: number;
  caseId?: string;
  tenantId?: string;
  sourceCoverage?: SourceCoverage | null;
  onGoToMissingDocuments?: () => void;
  onNavigate?: (view: WorkspaceView) => void;
  onShowSourceBasis?: () => void;
}

const notDocumented = "Ikke dokumentert i tilgjengelig kildegrunnlag.";

function isSourceReady(document: EvidaDocument) {
  return document.status === "source_ready" || document.status === "verified";
}

function isPartialSourceReady(document: EvidaDocument) {
  return document.status === "partial_source_ready";
}

function readyDocuments(documents: EvidaDocument[]) {
  return documents.filter((document) => isSourceReady(document) || isPartialSourceReady(document));
}

function fingerprintFor(documents: EvidaDocument[], sourceCoverage?: SourceCoverage | null) {
  const documentFingerprint = documents
    .map((document) => `${document.id}:${document.status}:${document.pages}:${document.ingestionError ?? ""}`)
    .sort()
    .join("|");
  const coverageFingerprint = sourceCoverage
    ? `${sourceCoverage.readyPages}/${sourceCoverage.totalPages}:${sourceCoverage.missingOcrPageRanges}:${sourceCoverage.belowThresholdPageRanges}`
    : "";
  return `${documentFingerprint}::${coverageFingerprint}`;
}

function sourceLabel(source: SourceReference) {
  return `Side ${source.pageNumber}`;
}

function technicalSourceLabel(source: SourceReference) {
  return `${source.documentId.slice(0, 8)} · ${source.sourceUnitId} · side ${source.pageNumber}`;
}

function jumpToSource(source: SourceReference) {
  citationStore.jumpToSource({
    documentId: source.documentId,
    sourceUnitId: source.sourceUnitId,
    page: source.pageNumber,
    paragraph: "saksrom-summary",
    rect: { top: 120, left: 48, width: 360, height: 42 }
  });
}

type NextAction = {
  label: string;
  reason: string;
  actionType: "route" | "open-source" | "regenerate-summary" | "upload";
  targetView?: WorkspaceView;
  sourceTarget?: SourceReference;
};

type SummaryGenerationState =
  | "idle"
  | "reading_sources"
  | "extracting_findings"
  | "linking_citations"
  | "composing_summary"
  | "complete"
  | "failed"
  | "cancelled";

const generationSteps: Array<{ state: SummaryGenerationState; label: string }> = [
  { state: "reading_sources", label: "Leser kildegrunnlaget" },
  { state: "extracting_findings", label: "Identifiserer faktiske funn" },
  { state: "linking_citations", label: "Knytter funn til kilder" },
  { state: "composing_summary", label: "Bygger foreløpig saksoversikt" }
];

function compactText(value: string, maxLength = 360) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function legalOverviewBullets(summary: SaksromSummary | null, pageCoverageText: string, missingText: string) {
  if (!summary?.summary) {
    return [
      "Kildegrunnlaget er ikke tilstrekkelig til en juridisk oversikt ennå.",
      `Kildedekning: ${pageCoverageText}.`,
      `Mangler: ${missingText}.`
    ];
  }

  const primary = compactText(summary.summary, 520);
  return [
    primary,
    `Kildegrunnlaget omfatter ${pageCoverageText}.`,
    `Uferdige sider eller dokumenter brukes ikke som kilde: ${missingText}.`
  ];
}

function themeForFinding(finding: SaksromSummaryFinding) {
  const text = `${finding.heading} ${finding.text}`.toLowerCase();
  if (text.includes("rettsbok") || text.includes("retten") || text.includes("prosess")) {
    return "Rettsbok og prosess";
  }
  if (text.includes("avtale") || text.includes("kontrakt") || text.includes("leietaker") || text.includes("utleier")) {
    return "Avtale, ansvar og dokumentasjon";
  }
  if (text.includes("motstrid") || text.includes("usikker") || text.includes("bestrid")) {
    return "Motstrid og usikkerhet";
  }
  return "Øvrige kildeutdrag";
}

function groupedFindings(findings: SaksromSummaryFinding[]) {
  const groups = new Map<string, SaksromSummaryFinding[]>();
  findings.forEach((finding) => {
    const theme = themeForFinding(finding);
    groups.set(theme, [...(groups.get(theme) ?? []), finding]);
  });
  return Array.from(groups.entries()).map(([theme, items]) => ({ theme, items }));
}

export function SaksromCaseSummary({
  documents,
  coverage,
  pendingCount,
  failedCount,
  caseId,
  tenantId,
  sourceCoverage,
  onGoToMissingDocuments,
  onNavigate,
  onShowSourceBasis
}: SaksromCaseSummaryProps) {
  const [summary, setSummary] = useState<SaksromSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationState, setGenerationState] = useState<SummaryGenerationState>("idle");
  const [streamFallback, setStreamFallback] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [generatedFingerprint, setGeneratedFingerprint] = useState(() => fingerprintFor(documents, sourceCoverage));
  const streamController = useRef<AbortController | null>(null);
  const streamRequestId = useRef(0);
  const currentFingerprint = useMemo(() => fingerprintFor(documents, sourceCoverage), [documents, sourceCoverage]);
  const readyDocs = useMemo(() => readyDocuments(documents), [documents]);

  const readyPageCount = sourceCoverage?.readyPages ?? 0;
  const totalPageCount = sourceCoverage?.totalPages ?? 0;
  const hasReadySourceUnits = sourceCoverage ? readyPageCount > 0 : readyDocs.length > 0;
  const hasNoSourceBasis = !hasReadySourceUnits;
  const isPreliminary = sourceCoverage?.totalPages
    ? sourceCoverage.readyPages < sourceCoverage.totalPages
    : coverage < 100 || pendingCount > 0 || failedCount > 0 || documents.some(isPartialSourceReady);
  const isStale = generatedFingerprint !== currentFingerprint;
  const summarySources = summary?.sources ?? [];
  const summaryFindings = summary?.findings ?? [];
  const visibleFindings = showAllFindings ? summaryFindings : summaryFindings.slice(0, 5);
  const findingGroups = groupedFindings(visibleFindings);
  const summaryWarnings = summary?.warnings ?? [];
  const title = summary?.title ?? (isPreliminary ? "Foreløpig saksoppsummering" : "Saksoppsummering");
  const pageCoverageText = totalPageCount > 0 ? `${readyPageCount} av ${totalPageCount} sider` : `${readyDocs.length} dokumenter`;
  const missingText = sourceCoverage?.missingOcrPages
    ? `${sourceCoverage.missingOcrPages} sider krever OCR`
    : `${Math.max(0, documents.length - readyDocs.length)} dokumenter`;
  const controlText = sourceCoverage?.belowThresholdPages
    ? `${sourceCoverage.belowThresholdPages} sider krever kontroll`
    : `${failedCount} dokumenter`;
  const overviewBullets = legalOverviewBullets(summary, pageCoverageText, missingText);
  const isProcessing = pendingCount > 0;
  const hasControlPages = (sourceCoverage?.belowThresholdPages ?? 0) > 0 || failedCount > 0;
  const hasMissingPages = (sourceCoverage?.missingOcrPages ?? 0) > 0;
  const missingOrControlCount = Math.max(
    1,
    (sourceCoverage?.belowThresholdPages ?? 0) + (sourceCoverage?.missingOcrPages ?? 0) + failedCount
  );
  const nextAction: NextAction = hasNoSourceBasis
    ? {
        label: "Last opp kilder",
        reason: "Saksrom kan ikke svare før minst én kildeenhet finnes.",
        actionType: "upload",
        targetView: "import"
      }
    : isProcessing
    ? {
        label: "Se behandlingsstatus",
        reason: "Noen dokumenter behandles fortsatt og må kontrolleres før de brukes fullt ut.",
        actionType: "route",
        targetView: "quarantine"
      }
    : hasControlPages || hasMissingPages
    ? {
        label: `Kontroller ${missingOrControlCount} manglende ${missingOrControlCount === 1 ? "side" : "sider"}`,
        reason: "Noen sider er utelatt fra kildegrunnlaget og bør gjennomgås før utkast.",
        actionType: "route",
        targetView: "quarantine"
      }
    : {
        label: "Åpne Bevismatrise",
        reason: "Kildegrunnlaget er komplett nok til å mappe påstander mot bevis.",
        actionType: "route",
        targetView: "evidence"
      };
  const activeGenerationStepIndex = generationSteps.findIndex((step) => step.state === generationState);
  const isGeneratingSummary = activeGenerationStepIndex >= 0;
  const isStreamingSummary = isLoading && isGeneratingSummary;
  const showSummarySections = hasNoSourceBasis || Boolean(summary);

  const emptyStreamingSummary = useCallback((): SaksromSummary => ({
    caseId: caseId ?? "",
    title: isPreliminary ? "Foreløpig saksoppsummering" : "Saksoppsummering",
    summary: "",
    findings: [],
    sources: [],
    sourceBound: true,
    warnings: [],
    coverage: sourceCoverage ?? null
  }), [caseId, isPreliminary, sourceCoverage]);

  const addUniqueSource = (sources: SourceReference[], source: SourceReference) =>
    sources.some((existing) => existing.sourceUnitId === source.sourceUnitId) ? sources : [...sources, source];

  const applyStreamEvent = useCallback((event: SaksromSummaryStreamEvent) => {
    if (event.type === "stage") {
      setGenerationState(event.stage);
      return;
    }
    if (event.type === "text_delta") {
      setSummary((current) => ({
        ...(current ?? emptyStreamingSummary()),
        summary: `${current?.summary ?? ""}${event.text}`
      }));
      return;
    }
    if (event.type === "citation") {
      setSummary((current) => ({
        ...(current ?? emptyStreamingSummary()),
        sources: addUniqueSource(current?.sources ?? [], event.citation)
      }));
      return;
    }
    if (event.type === "finding") {
      const finding: SaksromSummaryFinding = {
        heading: event.heading ?? event.theme,
        text: event.text,
        sources: event.citations ?? []
      };
      setSummary((current) => {
        const base = current ?? emptyStreamingSummary();
        const nextSources = finding.sources.reduce(addUniqueSource, base.sources);
        return {
          ...base,
          findings: [...base.findings, finding],
          sources: nextSources
        };
      });
      return;
    }
    if (event.type === "warning") {
      setSummary((current) => {
        const base = current ?? emptyStreamingSummary();
        return {
          ...base,
          warnings: base.warnings.includes(event.code) ? base.warnings : [...base.warnings, event.code]
        };
      });
      return;
    }
    if (event.type === "complete") {
      if (event.summary) {
        setSummary(event.summary);
      }
      setGenerationState("complete");
      setGeneratedFingerprint(currentFingerprint);
      return;
    }
    if (event.type === "error") {
      setGenerationState("failed");
      setSummaryError(event.message);
    }
  }, [currentFingerprint, emptyStreamingSummary]);

  const abortSummary = useCallback(() => {
    streamRequestId.current += 1;
    streamController.current?.abort();
    streamController.current = null;
    setIsLoading(false);
    setGenerationState("cancelled");
  }, []);

  const loadSummary = useCallback(async () => {
    streamRequestId.current += 1;
    streamController.current?.abort();
    if (!caseId || !tenantId || !hasReadySourceUnits) {
      setSummary(null);
      setSummaryError(null);
      setGenerationState("idle");
      setStreamFallback(false);
      setGeneratedFingerprint(currentFingerprint);
      return;
    }

    const requestId = streamRequestId.current;
    const controller = new AbortController();
    streamController.current = controller;
    setSummary(null);
    setIsLoading(true);
    setGenerationState("idle");
    setSummaryError(null);
    setStreamFallback(false);

    const streamPayload = { caseId, includePartial: true, sourceBasis: "READY_PAGE_UNITS_ONLY" as const };
    const isCurrent = () => requestId === streamRequestId.current && !controller.signal.aborted;

    // Track whether any content reached the user; a mid-stream failure after this point must never
    // wipe what is already on screen (acceptance criterion: streaming errors preserve shown content).
    let receivedContent = false;
    const handleEvent = (event: SaksromSummaryStreamEvent) => {
      if (!isCurrent()) {
        return;
      }
      if (event.type === "text_delta" || event.type === "finding" || event.type === "complete") {
        receivedContent = true;
      }
      applyStreamEvent(event);
    };

    try {
      try {
        // Preferred transport: true SSE, token-by-token. Default for all AI responses.
        await streamSaksromSummarySse(tenantId, streamPayload, handleEvent, controller.signal);
      } catch (sseError) {
        if (!isCurrent()) {
          return;
        }
        // Server error after content already streamed: keep it, offer inline retry, do not restart.
        if (sseError instanceof AiStreamServerError && sseError.receivedContent) {
          setGenerationState("failed");
          setSummaryError(sseError.message);
          return;
        }
        // SSE unavailable/failed before any content arrived: fall back to the NDJSON stream transport.
        if (receivedContent) {
          throw sseError;
        }
        await streamSaksromSummary(tenantId, streamPayload, handleEvent, controller.signal);
      }
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      if (error instanceof SaksromSummaryStreamUnavailableError && !receivedContent) {
        setStreamFallback(true);
        try {
          const nextSummary = await fetchSaksromSummary(tenantId, streamPayload);
          if (!isCurrent()) {
            return;
          }
          setSummary(nextSummary);
          setGenerationState("complete");
          setGeneratedFingerprint(currentFingerprint);
        } catch (fallbackError) {
          if (!isCurrent()) {
            return;
          }
          setSummary(null);
          setGenerationState("failed");
          setSummaryError(
            fallbackError instanceof Error ? fallbackError.message : "Kunne ikke hente kildebundet oppsummering."
          );
        }
        return;
      }
      // Any other failure: preserve already-shown content, surface an inline retry.
      if (!receivedContent) {
        setSummary(null);
      }
      setGenerationState("failed");
      setSummaryError(error instanceof Error ? error.message : "Kunne ikke hente kildebundet oppsummering.");
    } finally {
      if (requestId === streamRequestId.current) {
        streamController.current = null;
        setIsLoading(false);
      }
    }
  }, [applyStreamEvent, caseId, currentFingerprint, hasReadySourceUnits, tenantId]);

  useEffect(() => {
    void loadSummary();
    return () => {
      streamRequestId.current += 1;
      streamController.current?.abort();
    };
  }, [loadSummary]);

  function copySummary() {
    const text = [
      isStreamingSummary ? `${title} (foreløpig, generering pågår)` : title,
      ...overviewBullets,
      `Kildegrunnlag: ${pageCoverageText}`,
      `Mangler: ${missingText}`,
      `Krever kontroll: ${controlText}`
    ].join("\n");
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Kunne ikke kopiere oppsummeringen.");
      window.setTimeout(() => setCopyStatus(null), 3200);
      return;
    }
    void navigator.clipboard.writeText(text).then(() => {
      setCopyStatus(isStreamingSummary ? "Foreløpig oppsummering er kopiert." : "Oppsummeringen er kopiert.");
      window.setTimeout(() => setCopyStatus(null), 2400);
    }).catch(() => {
      setCopyStatus("Kunne ikke kopiere oppsummeringen.");
      window.setTimeout(() => setCopyStatus(null), 3200);
    });
  }

  function showSourceBasis() {
    const firstSource = summarySources[0];
    if (firstSource) {
      jumpToSource(firstSource);
      return;
    }
    onShowSourceBasis?.();
  }

  function runNextAction() {
    if (nextAction.actionType === "open-source" && nextAction.sourceTarget) {
      jumpToSource(nextAction.sourceTarget);
      return;
    }
    if (nextAction.actionType === "regenerate-summary") {
      void loadSummary();
      return;
    }
    if (nextAction.targetView === "quarantine" && onGoToMissingDocuments) {
      onGoToMissingDocuments();
      return;
    }
    if (nextAction.targetView) {
      onNavigate?.(nextAction.targetView);
    }
  }

  return (
    <section className="saksrom-case-summary" aria-labelledby="case-summary-title">
      <header className="case-summary-header">
        <div>
          <span className="pane-kicker">Kildebundet oppstart</span>
          <h3 id="case-summary-title">{title}</h3>
          <p>Oppsummeringen produseres fra ferdige PageUnits. Uferdige sider brukes ikke som kilde.</p>
        </div>
      </header>
      <section className="summary-next-action-card" aria-label="Anbefalt neste handling">
        <span className="pane-kicker">Neste handling</span>
        <h4>{nextAction.label}</h4>
        <p>{nextAction.reason}</p>
        <button onClick={runNextAction} type="button">
          {nextAction.label}
        </button>
      </section>

      <details className="case-summary-secondary-actions">
        <summary>Flere handlinger</summary>
        <div className="case-summary-actions" aria-label="Sekundære oppsummeringshandlinger">
          <button onClick={() => void loadSummary()} type="button">
            Oppsummer saken på nytt
          </button>
          {isLoading ? (
            <button onClick={abortSummary} type="button">
              Avbryt generering
            </button>
          ) : null}
          <button disabled={summarySources.length === 0} onClick={showSourceBasis} type="button">
            Vis kildegrunnlag
          </button>
          <button onClick={copySummary} type="button">
            Kopier oppsummering
          </button>
        </div>
      </details>

      {isPreliminary ? (
        <div className="summary-preliminary-marker" role="status">
          <strong>Foreløpig kildegrunnlag</strong>
          <span>Oppsummeringen bygger på {pageCoverageText}. {controlText !== "0 dokumenter" ? `${controlText}.` : ""}</span>
          <dl>
            <div>
              <dt>Analysert nå</dt>
              <dd>{pageCoverageText}</dd>
            </div>
            <div>
              <dt>Mangler fortsatt</dt>
              <dd>{missingText}</dd>
            </div>
            <div>
              <dt>Krever kontroll</dt>
              <dd>{controlText}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {hasNoSourceBasis ? (
        <p className="summary-empty-state">
          Saksrommet er åpnet, men det finnes ennå ikke ferdig behandlet kildegrunnlag å oppsummere.
        </p>
      ) : null}

      {summaryError ? (
        <div className="summary-stale-warning" role="status">
          <span>{summaryError}</span>
          <button onClick={() => void loadSummary()} type="button">Prøv igjen</button>
        </div>
      ) : null}

      {generationState === "cancelled" ? (
        <div className="summary-stale-warning" role="status">
          <span>Genereringen er avbrutt. Mottatt innhold blir stående.</span>
          <button onClick={() => void loadSummary()} type="button">Prøv igjen</button>
        </div>
      ) : null}

      {streamFallback ? (
        <div className="summary-stale-warning" role="status">
          <span>Streaming-endepunktet var ikke tilgjengelig. Viser vanlig kildebundet oppsummering.</span>
        </div>
      ) : null}

      {isStale ? (
        <div className="summary-stale-warning" role="status">
          <span>Kildegrunnlaget er oppdatert siden denne oppsummeringen ble laget.</span>
          <button onClick={() => void loadSummary()} type="button">Oppsummer saken på nytt</button>
        </div>
      ) : null}

      {isGeneratingSummary ? (
        <div className="summary-generation-panel" role="status" aria-live="polite">
          <strong>
            {generationSteps[activeGenerationStepIndex].label}
            {isStreamingSummary ? <span className="summary-live-cursor" aria-hidden="true">|</span> : null}
          </strong>
          <ol className="summary-generation-steps">
            {generationSteps.map((step, index) => {
              const stepStatus = index < activeGenerationStepIndex
                ? "complete"
                : index === activeGenerationStepIndex
                ? "active"
                : "pending";
              return (
                <li className={`summary-generation-step is-${stepStatus}`} key={step.state}>
                  {step.label}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {generationState === "complete" ? (
        <p className="summary-ready-state" role="status">Saksoversikt klar</p>
      ) : null}

      {copyStatus ? (
        <div className="summary-copy-toast" role="status">
          {copyStatus}
        </div>
      ) : null}

      {showSummarySections ? (
        <div className={`summary-sections saksrom-summary-body ${summary ? "summary-sections--live" : ""}`}>
        <section className="saksrom-summary-section">
          <h4>Hovedoversikt</h4>
          <ul className="saksrom-summary-list">
            <li key="primary">
              <StreamingText
                text={overviewBullets[0]}
                streaming={isStreamingSummary}
                error={!isStreamingSummary && generationState === "failed" ? summaryError : null}
                onRetry={() => void loadSummary()}
                ariaLabel="Hovedoversikt"
              />
            </li>
            {overviewBullets.slice(1).map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>

        <section className="saksrom-summary-section">
          <h4>Faktiske funn</h4>
          {findingGroups.length ? (
            <div className="summary-theme-grid">
              {findingGroups.map((group) => (
                <article className="summary-theme-card" key={group.theme}>
                  <h5>{group.theme}</h5>
                  <ul className="saksrom-summary-list">
                    {group.items.map((finding) => (
                      <li key={`${finding.heading}-${finding.text}`}>
                        <span className="summary-claim-text">
                          <strong>{finding.heading}:</strong> {compactText(finding.text, 280)}
                        </span>
                        <span className="summary-source-pill-row summary-source-pill-row--inline">
                          {(finding.sources ?? []).map((source) => (
                            <button key={source.sourceUnitId} onClick={() => jumpToSource(source)} type="button">
                              {sourceLabel(source)}
                            </button>
                          ))}
                          {(finding.sources ?? []).length === 0 ? <span className="unsupported-claim">Ikke dokumentert</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="summary-body-text">{notDocumented}</p>
          )}
          {summaryFindings.length > 5 ? (
            <button className="summary-disclosure-button" onClick={() => setShowAllFindings((value) => !value)} type="button">
              {showAllFindings ? "Vis færre funn" : `Vis flere funn (${summaryFindings.length - 5})`}
            </button>
          ) : null}
        </section>

        <section className="saksrom-summary-section">
          <h4>Sentrale bevis</h4>
          <div className="summary-source-pill-row">
            {summarySources.slice(0, showAllFindings ? summarySources.length : 8).map((source) => (
              <button key={source.sourceUnitId} onClick={() => jumpToSource(source)} type="button">
                {sourceLabel(source)}
              </button>
            ))}
          </div>
          {summarySources.length === 0 ? <p className="summary-body-text">{notDocumented}</p> : null}
        </section>

        <section className="saksrom-summary-section">
          <h4>Mangler og usikkerhet</h4>
          <ul className="saksrom-summary-list">
            <li>Analysen omfatter {isPreliminary ? "bare ferdig behandlet kildegrunnlag" : "gjeldende kildegrunnlag"}.</li>
            <li>Mangler fortsatt: {missingText}.</li>
            <li>Krever kontroll: {controlText}.</li>
          </ul>
        </section>

        <section className="saksrom-summary-section summary-technical-section">
          <button className="summary-disclosure-button" onClick={() => setShowTechnicalDetails((value) => !value)} type="button">
            {showTechnicalDetails ? "Skjul tekniske detaljer" : "Vis tekniske detaljer"}
          </button>
          {showTechnicalDetails ? (
            <div className="summary-technical-details">
              <dl>
                <div>
                  <dt>Kildebundet</dt>
                  <dd>{summary?.sourceBound ? "Ja" : "Nei"}</dd>
                </div>
                <div>
                  <dt>Source basis</dt>
                  <dd>READY_PAGE_UNITS_ONLY</dd>
                </div>
                <div>
                  <dt>Varsler</dt>
                  <dd>{summaryWarnings.length ? summaryWarnings.join(", ") : "Ingen"}</dd>
                </div>
                <div>
                  <dt>Kilder</dt>
                  <dd>{summarySources.map(technicalSourceLabel).join("; ") || "Ingen"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>
        </div>
      ) : null}
    </section>
  );
}
