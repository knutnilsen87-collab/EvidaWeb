import type { SaksromAnswer, SaksromSummaryFinding, SourceReference } from "../api";
import type { SaksromStreamEvent, SharedFocusAction } from "./types";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const readString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const readNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

function actionFromStage(stage: unknown): SharedFocusAction {
  if (stage === "extracting_findings") return "VERIFYING";
  if (stage === "linking_citations") return "COMPARING";
  if (stage === "composing_summary") return "WRITING";
  return "READING";
}

function labelFromStage(stage: unknown): string {
  if (stage === "extracting_findings") return "Identifiserer faktiske funn";
  if (stage === "linking_citations") return "Knytter funn til kilder";
  if (stage === "composing_summary") return "Sammenstiller saksoversikten";
  return "Leser kildegrunnlaget";
}

function parseCitation(raw: UnknownRecord) {
  const documentId = readString(raw.documentId);
  const sourceUnitId = readString(raw.sourceUnitId);
  const pageNumber = readNumber(raw.pageNumber ?? raw.page);
  if (!documentId || !sourceUnitId || pageNumber === undefined || pageNumber < 1) return null;
  return {
    documentId,
    sourceUnitId,
    pageNumber,
    label: readString(raw.label) ?? `Side ${pageNumber}`,
    excerpt: readString(raw.excerpt) ?? readString(raw.quote),
    confidence: readNumber(raw.confidence),
    highlightJson: readString(raw.highlightJson)
  };
}

function parseSourceReference(value: unknown): SourceReference | null {
  if (!isRecord(value)) return null;
  const parsed = parseCitation(value);
  if (!parsed) return null;
  return {
    documentId: parsed.documentId,
    sourceUnitId: parsed.sourceUnitId,
    pageNumber: parsed.pageNumber,
    quote: parsed.excerpt,
    confidence: parsed.confidence,
    highlightJson: parsed.highlightJson
  };
}

function parseFinding(value: unknown): SaksromSummaryFinding | null {
  if (!isRecord(value)) return null;
  const heading = readString(value.heading);
  const text = readString(value.text);
  if (!heading || !text) return null;
  const sources = Array.isArray(value.sources) ? value.sources.map(parseSourceReference).filter((item): item is SourceReference => Boolean(item)) : [];
  return { heading, text, sources };
}

function parseAnswer(value: unknown): SaksromAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const answer = readString(value.answer);
  if (answer === undefined || typeof value.sourceBound !== "boolean") return undefined;
  const sources = Array.isArray(value.sources) ? value.sources.map(parseSourceReference).filter((item): item is SourceReference => Boolean(item)) : [];
  const findings = Array.isArray(value.findings) ? value.findings.map(parseFinding).filter((item): item is SaksromSummaryFinding => Boolean(item)) : undefined;
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(readString).filter((item): item is string => Boolean(item)) : [];
  return { answer, findings, sources, sourceBound: value.sourceBound, warnings };
}

export function parseBackendStreamEvent(value: unknown): SaksromStreamEvent | null {
  if (!isRecord(value)) return null;
  const type = readString(value.type);
  if (type === "started") {
    const requestId = readString(value.requestId);
    return requestId ? { type: "started", requestId } : null;
  }
  if (type === "stage" || type === "focus") {
    return {
      type: "focus",
      action: type === "stage" ? actionFromStage(value.stage) : actionFromStage(value.action),
      label: readString(value.message) ?? readString(value.label) ?? labelFromStage(value.stage),
      documentId: readString(value.documentId),
      sourceUnitId: readString(value.sourceUnitId),
      pageNumber: readNumber(value.pageNumber)
    };
  }
  if (type === "text_delta") {
    const content = readString(value.content) ?? readString(value.delta) ?? readString(value.text);
    return content ? { type: "text_delta", content } : null;
  }
  if (type === "citation") {
    const nested = isRecord(value.citation) ? value.citation : value;
    const citation = parseCitation(nested);
    return citation ? { type: "citation", citation, claimId: readString(value.claimId) } : null;
  }
  if (type === "warning") {
    const code = readString(value.code);
    return code ? { type: "warning", code } : null;
  }
  if (type === "complete" || type === "completed") {
    const answer = parseAnswer(value.answer);
    return { type: "completed", answer, sourceBound: answer?.sourceBound };
  }
  if (type === "error") {
    return {
      type: "error",
      message: readString(value.message) ?? "Strømmen ble avbrutt.",
      recoverable: typeof value.recoverable === "boolean" ? value.recoverable : true
    };
  }
  return null;
}
