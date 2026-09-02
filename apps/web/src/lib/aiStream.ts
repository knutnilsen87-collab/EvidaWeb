import { getHeaders, toUuid } from "./api";
import type { SaksromSummaryStreamEvent } from "./api";
import type { SaksromStreamRequest } from "./streaming/types";

function apiBaseUrl() {
  return import.meta.env.VITE_EVIDA_API_BASE_URL ?? "";
}

/** Thrown when the SSE endpoint isn't reachable/available so callers can fall back to a non-stream path. */
export class AiStreamUnavailableError extends Error {
  constructor(message = "AI-stream (SSE) er ikke tilgjengelig.") {
    super(message);
    this.name = "AiStreamUnavailableError";
  }
}

/** Thrown when the server sends an explicit `event: error` mid-stream. Carries how far we got. */
export class AiStreamServerError extends Error {
  readonly receivedContent: boolean;
  constructor(message: string, receivedContent: boolean) {
    super(message);
    this.name = "AiStreamServerError";
    this.receivedContent = receivedContent;
  }
}

export interface SseFrame {
  event: string;
  data: Record<string, unknown>;
  id?: string;
  seq?: number;
}

export interface StreamAiResult {
  /** Highest sequence id seen — lets a caller reconnect and detect where it left off. */
  lastSeq: number;
  /** Highest content-token index rendered — pass back as `fromToken` to resume without duplication. */
  lastTokenIndex: number;
}

export interface StreamAiOptions {
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal;
  /** Called for a detected sequence gap (missed event), so the UI can decide whether to reconnect. */
  onGap?: (info: { expected: number; received: number }) => void;
}

/**
 * Parse a `text/event-stream` POST response frame-by-frame and dispatch each frame to `onFrame`.
 *
 * Contract mirrors {@link SseAiStreamer} on the backend: every frame carries a monotonic `seq`; the
 * stream ends with `event: done` (resolve) or `event: error` (reject with {@link AiStreamServerError}).
 * Comment lines (`:` heartbeats) are ignored.
 */
export async function streamAiSse(
  url: string,
  options: StreamAiOptions,
  onFrame: (frame: SseFrame) => void
): Promise<StreamAiResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "text/event-stream", ...(options.headers ?? {}) },
      body: options.body,
      signal: options.signal
    });
  } catch (networkError) {
    // Could not even connect (offline / no server): treat as unavailable so caller can fall back.
    throw new AiStreamUnavailableError(
      networkError instanceof Error ? networkError.message : "Nettverksfeil ved oppkobling til AI-stream."
    );
  }

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new AiStreamUnavailableError();
  }
  if (!response.ok) {
    throw new AiStreamUnavailableError(`AI-stream svarte ${response.status}.`);
  }
  if (!response.body) {
    throw new AiStreamUnavailableError("AI-stream returnerte ingen body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastSeq = -1;
  let lastTokenIndex = -1;
  let receivedContent = false;

  const handleFrame = (frame: SseFrame) => {
    if (typeof frame.seq === "number") {
      if (lastSeq >= 0 && frame.seq !== lastSeq + 1) {
        options.onGap?.({ expected: lastSeq + 1, received: frame.seq });
      }
      lastSeq = Math.max(lastSeq, frame.seq);
    }
    if (frame.event === "token") {
      receivedContent = true;
      const index = frame.data.index;
      if (typeof index === "number") {
        lastTokenIndex = Math.max(lastTokenIndex, index);
      }
    }
    if (frame.event === "error") {
      const message = typeof frame.data.message === "string" ? frame.data.message : "Ukjent feil under strømming.";
      throw new AiStreamServerError(message, receivedContent);
    }
    onFrame(frame);
  };

  const parseBlock = (block: string): SseFrame | null => {
    let event = "message";
    let id: string | undefined;
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) {
        continue; // blank or comment/heartbeat line
      }
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
      else if (field === "id") id = value;
    }
    if (!dataLines.length) {
      return null;
    }
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    } catch {
      data = {};
    }
    const seq = typeof data.seq === "number" ? (data.seq as number) : undefined;
    return { event, data, id, seq };
  };

  const flushBlocks = () => {
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseBlock(block);
      if (frame && frame.event !== "done") {
        handleFrame(frame);
      }
      boundary = buffer.indexOf("\n\n");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (options.signal?.aborted) {
      return { lastSeq, lastTokenIndex };
    }
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    flushBlocks();
  }

  buffer += decoder.decode();
  // Some servers omit the trailing blank line on the final frame; parse any remainder.
  if (buffer.trim().length) {
    const frame = parseBlock(buffer);
    if (frame && frame.event !== "done") {
      handleFrame(frame);
    }
  }

  return { lastSeq, lastTokenIndex };
}

