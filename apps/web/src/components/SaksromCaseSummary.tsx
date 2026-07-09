import { useMemo, useState } from "react";
import type { EvidaDocument } from "../lib/api";
import "./SaksromCaseSummary.css";

interface SaksromCaseSummaryProps {
  documents: EvidaDocument[];
  coverage: number;
  pendingCount: number;
  failedCount: number;
}

type SummarySnapshot = {
  createdAt: string;
  coverage: number;
  readyDocuments: EvidaDocument[];
  pendingCount: number;
  failedCount: number;
  fingerprint: string;
};

const notDocumented = "Ikke dokumentert i tilgjengelig kildegrunnlag.";

function isSourceReady(document: EvidaDocument) {
  return document.status === "source_ready" || document.status === "verified";
}

function sourceReference(document: EvidaDocument) {
  return `[${document.filename}]`;
}

function fingerprintFor(documents: EvidaDocument[]) {
  return documents
    .filter(isSourceReady)
    .map((document) => `${document.id}:${document.status}:${document.pages}`)
    .sort()
    .join("|");
}

function createSnapshot(
  documents: EvidaDocument[],
  coverage: number,
  pendingCount: number,
  failedCount: number
): SummarySnapshot {
  return {
    createdAt: new Date().toISOString(),
    coverage,
    readyDocuments: documents.filter(isSourceReady),
    pendingCount,
    failedCount,
    fingerprint: fingerprintFor(documents)
  };
}

function documentOverview(documents: EvidaDocument[]) {
  if (!documents.length) {
    return notDocumented;
  }

  return documents.map((document) => `${document.filename} ${sourceReference(document)}`).join("; ");
}

export interface CompactedInfo {
  total: number;
  typeText: string;
  dateText: string;
  idText: string;
  subsetText: string;
}

export function getCompactedInfo(documents: EvidaDocument[]): CompactedInfo {
  const total = documents.length;
  if (total === 0) {
    return {
      total: 0,
      typeText: notDocumented,
      dateText: notDocumented,
      idText: notDocumented,
      subsetText: notDocumented
    };
  }

  let reports = 0;
  let contracts = 0;
  let emails = 0;
  let economy = 0;
  let others = 0;

  documents.forEach((doc) => {
    const fn = doc.filename.toLowerCase();
    if (fn.includes("rapport") || fn.includes("report")) {
      reports++;
    } else if (fn.includes("kontrakt") || fn.includes("avtale") || fn.includes("contract") || fn.includes("agreement")) {
      contracts++;
    } else if (fn.includes("epost") || fn.includes("e-post") || fn.includes("mail") || fn.includes("korrespondanse")) {
      emails++;
    } else if (fn.includes("faktura") || fn.includes("regnskap") || fn.includes("økonomi") || fn.includes("invoice")) {
      economy++;
    } else {
      others++;
    }
  });

  const typesList: string[] = [];
  if (reports > 0) typesList.push(`${reports} rapport${reports > 1 ? "er" : ""}`);
  if (contracts > 0) typesList.push(`${contracts} kontrakt${contracts > 1 ? "er" : "/klientavtaler"}`);
  if (economy > 0) typesList.push(`${economy} økonomidokument${economy > 1 ? "er" : ""}`);
  if (emails > 0) typesList.push(`${emails} e-post${emails > 1 ? "er" : ""}`);
  if (others > 0) typesList.push(`${others} andre/ukjente`);

  const typeText = typesList.length > 0 ? typesList.join(", ") : "Ikke sikkert klassifisert i tilgjengelig kildegrunnlag.";
  const dateText = "Ikke dokumentert i tilgjengelig kildegrunnlag.";
  const idText = `Dokument-ID-er finnes for ${total} dokumenter, men er skjult fra hovedoppsummeringen. Ingen eksterne Bates- eller Exhibit-identifikatorer funnet.`;

  const maxExamples = 5;
  const subset = documents.slice(0, maxExamples).map(d => d.filename);
  let subsetText = subset.join("; ");
  if (total > maxExamples) {
    subsetText += ` (og ${total - maxExamples} andre)`;
  }

  return {
    total,
    typeText,
    dateText,
    idText,
    subsetText
  };
}

