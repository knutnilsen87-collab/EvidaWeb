import type { OperativeSummaryResponse, SourceRef } from "../engine/types";

function formatSources(sources: SourceRef[]) {
  if (!sources.length) {
    return "Ingen kilde";
  }

  return sources
    .map((source) => {
      const bates = source.bates ? `, ${source.bates}` : "";
      const exhibit = source.exhibitId ? `, ${source.exhibitId}` : "";
      return `${source.documentId} s. ${source.page}${bates}${exhibit}`;
    })
    .join("; ");
}

export function formatOperativeSummary(data: OperativeSummaryResponse): string {
  const actors = data.actorMatrix
    .map((actor) => {
      const roles = actor.roles
        .map((role) => `${role.role} (${role.status}) [${formatSources(role.sources)}]`)
        .join(", ");

      return `- ${actor.name}: ${roles}`;
    })
    .join("\n");

  const findings = data.operativeSummary.keyFindings
    .map((finding) => `- ${finding.finding} (${finding.status}) [${formatSources(finding.sources)}]`)
    .join("\n");

  const risks = data.operativeSummary.risks
    .map(
      (risk) =>
        `- ${risk.description} | Alvorlighetsgrad: ${risk.severity} | Status: ${risk.status} [${formatSources(
          risk.sources
        )}]`
    )
    .join("\n");

  return `
# Operativ lederoppsummering

## Saksidentitet
Sak: ${data.caseMetadata.title}
Saks-ID: ${data.caseMetadata.caseId}
Sakstype: ${data.caseMetadata.type}
Status: ${data.caseMetadata.status}
Analysert: ${data.caseMetadata.analysisDate}

## Dekning og integritet
Dekning: ${data.coverage.coveragePercent}%
Sider: ${data.coverage.processedPages} av ${data.coverage.totalPages}
Integritet: ${data.coverage.integrityStatus}
Manglende intervaller: ${
    data.coverage.missingIntervals.length ? data.coverage.missingIntervals.join(", ") : "Ingen"
  }
Overlapp: ${data.coverage.overlaps.length ? data.coverage.overlaps.join(", ") : "Ingen"}

## Aktormatrise
${actors || "Ingen aktorer dokumentert."}

## Kritiske funn
${findings || "Ingen kritiske funn dokumentert."}

## Risiko
${risks || "Ingen risikopunkter dokumentert."}

Trust-status: Ingen funn eller roller vises som dokumenterte uten kildehenvisning.
`.trim();
}