/**
 * Stream the source-bound summary over SSE, translating server frames into the existing
 * {@link SaksromSummaryStreamEvent} union so it is a drop-in for the summary UI.
 */
export async function streamSaksromSummarySse(
  tenantId: string,
  payload: { caseId: string; includePartial: boolean; sourceBasis: "READY_PAGE_UNITS_ONLY" },
  onEvent: (event: SaksromSummaryStreamEvent) => void,
  signal?: AbortSignal,
  fromToken = 0
): Promise<StreamAiResult> {
  const mappedPayload = { ...payload, caseId: toUuid(payload.caseId) || payload.caseId };
  const url = `${apiBaseUrl()}/api/saksrom/summary/sse?fromToken=${encodeURIComponent(fromToken)}`;
  return streamAiSse(
    url,
    { headers: getHeaders(tenantId), body: JSON.stringify(mappedPayload), signal },
    (frame) => translateSummaryFrame(frame, onEvent)
  );
}

export async function streamSaksromQuestionSse(
  request: SaksromStreamRequest,
  onEvent: (event: unknown) => void,
  signal?: AbortSignal
): Promise<StreamAiResult> {
  const payload = {
    caseId: toUuid(request.caseId) || request.caseId,
    question: request.query,
    selectedSourceUnitIds: request.selectedSourceUnitIds ?? [],
    mode: request.mode === "ARGUMENTERE" ? "argumentere" : request.mode === "SIMULERE" ? "simulere" : "sporre",
    includePartial: request.includePartial,
    sourceBasis: request.sourceBasis
  };
  return streamAiSse(
    `${apiBaseUrl()}/api/saksrom/ask/sse`,
    { headers: getHeaders(request.tenantId), body: JSON.stringify(payload), signal },
    (frame) => {
      const data = frame.data;
      if (frame.event === "stage") onEvent({ type: "stage", stage: data.stage, label: data.label });
      else if (frame.event === "token") onEvent({ type: "text_delta", content: data.text });
      else if (frame.event === "citation") onEvent({ type: "citation", citation: data.citation });
      else if (frame.event === "warning") onEvent({ type: "warning", code: data.code });
      else if (frame.event === "complete") onEvent({ type: "completed", answer: data.answer });
    }
  );
}

function translateSummaryFrame(
  frame: SseFrame,
  onEvent: (event: SaksromSummaryStreamEvent) => void
): void {
  const data = frame.data;
  switch (frame.event) {
    case "meta":
      return; // transport marker only
    case "stage":
      onEvent({ type: "stage", stage: data.stage as never, label: (data.label as string) ?? "" });
      return;
    case "section_start":
      onEvent({ type: "section_start", sectionId: data.sectionId as string, title: (data.title as string) ?? "" });
      return;
    case "token":
      onEvent({ type: "text_delta", sectionId: (data.sectionId as string) ?? "overview", text: (data.text as string) ?? "" });
      return;
    case "citation":
      onEvent({ type: "citation", sectionId: (data.sectionId as string) ?? "overview", citation: data.citation as never });
      return;
    case "finding":
      onEvent({
        type: "finding",
        theme: (data.theme as string) ?? "",
        heading: data.heading as string | undefined,
        text: (data.text as string) ?? "",
        citations: (data.citations as never) ?? []
      });
      return;
    case "warning":
      onEvent({ type: "warning", code: (data.code as string) ?? "", text: (data.text as string) ?? "" });
      return;
    case "complete":
      onEvent({ type: "complete", summary: data.summary as never });
      return;
    default:
      return;
  }
}
