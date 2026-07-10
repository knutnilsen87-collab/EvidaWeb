import { motion } from "framer-motion";
import { DragEvent, useMemo, useState } from "react";
import { genererKonklusjon } from "./BevisAnalyse";
import { BevisElement, BevisKrav, citationStore } from "../lib/CitationManager";
import "./Bevismatrise.css";

type StraffeTema = "Objektiv gjerningsbeskrivelse" | "Skyldkrav";

interface EvidenceSource {
  id: string;
  filename: string;
  excerpt: string;
  pages: string;
  page: number;
  status: "Kildeklar";
}

interface StraffeBevisElement extends BevisElement {
  tema: StraffeTema;
  vilkar: string;
  tvilspunkt: string;
  evidence: string[];
}

const evidenceSources: EvidenceSource[] = [
  {
    id: "doc_001",
    filename: "politirapport_doc_001.pdf",
    excerpt: "Anmeldelse og politiets første sammenstilling av hendelsesforløpet.",
    pages: "s. 4-6",
    page: 4,
    status: "Kildeklar"
  },
  {
    id: "doc_014",
    filename: "avhor_doc_014.pdf",
    excerpt: "Vitneforklaring om observasjonstidspunkt og identifikasjon.",
    pages: "s. 18-21",
    page: 18,
    status: "Kildeklar"
  },
  {
    id: "doc_022",
    filename: "sakkyndig_doc_022.pdf",
    excerpt: "Teknisk rapport som vurderer spor og alternative forklaringer.",
    pages: "s. 31-36",
    page: 31,
    status: "Kildeklar"
  }
];

const initialEvidence: StraffeBevisElement[] = [
  {
    id: "b1",
    tema: "Objektiv gjerningsbeskrivelse",
    vilkar: "Handlingens utførelse",
    beskrivelse: "Bevis for at den straffbare handlingen faktisk ble utført.",
    styrke: "utover_rimelig_tvil",
    kildeRef: "doc_001",
    tvilspunkt: "Ingen aktiv tvil markert.",
    evidence: ["doc_001"]
  },
  {
    id: "b2",
    tema: "Skyldkrav",
    vilkar: "Forsett eller uaktsomhet",
    beskrivelse: "Indikasjoner på forsett må forankres i forklaringer og omstendigheter.",
    styrke: "styrker_bevisbilde",
    kildeRef: "doc_014",
    tvilspunkt: "Skyldkravet bør styrkes med flere uavhengige kilder.",
    evidence: ["doc_014"]
  },
  {
    id: "b3",
    tema: "Objektiv gjerningsbeskrivelse",
    vilkar: "Alternative hendelsesforløp",
    beskrivelse: "Teknisk rapport peker på en mulig alternativ forklaring.",
    styrke: "saar_tvil",
    kildeRef: "doc_022",
    tvilspunkt: "Kan så rimelig tvil om årsakssammenheng og identifikasjon.",
    evidence: ["doc_022"]
  }
];

const strengthLabels: Record<BevisKrav, string> = {
  utover_rimelig_tvil: "Utover rimelig tvil",
  styrker_bevisbilde: "Styrker bevisbildet",
  saar_tvil: "Sår tvil"
};

function strengthClass(strength: BevisKrav) {
  return `badge-${strength}`;
}

function promoteStrength(strength: BevisKrav): BevisKrav {
  return strength === "saar_tvil" ? "styrker_bevisbilde" : strength;
}