export function SaksromCaseSummary({
  documents,
  coverage,
  pendingCount,
  failedCount
}: SaksromCaseSummaryProps) {
  const [snapshot, setSnapshot] = useState(() => createSnapshot(documents, coverage, pendingCount, failedCount));
  const currentFingerprint = useMemo(() => fingerprintFor(documents), [documents]);
  const isStale = snapshot.fingerprint !== currentFingerprint;
  const isPreliminary = snapshot.coverage < 100 || snapshot.pendingCount > 0 || snapshot.failedCount > 0;
  const missingCount = Math.max(0, documents.length - snapshot.readyDocuments.length);
  const title = isPreliminary ? "Foreløpig saksoppsummering" : "Saksoppsummering";
  const compactedInfo = getCompactedInfo(snapshot.readyDocuments);

  function regenerateSummary() {
    setSnapshot(createSnapshot(documents, coverage, pendingCount, failedCount));
  }

  function copySummary() {
    const text = [
      title,
      `Analysert nå: ${snapshot.readyDocuments.length} dokumenter`,
      `Mangler fortsatt: ${missingCount} dokumenter`,
      `Feilet / krever kontroll: ${snapshot.failedCount} dokumenter`,
      `Dokumenter analysert: ${compactedInfo.subsetText}`
    ].join("\n");
    void navigator.clipboard?.writeText(text);
  }

  return (
    <section className="saksrom-case-summary" aria-labelledby="case-summary-title">
      <header className="case-summary-header">
        <div>
          <span className="pane-kicker">Kildebundet oppstart</span>
          <h3 id="case-summary-title">{title}</h3>
          <p>Oppsummeringen er bundet til kildegrunnlaget som var klart da panelet ble laget.</p>
        </div>
        <div className="case-summary-actions" aria-label="Oppsummeringshandlinger">
          <button onClick={regenerateSummary} type="button">Oppsummer saken på nytt</button>
          <button type="button">Vis kildegrunnlag</button>
          <button type="button">Gå til manglende dokumenter</button>
          <button onClick={copySummary} type="button">Kopier oppsummering</button>
        </div>
      </header>

      {isPreliminary ? (
        <div className="summary-preliminary-marker" role="status">
          <strong>Produsert med foreløpig kildegrunnlag.</strong>
          <span>Ikke alle dokumenter eller sider var ferdig behandlet på genereringstidspunktet.</span>
          <dl>
            <div>
              <dt>Analysert nå</dt>
              <dd>{snapshot.readyDocuments.length} dokumenter</dd>
            </div>
            <div>
              <dt>Mangler fortsatt</dt>
              <dd>{missingCount} dokumenter</dd>
            </div>
            <div>
              <dt>Feilet / krever kontroll</dt>
              <dd>{snapshot.failedCount} dokumenter</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {snapshot.readyDocuments.length === 0 ? (
        <p className="summary-empty-state">
          Saksrommet er åpnet, men det finnes ennå ikke ferdig behandlet kildegrunnlag å oppsummere.
        </p>
      ) : null}

      {isStale ? (
        <div className="summary-stale-warning" role="status">
          <span>Kildegrunnlaget er oppdatert siden denne oppsummeringen ble laget.</span>
          <button onClick={regenerateSummary} type="button">Oppsummer saken på nytt</button>
        </div>
      ) : null}

      <div className="summary-sections">
        <section>
          <h4>Kort sammendrag</h4>
          <ul>
            <li><strong>Sakstype:</strong> {notDocumented}</li>
            <li><strong>Hovedtema:</strong> {notDocumented}</li>
            <li><strong>De viktigste spørsmålene dokumentene omhandler:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Dokumentoversikt</h4>
          <ul>
            <li><strong>Hvilke dokumenter som er analysert:</strong> {compactedInfo.subsetText}</li>
            <li><strong>Dokumenttype:</strong> {compactedInfo.typeText}</li>
            <li><strong>Dato:</strong> {compactedInfo.dateText}</li>
            <li><strong>Dokument-ID / Bates / Exhibit:</strong> {compactedInfo.idText}</li>
          </ul>
          {snapshot.readyDocuments.length > 0 && (
            <div className="summary-list-disclosure" style={{ marginTop: '0.75rem' }}>
              <details className="summary-full-list-details">
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--primary)' }}>
                  Vis full dokumentliste ({snapshot.readyDocuments.length})
                </summary>
                <ul style={{ marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingLeft: '1.25rem', color: 'var(--evida-text-secondary)' }}>
                  {snapshot.readyDocuments.map((doc) => {
                    const type = doc.filename.toLowerCase().includes("rapport") || doc.filename.toLowerCase().includes("report")
                      ? "Rapport"
                      : doc.filename.toLowerCase().includes("kontrakt") || doc.filename.toLowerCase().includes("avtale") || doc.filename.toLowerCase().includes("contract") || doc.filename.toLowerCase().includes("agreement")
                      ? "Kontrakt"
                      : doc.filename.toLowerCase().includes("epost") || doc.filename.toLowerCase().includes("e-post") || doc.filename.toLowerCase().includes("mail") || doc.filename.toLowerCase().includes("korrespondanse")
                      ? "E-post"
                      : doc.filename.toLowerCase().includes("faktura") || doc.filename.toLowerCase().includes("regnskap") || doc.filename.toLowerCase().includes("økonomi") || doc.filename.toLowerCase().includes("invoice")
                      ? "Økonomidokument"
                      : "Ukjent type";
                    const pages = doc.pages ? `${doc.pages} sider` : "Ukjent sidetall";
                    return (
                      <li key={doc.id} style={{ marginBottom: "0.25rem" }}>
                        <strong>{doc.filename}</strong> — {type} · {pages}
                      </li>
                    );
                  })}
                </ul>
              </details>
              <details className="summary-tech-details" style={{ marginTop: '0.5rem', opacity: 0.8 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--evida-text-secondary)' }}>
                  Tekniske detaljer
                </summary>
                <ul style={{ marginTop: '0.25rem', fontSize: '0.8rem', paddingLeft: '1.25rem', color: 'var(--evida-text-muted)' }}>
                  {snapshot.readyDocuments.map((doc) => (
                    <li key={doc.id}>
                      {doc.filename}: ID={doc.id} {doc.sha256 ? `· Hash=${doc.sha256}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </section>

        <section>
          <h4>Faktiske funn</h4>
          <ul>
            <li><strong>Vesentlige fakta dokumentene underbygger:</strong> {notDocumented}</li>
            <li><strong>Hvem som har skrevet eller signert dokumentene:</strong> {notDocumented}</li>
            <li><strong>Viktige datoer og hendelser:</strong> {notDocumented}</li>
            <li><strong>Direkte dokumenthenvisninger:</strong> Henvisninger vises som kildepiller under relevante funn.</li>
          </ul>
        </section>

        <section>
          <h4>Kronologi</h4>
          <ul>
            <li><strong>Tidslinje over hendelser:</strong> {notDocumented}</li>
            <li><strong>Sammenheng mellom dokumentene:</strong> {notDocumented}</li>
            <li><strong>Perioder hvor dokumentasjon mangler:</strong> {missingCount > 0 ? `${missingCount} dokumenter er ikke med i denne oppsummeringen.` : notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Sentrale bevis</h4>
          <ul>
            <li><strong>Hvilke dokumenter som støtter hvilke påstander:</strong> {notDocumented}</li>
            <li><strong>Bevisstyrke: sterk / moderat / svak</strong> {notDocumented}</li>
            <li><strong>Kryssreferanser mellom dokumenter:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Motstridende opplysninger</h4>
          <ul>
            <li><strong>Uoverensstemmelser mellom dokumenter:</strong> {notDocumented}</li>
            <li><strong>Endringer i forklaringer:</strong> {notDocumented}</li>
            <li><strong>Manglende samsvar mellom datoer eller innhold:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Juridisk relevante forhold</h4>
          <ul>
            <li><strong>Rettslige problemstillinger dokumentene ser ut til å berøre:</strong> {notDocumented}</li>
            <li><strong>Fakta som kan være sentrale for disse spørsmålene:</strong> {notDocumented}</li>
            <li><strong>Skille mellom dokumenterte fakta og juridiske vurderinger:</strong> Juridiske vurderinger er ikke etablert uten kildehenvisning.</li>
          </ul>
        </section>

        <section>
          <h4>Mangler og usikkerhet</h4>
          <ul>
            <li><strong>Forhold som ikke kan dokumenteres ut fra materialet:</strong> {notDocumented}</li>
            <li><strong>Dokumenter som ser ut til å mangle:</strong> {missingCount > 0 ? `${missingCount} dokumenter mangler fortsatt i kildegrunnlaget.` : notDocumented}</li>
            <li><strong>Punkter hvor ytterligere bevis kan være nødvendig:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Risikovurdering</h4>
          <ul>
            <li><strong>Svake punkter i dokumentasjonen:</strong> {isPreliminary ? "Kildegrunnlaget er ufullstendig." : notDocumented}</li>
            <li><strong>Potensielle utfordringer ved forhandling eller rettssak:</strong> {notDocumented}</li>
            <li><strong>Mulige motargumenter basert på foreliggende materiale:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Konklusjon</h4>
          <ul>
            <li><strong>Hva dokumentene samlet sett støtter:</strong> {notDocumented}</li>
            <li><strong>Hva dokumentene ikke støtter:</strong> {notDocumented}</li>
            <li><strong>Spørsmål som fortsatt står åpne:</strong> {notDocumented}</li>
          </ul>
        </section>

        <section>
          <h4>Kontrollstatus</h4>
          <ul>
            <li><strong>Hvilke dokumenter som er analysert:</strong> {compactedInfo.subsetText}</li>
            <li><strong>Om analysen omfatter hele dokumentgrunnlaget eller bare deler:</strong> {isPreliminary ? "Analysen omfatter bare ferdig behandlet kildegrunnlag." : "Analysen omfatter gjeldende kildegrunnlag."}</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
