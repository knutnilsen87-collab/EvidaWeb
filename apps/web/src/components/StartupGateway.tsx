import { useEffect, useMemo, useState } from "react";
import { CaseFileDto, fetchCases } from "../lib/api";
import "./StartupGateway.css";

type CaseListState =
  | { status: "loading"; cases: CaseFileDto[]; error: null }
  | { status: "loaded"; cases: CaseFileDto[]; error: null }
  | { status: "error"; cases: CaseFileDto[]; error: string };

interface StartupGatewayProps {
  activeCaseName?: string | null;
  caseResolutionError?: string | null;
  caseResolutionState?: "none_selected" | "creating" | "resolving" | "resolved" | "failed";
  tenantId?: string;
  onNewCase: () => void;
  onOpenCase: (caseFile: CaseFileDto) => void;
  onRetryCaseResolution?: () => void;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function caseMeta(caseFile: CaseFileDto) {
  const updated = formatDate(caseFile.updatedAt ?? caseFile.createdAt);
  return [
    updated ? `Oppdatert ${updated}` : null,
    caseFile.documentCount != null ? `${caseFile.documentCount} dokumenter` : null,
    caseFile.sourceCoveragePercent != null ? `${caseFile.sourceCoveragePercent}% kildedekning` : null
  ].filter(Boolean).join(" · ");
}

export function StartupGateway({
  activeCaseName,
  caseResolutionError,
  caseResolutionState = "none_selected",
  tenantId,
  onNewCase,
  onOpenCase,
  onRetryCaseResolution
}: StartupGatewayProps) {
  const [query, setQuery] = useState("");
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

  const filteredCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...state.cases]
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      })
      .filter((caseFile) => !needle || caseFile.title.toLowerCase().includes(needle));
  }, [query, state.cases]);

  const isResolvingCase = caseResolutionState === "creating" || caseResolutionState === "resolving";

  return (
    <main className="startup-gateway" aria-labelledby="startup-title">
      <section className="startup-gateway__hero">
        <div className="startup-gateway__brand">EVIDA</div>
        <div className="startup-gateway__intro">
          <span>EVIDA // Saksmapper</span>
          <h1 id="startup-title">Saksoversikt</h1>
          <p>Velg en påbegynt sak, eller opprett en ny sak for å laste opp dokumenter.</p>
        </div>
        <button className="startup-gateway__primary" type="button" onClick={onNewCase}>
          Opprett ny sak
        </button>
      </section>

      <section className="startup-gateway__tools" aria-label="Søk og status">
        <label>
          <span>Søk i saker</span>
          <input
            aria-label="Søk i saker"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Søk etter sak..."
            type="search"
            value={query}
          />
        </label>
        {isResolvingCase ? (
          <div className="startup-gateway__notice" role="status">
            <strong>{activeCaseName ?? "Saken"} klargjøres</strong>
            <span>Venter på backend-registrering før arbeidsrommet åpnes.</span>
          </div>
        ) : null}
        {caseResolutionState === "failed" ? (
          <div className="startup-gateway__notice startup-gateway__notice--error" role="alert">
            <strong>Saken kunne ikke klargjøres</strong>
            <span>{caseResolutionError ?? "Kontroller at API-et kjører, eller prøv igjen."}</span>
            {onRetryCaseResolution ? (
              <button type="button" onClick={onRetryCaseResolution}>
                Prøv igjen
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="startup-gateway__cases" aria-label="Saksliste">
        {state.status === "loading" ? (
          <article className="startup-gateway__state" role="status">
            <span>Henter saker</span>
            <h2>Laster sakslisten</h2>
            <p>Henter påbegynte saker fra backend.</p>
          </article>
        ) : null}

        {state.status === "error" ? (
          <article className="startup-gateway__state startup-gateway__state--error" role="alert">
            <span>API utilgjengelig</span>
            <h2>Sakslisten kunne ikke hentes.</h2>
            <p>Kontroller at API-et kjører, eller prøv igjen.</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Prøv igjen
            </button>
          </article>
        ) : null}

        {state.status === "loaded" && filteredCases.length === 0 ? (
          <article className="startup-gateway__state">
            <span>Ingen saker</span>
            <h2>{query ? "Ingen saker matcher søket." : "Ingen saker er opprettet ennå."}</h2>
            <p>{query ? "Endre søket, eller opprett en ny sak." : "Opprett en sak for å begynne å bygge kildegrunnlaget."}</p>
            <button type="button" onClick={onNewCase}>
              Opprett ny sak
            </button>
          </article>
        ) : null}

        {state.status === "loaded" && filteredCases.length > 0 ? (
          <div className="startup-gateway__grid">
            {filteredCases.map((caseFile) => (
              <article className="startup-case-card" key={caseFile.id}>
                <div>
                  <span>{caseFile.status || "OPEN"}</span>
                  <h2>{caseFile.title}</h2>
                  <p>{caseMeta(caseFile) || "Klar for dokumentinntak"}</p>
                </div>
                <button type="button" onClick={() => onOpenCase(caseFile)}>
                  Åpne sak
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
