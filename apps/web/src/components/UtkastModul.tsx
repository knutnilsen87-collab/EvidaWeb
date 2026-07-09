import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { useOptionalAuth } from "../context/AuthContext";
import { auditClientEvent } from "../lib/api";
import "./UtkastModul.css";

type DraftSection = {
  id: "kronologi" | "matrise" | "anfoersler";
  label: string;
  description: string;
};

const draftSections: DraftSection[] = [
  {
    id: "kronologi",
    label: "Inkluder Kronologi",
    description: "Setter inn kildebundet tidslinje i saksforholdet."
  },
  {
    id: "matrise",
    label: "Inkluder Bevismatrise",
    description: "Legger inn påstand-til-kilde-tabell som vedlegg."
  },
  {
    id: "anfoersler",
    label: "Inkluder Rettslige anførsler",
    description: "Bygger argumentdelen fra kildeklare anførsler."
  }
];

const qualityItems = [
  "Alle anførsler er knyttet til minst ett bevis.",
  "Usikre faktum er markert tydelig i dokumentet.",
  "Alle kilder i utkastet er verifisert som source-ready."
];

export function UtkastModul({ isPreliminary = false }: { isPreliminary?: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const auth = useOptionalAuth();
  const [includedSections, setIncludedSections] = useState<Record<DraftSection["id"], boolean>>({
    kronologi: true,
    matrise: true,
    anfoersler: true
  });
  const [qualityOpen, setQualityOpen] = useState(false);
  const [confirmedQuality, setConfirmedQuality] = useState<Record<string, boolean>>(
    Object.fromEntries(qualityItems.map((item) => [item, false]))
  );
  const [ackPreliminaryExport, setAckPreliminaryExport] = useState(false);
  const [generatedNotice, setGeneratedNotice] = useState("");

  const selectedCount = useMemo(
    () => Object.values(includedSections).filter(Boolean).length,
    [includedSections]
  );
  const qualityComplete = Object.values(confirmedQuality).every(Boolean);

  function toggleSection(sectionId: DraftSection["id"]) {
    setIncludedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId]
    }));
  }

  function toggleQuality(item: string) {
    setConfirmedQuality((current) => ({
      ...current,
      [item]: !current[item]
    }));
  }

  function openQualityCheck() {
    setQualityOpen(true);
    setGeneratedNotice("");
  }

  function generateDraft() {
    setQualityOpen(false);
    setGeneratedNotice("Utkastet er klargjort som DOCX med verifiserte kildehenvisninger.");
    if (auth?.user) {
      void auditClientEvent(auth.user.tenantId, {
        eventType: "EXPORT_CREATED",
        entityType: "DOCX_EXPORT",
        metadataJson: JSON.stringify({
          selectedSections: Object.entries(includedSections)
            .filter(([, included]) => included)
            .map(([section]) => section)
        })
      }).catch(() => undefined);
    }
  }

  return (
    <section className="utkast-canvas" aria-labelledby="utkast-title">
      <aside className="utkast-controls" aria-label="Dokumentbygger">
        <header className="utkast-header">
          <div>
            <span className="utkast-eyebrow">Dokument-finish</span>
            <h2 id="utkast-title">Utkast &amp; Eksport</h2>
            <p>Generer et etterprøvbart prosesskriv basert på verifiserte kilder.</p>
          </div>
          <span className="draft-readiness">{selectedCount} komponenter valgt</span>
        </header>

        <div className="toggle-group">
          {draftSections.map((section) => (
            <label className={`builder-toggle ${includedSections[section.id] ? "active" : ""}`} key={section.id}>
              <input
                checked={includedSections[section.id]}
                onChange={() => toggleSection(section.id)}
                type="checkbox"
              />
              <span>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
            </label>
          ))}
        </div>

        <button className="export-cta" onClick={openQualityCheck} type="button">
          Generer Sluttprodukt
        </button>
        {generatedNotice ? <p className="generation-notice">{generatedNotice}</p> : null}
      </aside>

      <main className="document-preview-container" aria-label="Live forhåndsvisning">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="paper-preview"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
            <header>
              <p>Prosesskriv</p>
              <h3>Foreløpig utkast</h3>
            </header>

            {isPreliminary && (
              <div
                className="preview-preliminary-warning"
                style={{
                  background: "rgba(217, 119, 6, 0.08)",
                  border: "1px solid rgba(217, 119, 6, 0.22)",
                  borderRadius: "var(--evida-radius-md)",
                  color: "var(--evida-status-warning)",
                  padding: "var(--evida-space-3)",
                  marginBottom: "var(--evida-space-3)",
                  fontSize: "0.85rem",
                  lineHeight: 1.4
                }}
              >
                Dette utkastet ble produsert med foreløpig kildegrunnlag. Ikke alle dokumenter/sider var verifisert på genereringstidspunktet.
              </div>
            )}

            <div className="preview-content">
              <p>
                <strong>I. Saksforhold</strong>
              </p>
              {includedSections.kronologi ? (
                <p>
                  Kontrakten ble inngått 12.01.2026.
                  <button className="citation-chip" type="button">
                    doc_001, s. 1
                  </button>
                </p>
              ) : null}
              {includedSections.anfoersler ? (
                <>
                  <p>
                    <strong>II. Rettslige anførsler</strong>
                  </p>
                  <p>
                    Misligholdet inntraff 15.02.2026 og er markert som foreløpig faktum.
                    <button className="citation-chip" type="button">
                      doc_014, s. 3
                    </button>
                  </p>
                </>
              ) : null}
              {includedSections.matrise ? (
                <>
                  <p>
                    <strong>III. Bevisoversikt</strong>
                  </p>
                  <p>
                    Påstanden om signering er vurdert som sterk, mens leveringsmisligholdet krever
                    ytterligere kildebekreftelse.
                    <button className="citation-chip" type="button">
                      matrise:c1-c2
                    </button>
                  </p>
                </>
              ) : null}
              <hr />
              <p className="paper-footer">
                Dokument generert av EVIDA. Alle kildehenvisninger skal kunne spores tilbake til
                verifiserte dokumenter.
              </p>
            </div>
        </motion.div>
      </main>

      {qualityOpen ? (
        <div className="quality-backdrop" role="presentation">
          <section
            aria-labelledby="quality-title"
            aria-modal="true"
            className="quality-modal liquid-glass-panel"
            role="dialog"
          >
            <header>
              <span className="utkast-eyebrow">Endelig modus</span>
              <h3 id="quality-title">Kvalitetssjekk før generering</h3>
              <p>Bekreft at utkastet kan genereres med sporbare kildehenvisninger.</p>
            </header>

            <div className="quality-list">
              {qualityItems.map((item) => (
                <label className="quality-check" key={item}>
                  <input
                    checked={confirmedQuality[item]}
                    onChange={() => toggleQuality(item)}
                    type="checkbox"
                  />
                  <span>{item}</span>
                </label>
              ))}

              {isPreliminary && (
                <label
                  className="quality-check preliminary-export-ack-check"
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingTop: "var(--evida-space-3)",
                    marginTop: "var(--evida-space-2)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--evida-space-2)"
                  }}
                >
                  <input
                    checked={ackPreliminaryExport}
                    onChange={(e) => setAckPreliminaryExport(e.target.checked)}
                    type="checkbox"
                  />
                  <span style={{ color: "var(--evida-status-warning)", fontWeight: "bold" }}>
                    Jeg forstår at eksporten bygger på foreløpig kildegrunnlag.
                  </span>
                </label>
              )}
            </div>

            <footer>
              <button className="evida-button" onClick={() => setQualityOpen(false)} type="button">
                Avbryt
              </button>
              <button
                className="export-cta"
                disabled={!qualityComplete || (isPreliminary && !ackPreliminaryExport)}
                onClick={generateDraft}
                type="button"
              >
                Generer DOCX
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
