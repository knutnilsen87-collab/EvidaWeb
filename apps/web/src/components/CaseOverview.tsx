import { useEffect, useMemo, useState } from "react";
import { CaseFileDto, fetchCases } from "../lib/api";
import "./Dashboard.css";

interface CaseOverviewProps {
  tenantId?: string;
  onNewCase: () => void;
  onOpenCase: (caseFile: CaseFileDto) => void;
}

type CaseListState =
  | { status: "loading"; cases: CaseFileDto[]; error: null }
  | { status: "loaded"; cases: CaseFileDto[]; error: null }
  | { status: "error"; cases: CaseFileDto[]; error: string };

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function caseSecondaryLine(caseFile: CaseFileDto) {
  const updated = formatDate(caseFile.updatedAt ?? caseFile.createdAt);
  const details = [
    updated ? `Oppdatert ${updated}` : null,
    caseFile.documentCount != null ? `${caseFile.documentCount} dokumenter` : null,
    caseFile.sourceCoveragePercent != null ? `${caseFile.sourceCoveragePercent}% kildedekning` : null
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "Klar for dokumentinntak";
}

export function CaseOverview({ tenantId, onNewCase, onOpenCase }: CaseOverviewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<CaseListState>({
    status: tenantId ? "loading" : "loaded",
    cases: [],
    error: null
  });

  useEffect(() => {
    if (!tenantId) {
      setState({ status: "loaded", cases: [], error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ status: "loading", cases: current.cases, error: null }));
    fetchCases(tenantId)
      .then((cases) => {
        if (!cancelled) {
          setState({ status: "loaded", cases, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            cases: [],
            error: error instanceof Error ? error.message : "Sakslisten kunne ikke hentes."
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const sortedCases = useMemo(
    () =>
      [...state.cases].sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      }),
    [state.cases]
  );

  return (
    <section className="case-overview" aria-labelledby="case-overview-title">
      <header className="case-overview__header">
        <span className="portal-kicker">EVIDA // Saksmapper</span>
        <div className="case-overview__title-row">
          <div>
            <h1 className="portal-title serif-title" id="case-overview-title">
              Saksoversikt
            </h1>
            <p className="portal-supporting-text">
              Velg en påbegynt sak, eller opprett en ny sak for å laste opp dokumenter.
            </p>
          </div>
          <button className="large-action-btn primary-wizard" type="button" onClick={onNewCase}>
            Opprett ny sak
          </button>
        </div>
      </header>

      <div className="case-overview__body">
        {state.status === "loading" ? (
          <div className="case-overview__state liquid-glass-panel" role="status">
            <span className="status-pill status-pill--processing">Henter saker</span>
            <h2>Laster sakslisten</h2>
            <p>Henter påbegynte saker fra backend.</p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="case-overview__state liquid-glass-panel" role="alert">
            <span className="status-pill status-pill--blocked">API utilgjengelig</span>
            <h2>Sakslisten kunne ikke hentes.</h2>
            <p>Kontroller at API-et kjører, eller prøv igjen.</p>
            <button className="btn-primary" type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Prøv igjen
            </button>
          </div>
        ) : null}

        {state.status === "loaded" && sortedCases.length === 0 ? (
          <div className="case-overview__state liquid-glass-panel">
            <span className="status-pill status-pill--processing">Ingen saker</span>
            <h2>Ingen saker er opprettet ennå.</h2>
            <p>Opprett en sak for å begynne å bygge kildegrunnlaget.</p>
            <button className="btn-primary" type="button" onClick={onNewCase}>
              Opprett ny sak
            </button>
          </div>
        ) : null}

        {state.status === "loaded" && sortedCases.length > 0 ? (
          <div className="case-overview__grid" aria-label="Påbegynte saker">
            {sortedCases.map((caseFile) => (
              <article className="case-folder-card liquid-glass-panel" key={caseFile.id}>
                <div>
                  <span className="case-folder-card__status">{caseFile.status || "OPEN"}</span>
                  <h2>{caseFile.title}</h2>
                  <p>{caseSecondaryLine(caseFile)}</p>
                </div>
                <button className="btn-primary" type="button" onClick={() => onOpenCase(caseFile)}>
                  Åpne sak
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
