import type { EvidaDocument, IngestionJobResponse } from "./api";
import type { QueueState } from "./uploadQueue";
import type { WorkspaceView } from "../navigation";

export type BestNextStepKind =
  | "create_case"
  | "action_submitting"
  | "focus_upload"
  | "wait_upload"
  | "start_processing"
  | "wait_processing"
  | "continue_partial"
  | "open_saksrom"
  | "inspect_error";

export interface SourceBasisStats {
  documentCount: number;
  readyPages: number;
  totalPages: number;
  failedPages: number;
  pendingDocuments: number;
  failedDocuments: number;
  unstartedDocuments: number;
  processingDocuments: number;
  sourceReadyDocuments: number;
}

export interface BestNextStep {
  kind: BestNextStepKind;
  title: string;
  body: string;
  label: string;
  disabled: boolean;
  targetView?: WorkspaceView;
}

const READY_STATUSES = new Set(["verified", "source_ready", "partial_source_ready"]);
const UNSTARTED_STATUSES = new Set(["quarantine", "approved_for_ingestion"]);
const PROCESSING_STATUSES = new Set(["ingesting", "processing"]);
const FAILED_STATUSES = new Set(["ingestion_failed", "rejected"]);

function pageCount(document: EvidaDocument, job?: IngestionJobResponse): number {
  return Math.max(job?.pagesTotal ?? 0, document.pages ?? 0, job?.pagesProcessed ?? 0);
}

function parseReadyPagesFromWarning(warning: string | null | undefined): { readyPages: number; totalPages: number } | null {
  const match = warning?.match(/parsed_pages=(\d+)\/(\d+)/);
  if (!match) {
    return null;
  }
  return {
    readyPages: Number.parseInt(match[1], 10),
    totalPages: Number.parseInt(match[2], 10)
  };
}

export function getSourceBasisStats(
  documents: EvidaDocument[],
  jobs: Record<string, IngestionJobResponse> = {}
): SourceBasisStats {
  return documents.reduce<SourceBasisStats>(
    (stats, document) => {
      const job = jobs[document.id];
      const total = pageCount(document, job);
      const fallbackTotal = total || 1;
      const activeJob = job?.status === "PENDING" || job?.status === "RUNNING";
      const failedJob = job?.status === "FAILED";
      const warningJob = job?.status === "COMPLETED_WITH_WARNINGS";

      stats.documentCount += 1;

      if (document.status === "source_ready" || document.status === "verified") {
        stats.totalPages += fallbackTotal;
        stats.readyPages += fallbackTotal;
        stats.sourceReadyDocuments += 1;
      } else if (document.status === "partial_source_ready" || warningJob) {
        const parsedCoverage = parseReadyPagesFromWarning(document.ingestionError);
        const ready = Math.max(
          0,
          job?.pagesProcessed ?? parsedCoverage?.readyPages ?? (document.pages > 0 ? document.pages - 1 : 0)
        );
        const partialTotal = Math.max(job?.pagesTotal ?? 0, parsedCoverage?.totalPages ?? 0, fallbackTotal, ready);
        stats.totalPages += partialTotal;
        stats.readyPages += ready;
        stats.failedPages += Math.max(0, partialTotal - ready);
        stats.sourceReadyDocuments += 1;
      } else if (FAILED_STATUSES.has(document.status) || failedJob) {
        stats.totalPages += fallbackTotal;
        stats.failedDocuments += 1;
        stats.failedPages += fallbackTotal;
      } else if (UNSTARTED_STATUSES.has(document.status)) {
        stats.totalPages += total;
        stats.unstartedDocuments += 1;
        stats.pendingDocuments += 1;
      } else if (PROCESSING_STATUSES.has(document.status) || activeJob) {
        stats.totalPages += total;
        stats.processingDocuments += 1;
        stats.pendingDocuments += 1;
      } else if (READY_STATUSES.has(document.status)) {
        stats.totalPages += fallbackTotal;
        stats.readyPages += fallbackTotal;
        stats.sourceReadyDocuments += 1;
      }

      return stats;
    },
    {
      documentCount: 0,
      readyPages: 0,
      totalPages: 0,
      failedPages: 0,
      pendingDocuments: 0,
      failedDocuments: 0,
      unstartedDocuments: 0,
      processingDocuments: 0,
      sourceReadyDocuments: 0
    }
  );
}