export function Bevismatrise() {
  const [bevisListe, setBevisListe] = useState<StraffeBevisElement[]>(initialEvidence);
  const sourceById = useMemo(
    () => new Map(evidenceSources.map((source) => [source.id, source])),
    []
  );
  const analyse = genererKonklusjon(bevisListe);

  function handleDragStart(event: DragEvent<HTMLElement>, sourceId: string) {
    event.dataTransfer.setData("text/plain", sourceId);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(event: DragEvent<HTMLTableCellElement>, bevisId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");

    if (!sourceById.has(sourceId)) {
      return;
    }

    setBevisListe((currentBevis) =>
      currentBevis.map((bevis) => {
        if (bevis.id !== bevisId || bevis.evidence.includes(sourceId)) {
          return bevis;
        }

        return {
          ...bevis,
          evidence: [...bevis.evidence, sourceId],
          kildeRef: bevis.kildeRef || sourceId,
          styrke: promoteStrength(bevis.styrke)
        };
      })
    );
  }

  function removeEvidence(bevisId: string, sourceId: string) {
    setBevisListe((currentBevis) =>
      currentBevis.map((bevis) =>
        bevis.id === bevisId
          ? { ...bevis, evidence: bevis.evidence.filter((id) => id !== sourceId) }
          : bevis
      )
    );
  }

  function jumpToSource(sourceId: string) {
    const source = sourceById.get(sourceId);
    if (!source) {
      return;
    }

    citationStore.jumpToSource({
      documentId: source.id,
      sourceUnitId: `${source.id}_p${source.page}`,
      page: source.page,
      paragraph: "criminal-evidence",
      rect: { top: 120, left: 48, width: 360, height: 42 }
    });
  }

  return (
    <section className="matrise-canvas criminal-evidence-matrix" aria-labelledby="bevismatrise-title">
      <aside className="source-dock" aria-label="Kildeklare dokumenter">
        <span className="section-kicker">Dokumentgrunnlag</span>
        <h2 className="section-title" id="bevismatrise-title">
          Strafferettslig bevismatrise
        </h2>
        <p>Politidokumenter og sakens dokumenter kobles mot gjerningsbeskrivelse, skyldkrav og tvil.</p>

        <div className="card-list">
          {evidenceSources.map((source) => (
            <motion.div
              className="evidence-card-motion"
              key={source.id}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <article
                className="evidence-card"
                draggable
                onClick={() => jumpToSource(source.id)}
                onDragStart={(event) => handleDragStart(event, source.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    jumpToSource(source.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div>
                  <strong>{source.filename}</strong>
                  <span>{source.pages}</span>
                </div>
                <p>{source.excerpt}</p>
                <small>{source.status}</small>
              </article>
            </motion.div>
          ))}
        </div>
      </aside>

      <main className="drop-zone-area" aria-label="Strafferettslige beviskrav">
        <header className="matrix-header">
          <span className="section-kicker">Court Engine</span>
          <h3>Gjerningsbeskrivelse, skyldkrav og tvil</h3>
        </header>

        <div className="matrise-table-wrap">
          <table className="matrise-table">
            <thead>
              <tr>
                <th>Tema</th>
                <th>Vilkår</th>
                <th>Beskrivelse</th>
                <th>Bevisstyrke</th>
                <th>Tvil</th>
                <th>Kilder</th>
              </tr>
            </thead>
            <tbody>
              {bevisListe.map((bevis) => (
                <tr key={bevis.id}>
                  <td>{bevis.tema}</td>
                  <td>{bevis.vilkar}</td>
                  <td>{bevis.beskrivelse}</td>
                  <td>
                    <span className={`strength-badge ${strengthClass(bevis.styrke)}`}>
                      {strengthLabels[bevis.styrke]}
                    </span>
                  </td>
                  <td>
                    <span className={bevis.styrke === "saar_tvil" ? "doubt-indicator active" : "doubt-indicator"}>
                      {bevis.tvilspunkt}
                    </span>
                  </td>
                  <td
                    className="evidence-drop-cell"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, bevis.id)}
                  >
                    {bevis.evidence.length > 0 ? (
                      <div className="source-pill-stack">
                        {bevis.evidence.map((sourceId) => {
                          const source = sourceById.get(sourceId);
                          if (!source) {
                            return null;
                          }

                          return (
                            <span className="source-pill" key={sourceId}>
                              <button type="button" onClick={() => jumpToSource(sourceId)}>
                                {source.filename}
                              </button>
                              <button
                                aria-label={`Fjern ${source.filename} fra beviskrav`}
                                className="source-pill-remove"
                                onClick={() => removeEvidence(bevis.id, sourceId)}
                                type="button"
                              >
                                x
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="drop-hint">Slipp bevis her</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`analyse-bunntekst ${analyse.status.toLowerCase()}`}>
          <strong>Status:</strong> {analyse.melding}
        </div>
      </main>
    </section>
  );
}
