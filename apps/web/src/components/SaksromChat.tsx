import { FormEvent, useState, useEffect, useRef } from "react";
import { askSaksromQuestion, SaksromAnswer, SourceReference } from "../lib/api";
import { Citation } from "../lib/CitationManager";
import { CitationChip } from "./chat/CitationChip";
import "./SaksromChat.css";

type ChatMode = "ASK" | "ARGUE" | "SIMULATE";

const modeLabels: Record<ChatMode, string> = {
  ASK: "Spørre",
  ARGUE: "Argumentere",
  SIMULATE: "Simulere"
};

const apiMode: Record<ChatMode, "sporre" | "argumentere" | "simulere"> = {
  ASK: "sporre",
  ARGUE: "argumentere",
  SIMULATE: "simulere"
};

interface SaksromChatProps {
  caseId?: string;
  tenantId?: string;
  selectedSourceUnitIds?: string[];
  isPreliminary?: boolean;
  verifiedCount?: number;
}

function placeholderForMode(mode: ChatMode) {
  if (mode === "SIMULATE") {
    return "Skriv din rettssak-simulering...";
  }
  if (mode === "ARGUE") {
    return "Skriv argumentet du vil stressteste...";
  }
  return "Skriv din juridiske vurdering...";
}

function rectFromHighlight(highlightJson?: string | null) {
  if (!highlightJson) {
    return { top: 0, left: 0, width: 0, height: 0 };
  }

  try {
    const parsed = JSON.parse(highlightJson) as Partial<Citation["rect"]>;
    return {
      top: Number(parsed.top ?? 0),
      left: Number(parsed.left ?? 0),
      width: Number(parsed.width ?? 0),
      height: Number(parsed.height ?? 0)
    };
  } catch {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
}

function citationFromSource(source: SourceReference): Citation {
  return {
    documentId: source.documentId,
    sourceUnitId: source.sourceUnitId,
    page: source.pageNumber,
    pageNumber: source.pageNumber,
    paragraph: source.sourceUnitId,
    rect: rectFromHighlight(source.highlightJson)
  };
}

const noSourceAnswer: SaksromAnswer = {
  answer: "Mangler kildegrunnlag. Velg en kilde eller klargjør dokumenter før Saksrom kan svare kildebundet.",
  sources: [],
  sourceBound: false,
  warnings: ["NO_SOURCE_BASIS"]
};

export function SaksromChat({ 
  caseId, 
  tenantId, 
  selectedSourceUnitIds = [], 
  isPreliminary = false,
  verifiedCount
}: SaksromChatProps) {
  const [mode, setMode] = useState<ChatMode>("ASK");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<SaksromAnswer>(noSourceAnswer);
  const [wasAnswerPreliminary, setWasAnswerPreliminary] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const [lastQuestion, setLastQuestion] = useState("");
  const [answerBasisCount, setAnswerBasisCount] = useState<number | null>(null);

  useEffect(() => {
    if (verifiedCount === 0) {
      setAnswer({
        answer: "Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst ett dokument er ferdig behandlet.",
        sources: [],
        sourceBound: false,
        warnings: ["NO_SOURCE_BASIS"]
      });
    } else if (verifiedCount !== undefined && answer.answer === "Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst ett dokument er ferdig behandlet.") {
      setAnswer(noSourceAnswer);
    }
  }, [verifiedCount]);

  const prevCaseIdRef = useRef(caseId);

  useEffect(() => {
    if (prevCaseIdRef.current !== caseId) {
      prevCaseIdRef.current = caseId;
      setQuestion("");
      setAnswer(verifiedCount === 0 ? {
        answer: "Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst ett dokument er ferdig behandlet.",
        sources: [],
        sourceBound: false,
        warnings: ["NO_SOURCE_BASIS"]
      } : noSourceAnswer);
      setWasAnswerPreliminary(false);
      setError("");
      setLastQuestion("");
      setAnswerBasisCount(null);
    }
  }, [caseId, verifiedCount]);

  async function submitQuestion(q: string) {
    if (!tenantId || !q.trim()) {
      setAnswer(noSourceAnswer);
      setWasAnswerPreliminary(false);
      return;
    }

    setIsSending(true);
    setError("");
    try {
      const resp = await askSaksromQuestion(tenantId, {
        caseId,
        question: q,
        selectedSourceUnitIds,
        mode: apiMode[mode]
      });
      setAnswer(resp);
      setWasAnswerPreliminary(isPreliminary);
      setLastQuestion(q);
      setAnswerBasisCount(verifiedCount ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saksrom-forespørsel feilet");
      setAnswer(noSourceAnswer);
      setWasAnswerPreliminary(false);
    } finally {
      setIsSending(false);
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(question);
  };

  return (
    <form className="saksrom-chat" onSubmit={(event) => void handleSubmit(event)}>
      <div className="chat-modes" aria-label="Saksrom-modus">
        {(Object.keys(modeLabels) as ChatMode[]).map((nextMode) => (
          <button
            aria-pressed={mode === nextMode}
            className={mode === nextMode ? "active" : ""}
            key={nextMode}
            onClick={() => setMode(nextMode)}
            type="button"
          >
            {modeLabels[nextMode]}
          </button>
        ))}
      </div>

      <div className="chat-history" aria-label="Saksrom chatlogg">
        <div className={answer.sourceBound ? "ai-message ai-message--source" : "ai-message ai-message--unbound"}>
          {!answer.sourceBound ? <strong>Mangler kildegrunnlag</strong> : null}
          <p>{answer.answer}</p>
          {answer.warnings.map((warning) => (
            <span className="source-warning" key={warning}>
              {warning}
            </span>
          ))}
          {wasAnswerPreliminary && answer.sourceBound && (
            <div
              className="preliminary-answer-warning"
              style={{
                marginTop: "var(--evida-space-2)",
                marginBottom: "var(--evida-space-2)",
                padding: "var(--evida-space-2) var(--evida-space-3)",
                background: "rgba(217, 119, 6, 0.1)",
                borderLeft: "3px solid var(--evida-status-warning)",
                borderRadius: "4px",
                color: "var(--evida-status-warning)",
                fontSize: "0.85rem",
                lineHeight: 1.4
              }}
            >
              Produsert med foreløpig kildegrunnlag. Ikke alle dokumenter/sider var verifisert på genereringstidspunktet.
            </div>
          )}
          {lastQuestion && verifiedCount !== undefined && answerBasisCount !== null && verifiedCount > answerBasisCount && (
            <div
              className="stale-answer-warning"
              style={{
                marginTop: "var(--evida-space-2)",
                marginBottom: "var(--evida-space-2)",
                padding: "var(--evida-space-2) var(--evida-space-3)",
                background: "rgba(59, 130, 246, 0.1)",
                borderLeft: "3px solid var(--evida-status-info)",
                borderRadius: "4px",
                color: "var(--evida-status-info)",
                fontSize: "0.85rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <span>Kildegrunnlaget er oppdatert siden forrige svar.</span>
              <button 
                type="button" 
                onClick={() => void submitQuestion(lastQuestion)}
                style={{
                  background: "var(--evida-status-info)",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600
                }}
              >
                Oppsummer saken på nytt
              </button>
            </div>
          )}
          {answer.sourceBound
            ? answer.sources.map((source) => (
                <CitationChip
                  citation={citationFromSource(source)}
                  key={source.sourceUnitId}
                  label={source.sourceUnitId}
                />
              ))
            : null}
        </div>
        {error ? (
          <div className="ai-message ai-message--unbound" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      <div className="chat-input-zone">
        <textarea
          aria-label="Saksrom melding"
          onChange={(event) => setQuestion(event.currentTarget.value)}
          placeholder={placeholderForMode(mode)}
          rows={3}
          value={question}
          disabled={verifiedCount === 0}
        />
        <button className="send-btn" disabled={isSending || verifiedCount === 0} type="submit">
          {isSending ? "Sender..." : "Send"}
        </button>
      </div>
    </form>
  );
}
