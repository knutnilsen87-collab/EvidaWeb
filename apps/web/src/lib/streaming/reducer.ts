import { sourceRefKey } from "../../domain/sourceUnitRef";
import type { SaksromStreamEvent, SaksromStreamState } from "./types";

export const initialSaksromStreamState: SaksromStreamState = {
  status: "idle",
  requestId: null,
  text: "",
  focus: null,
  citations: [],
  warnings: [],
  sourceBound: true,
  answer: null,
  error: null
};

export function reduceSaksromStreamEvent(previous: SaksromStreamState, event: SaksromStreamEvent): SaksromStreamState {
  if (event.type === "started") return { ...previous, status: "working", requestId: event.requestId, error: null };
  if (event.type === "focus") return { ...previous, status: previous.text ? "streaming" : "working", focus: event, error: null };
  if (event.type === "text_delta") return { ...previous, status: "streaming", text: previous.text + event.content, error: null };
  if (event.type === "citation") {
    return previous.citations.some((item) => sourceRefKey(item) === sourceRefKey(event.citation))
      ? previous
      : { ...previous, citations: [...previous.citations, event.citation] };
  }
  if (event.type === "warning") return previous.warnings.includes(event.code)
    ? previous
    : { ...previous, warnings: [...previous.warnings, event.code] };
  if (event.type === "completed") return {
    ...previous,
    status: "completed",
    focus: null,
    sourceBound: event.sourceBound ?? previous.sourceBound,
    answer: event.answer ?? previous.answer,
    error: null
  };
  return { ...previous, status: "error", focus: null, error: event.message };
}
