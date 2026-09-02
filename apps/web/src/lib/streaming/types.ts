import type { SourceUnitRef } from "../../domain/sourceUnitRef";
import type { SaksromAnswer } from "../api";

export type SharedFocusAction = "READING" | "COMPARING" | "VERIFYING" | "WRITING";
export type SaksromMode = "SPOERRE" | "ARGUMENTERE" | "SIMULERE";
export type StreamStatus = "idle" | "connecting" | "working" | "streaming" | "completed" | "cancelled" | "error";

export interface SharedFocus {
  action: SharedFocusAction;
  label: string;
  documentId?: string;
  sourceUnitId?: string;
  pageNumber?: number;
}

export type SaksromStreamEvent =
  | { type: "started"; requestId: string }
  | ({ type: "focus" } & SharedFocus)
  | { type: "text_delta"; content: string }
  | { type: "citation"; citation: SourceUnitRef; claimId?: string }
  | { type: "warning"; code: string }
  | { type: "completed"; answer?: SaksromAnswer; sourceBound?: boolean }
  | { type: "error"; message: string; recoverable: boolean };

export interface SaksromStreamState {
  status: StreamStatus;
  requestId: string | null;
  text: string;
  focus: SharedFocus | null;
  citations: SourceUnitRef[];
  warnings: string[];
  sourceBound: boolean;
  answer: SaksromAnswer | null;
  error: string | null;
}

export interface SaksromStreamRequest {
  query: string;
  caseId: string;
  tenantId: string;
  mode: SaksromMode;
  includePartial: boolean;
  sourceBasis: "READY_PAGE_UNITS_ONLY";
  selectedSourceUnitIds?: string[];
}

export interface SaksromStreamOptions {
  signal: AbortSignal;
  onEvent: (event: unknown) => void;
}

export interface SaksromStreamTransport {
  stream(request: SaksromStreamRequest, options: SaksromStreamOptions): Promise<void>;
}
