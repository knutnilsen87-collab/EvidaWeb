import { sourceReferenceToRef } from "../../domain/sourceUnitRef";
import { streamSaksromQuestionSse, AiStreamUnavailableError } from "../aiStream";
import { askSaksromQuestion } from "../api";
import { EVIDA_STREAM_MODE } from "../features";
import type { SaksromStreamRequest, SaksromStreamTransport } from "./types";

function requestId(prefix: string) {
  return typeof crypto.randomUUID === "function" ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}`;
}

async function emitRestAnswer(
  request: SaksromStreamRequest,
  options: Parameters<SaksromStreamTransport["stream"]>[1]
) {
  options.onEvent({ type: "stage", stage: "reading_sources", label: "Leser kildegrunnlaget" });
  const answer = await askSaksromQuestion(request.tenantId, {
    caseId: request.caseId,
    question: request.query,
    selectedSourceUnitIds: request.selectedSourceUnitIds,
    mode: request.mode === "ARGUMENTERE" ? "argumentere" : request.mode === "SIMULERE" ? "simulere" : "sporre",
    includePartial: request.includePartial,
    sourceBasis: request.sourceBasis
  });
  if (answer.answer) options.onEvent({ type: "text_delta", content: answer.answer });
  answer.sources.forEach((source) => options.onEvent({ type: "citation", citation: sourceReferenceToRef(source) }));
  answer.warnings.forEach((code) => options.onEvent({ type: "warning", code }));
  options.onEvent({ type: "completed", answer });
}

export class RestSaksromStreamTransport implements SaksromStreamTransport {
  async stream(request: SaksromStreamRequest, options: Parameters<SaksromStreamTransport["stream"]>[1]): Promise<void> {
    options.onEvent({ type: "started", requestId: requestId("rest-request") });
    await emitRestAnswer(request, options);
  }
}

export class SpringSaksromStreamTransport implements SaksromStreamTransport {
  async stream(request: SaksromStreamRequest, options: Parameters<SaksromStreamTransport["stream"]>[1]): Promise<void> {
    options.onEvent({ type: "started", requestId: requestId("request") });
    try {
      await streamSaksromQuestionSse(request, options.onEvent, options.signal);
      return;
    } catch (error) {
      if (!(error instanceof AiStreamUnavailableError) || options.signal.aborted) throw error;
    }
    await emitRestAnswer(request, options);
  }
}

const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(new DOMException("Operasjonen ble avbrutt.", "AbortError"));
  }, { once: true });
});

export class MockSaksromStreamTransport implements SaksromStreamTransport {
  async stream(_request: SaksromStreamRequest, options: Parameters<SaksromStreamTransport["stream"]>[1]): Promise<void> {
    options.onEvent({ type: "started", requestId: "mock-request-1" });
    options.onEvent({ type: "focus", action: "READING", label: "Leser leieavtalen" });
    await delay(40, options.signal);
    options.onEvent({ type: "text_delta", content: "Leieavtalen legger vedlikeholdsansvaret på leietaker. " });
    options.onEvent({ type: "citation", citation: {
      documentId: "mock-document-contract", sourceUnitId: "mock-contract-page-4", pageNumber: 4,
      label: "Leieavtale · side 4", excerpt: "Leietaker er ansvarlig for ordinært innvendig vedlikehold."
    } });
    await delay(40, options.signal);
    options.onEvent({ type: "text_delta", content: "E-postloggen viser samtidig at utleier senere tok ansvar." });
    options.onEvent({ type: "completed", sourceBound: true });
  }
}

export function createSaksromStreamTransport(): SaksromStreamTransport {
  if (import.meta.env.MODE === "test") return new RestSaksromStreamTransport();
  return EVIDA_STREAM_MODE === "mock" ? new MockSaksromStreamTransport() : new SpringSaksromStreamTransport();
}