export function sourceCoveragePercent(readyPages: number, totalPages: number): number {
  if (totalPages <= 0) {
    return 0;
  }
  if (readyPages >= totalPages) {
    return 100;
  }
  return Math.min(99.9, Math.round((Math.max(0, readyPages) / totalPages) * 1000) / 10);
}

export function describePartialPages(readyPages: number, totalPages: number): string {
  const missingPages = Math.max(0, totalPages - readyPages);
  const sideWord = missingPages === 1 ? "side" : "sider";
  return `${readyPages} av ${totalPages} sider kan brukes. ${missingPages} ${sideWord} krever kontroll.`;
}

export function getBestNextStep({
  activeCaseName,
  documents,
  jobs = {},
  queueState,
  activeView,
  actionSubmitting = false
}: {
  activeCaseName: string | null;
  documents: EvidaDocument[];
  jobs?: Record<string, IngestionJobResponse>;
  queueState?: Pick<QueueState, "isBusy" | "total" | "failed">;
  activeView?: WorkspaceView;
  actionSubmitting?: boolean;
}): BestNextStep {
  if (!activeCaseName) {
    return {
      kind: "create_case",
      title: "Opprett eller åpne sak",
      body: "Velg en påbegynt sak, eller opprett en ny sak for å laste opp dokumenter.",
      label: "Opprett ny sak",
      disabled: false,
      targetView: "dashboard"
    };
  }

  if (actionSubmitting) {
    return {
      kind: "action_submitting",
      title: "Registrerer handling",
      body: "Registrerer handling ...",
      label: "Registrerer handling ...",
      disabled: true
    };
  }

  if (queueState?.isBusy) {
    return {
      kind: "wait_upload",
      title: "Opplasting pågår",
      body: "Laster opp dokumentet ...",
      label: "Venter på opplasting ...",
      disabled: true
    };
  }

  const stats = getSourceBasisStats(documents, jobs);

  if (stats.readyPages > 0 && stats.totalPages > stats.readyPages) {
    return {
      kind: "continue_partial",
      title: "Foreløpig kildegrunnlag klart",
      body: describePartialPages(stats.readyPages, stats.totalPages),
      label: "Fortsett til Saksrom med foreløpig kildegrunnlag",
      disabled: false,
      targetView: "saksrom"
    };
  }

  if (stats.processingDocuments > 0) {
    return {
      kind: "wait_processing",
      title: "Dokumentet kontrolleres",
      body: "Kontrollerer dokumentet for lesbarhet og kildegrunnlag ...",
      label: "Behandler dokumentet ...",
      disabled: true
    };
  }

  if (stats.readyPages > 0 && stats.totalPages > 0 && stats.readyPages >= stats.totalPages) {
    return {
      kind: "open_saksrom",
      title: "Kildegrunnlaget er klart",
      body: "Alle tilgjengelige sider er klare som kildegrunnlag.",
      label: "Åpne Saksrom",
      disabled: false,
      targetView: "saksrom"
    };
  }

  if (stats.failedDocuments > 0 && stats.readyPages === 0) {
    return {
      kind: "inspect_error",
      title: "Dokumentet kunne ikke klargjøres",
      body: "Dokumentet kunne ikke klargjøres. Se detaljer eller prøv igjen.",
      label: "Kontroller feilen",
      disabled: false
    };
  }

  if (stats.unstartedDocuments > 0) {
    return {
      kind: "start_processing",
      title: "Dokumentet er mottatt",
      body: "Dokumentet er mottatt og kontrolleres.",
      label: "Kontroller dokumentet",
      disabled: false
    };
  }

  return {
    kind: "focus_upload",
    title: activeView === "import" ? "Last opp dokumenter" : "Bygg kildegrunnlag",
    body: "Last opp kilder for å åpne Saksrommet.",
    label: "Last opp dokumenter",
    disabled: false,
    targetView: "import"
  };
}
