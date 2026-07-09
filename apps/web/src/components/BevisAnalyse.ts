import type { BevisElement } from "../lib/CitationManager";

export interface BevisAnalyseResult {
  status: "Advarsel" | "OK";
  melding: string;
}

export function genererKonklusjon(bevisListe: BevisElement[]): BevisAnalyseResult {
  const tvil = bevisListe.filter((bevis) => bevis.styrke === "saar_tvil");

  if (tvil.length > 0) {
    return {
      status: "Advarsel",
      melding: `Saken har ${tvil.length} punkt(er) med sår tvil. Disse må adresseres før prosedyre.`
    };
  }

  return { status: "OK", melding: "Bevisbildet fremstår som sammenhengende." };
}
