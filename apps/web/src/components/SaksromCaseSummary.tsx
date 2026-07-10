import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EvidaDocument,
  fetchSaksromSummary,
  SaksromSummary,
  SaksromSummaryFinding,
  SourceCoverage,
  SourceReference
} from "../lib/api";
import { citationStore } from "../lib/CitationManager";
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
  onShowSourceBasis
}: SaksromCaseSummaryProps) {
  const [summary, setSummary] = useState<SaksromSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [generatedFingerprint, setGeneratedFingerprint] = useState(() => fingerprintFor(documents, sourceCoverage));
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

  const loadSummary = useCallback(async () => {
    if (!caseId || !tenantId || !hasReadySourceUnits) {
      setSummary(null);
      setSummaryError(null);
      setGeneratedFingerprint(currentFingerprint);
      return;
    }

    setIsLoading(true);
    setSummaryError(null);
    try {
      const nextSummary = await fetchSaksromSummary(tenantId, {
        caseId,
        includePartial: true,
        sourceBasis: "READY_PAGE_UNITS_ONLY"
      });
      setSummary(nextSummary);
      setGeneratedFingerprint(currentFingerprint);
    } catch (error) {
      setSummary(null);
      setSummaryError(error instanceof Error ? error.message : "Kunne ikke hente kildebundet oppsummering.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId, currentFingerprint, hasReadySourceUnits, tenantId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  function showSourceBasis() {
    const firstSource = summarySources[0];
    if (firstSource) {
      jumpToSource(firstSource);
      return;
    }
    onShowSourceBasis?.();
  }

  function copySummary() {
    const text = [
      title,
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
      setCopyStatus("Oppsummeringen er kopiert.");
      window.setTimeout(() => setCopyStatus(null), 2400);
    }).catch(() => {
      setCopyStatus("Kunne ikke kopiere oppsummeringen.");
      window.setTimeout(() => setCopyStatus(null), 3200);
    });
  }

  return (
    <section className="saksrom-case-summary" aria-labelledby="case-summary-title">
      <header className="case-summary-header">
        <div>
          <span className="pane-kicker">Kildebundet oppstart</span>
          <h3 id="case-summary-title">{title}</h3>
          <p>Oppsummeringen produseres fra ferdige PageUnits. Uferdige sider brukes ikke som kilde.</p>
        </div>
        <div className="case-summary-actions" aria-label="Oppsummeringshandlinger">
          <button disabled={isLoading} onClick={() => void loadSummary()} type="button">
            Oppsummer saken på nytt
          </button>
          <button disabled={summarySources.length === 0} onClick={showSourceBasis} type="button">
            Vis kildegrunnlag
          </button>
          <button onClick={onGoToMissingDocuments} type="button">
            Gå til manglende dokumenter
          </button>
          <button onClick={copySummary} type="button">
            Kopier oppsummering
          </button>
        </div>
      </header>

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

      {isStale ? (
        <div className="summary-stale-warning" role="status">
          <span>Kildegrunnlaget er oppdatert siden denne oppsummeringen ble laget.</span>
          <button onClick={() => void loadSummary()} type="button">Oppsummer saken på nytt</button>
        </div>
      ) : null}

      {isLoading ? <p className="summary-empty-state">Henter kildebundet oppsummering...</p> : null}

      {copyStatus ? (
        <div className="summary-copy-toast" role="status">
          {copyStatus}
        </div>
      ) : null}

      <div className="summary-sections saksrom-summary-body">
        <section className="saksrom-summary-section">
          <h4>Hovedoversikt</h4>
          <ul className="saksrom-summary-list">
            {overviewBullets.map((bullet) => (
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
                        <strong>{finding.heading}:</strong> {compactText(finding.text, 280)}
                        <div className="summary-source-pill-row">
                          {(finding.sources ?? []).map((source) => (
                            <button key={source.sourceUnitId} onClick={() => jumpToSource(source)} type="button">
                              {sourceLabel(source)}
                            </button>
                          ))}
                        </div>
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
    </section>
  );
}
