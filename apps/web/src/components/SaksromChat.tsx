import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { askSaksromQuestion, SaksromAnswer, SourceCoverage, SourceReference } from "../lib/api";
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

const mobilePromptSuggestions = [
  "Oppsummer saken",
  "Hva er de viktigste spørsmålene?",
  "Hva mangler?",
  "Finn motstridende opplysninger",
  "Hva bør undersøkes videre?"
];

interface SaksromChatProps {
  caseId?: string;
  tenantId?: string;
  selectedSourceUnitIds?: string[];
  isPreliminary?: boolean;
  verifiedCount?: number;
  sourceCoverage?: SourceCoverage | null;
  openingSummary?: ReactNode;
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

const readySourceAnswer: SaksromAnswer = {
  answer: "Saksrommet er klart for kildebundne spørsmål basert på ferdig behandlede kilder.",
  sources: [],
  sourceBound: true,
  warnings: []
};

const requestFailedAnswer: SaksromAnswer = {
  answer: "Kunne ikke hente svar fra Saksrom akkurat nå. Kildegrunnlaget er fortsatt tilgjengelig; prøv igjen.",
  sources: [],
  sourceBound: false,
  warnings: ["REQUEST_FAILED"]
};

function blockedAnswer(): SaksromAnswer {
  return {
    answer: "Saksrommet er åpnet, men kan ikke gi kildebaserte svar før minst én side er ferdig behandlet.",
    sources: [],
    sourceBound: false,
    warnings: ["NO_SOURCE_BASIS"]
  };
}

export function SaksromChat({
  caseId,
  tenantId,
  selectedSourceUnitIds = [],
  isPreliminary = false,
  verifiedCount,
  sourceCoverage,
  openingSummary
}: SaksromChatProps) {
  const [mode, setMode] = useState<ChatMode>("ASK");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<SaksromAnswer>(noSourceAnswer);
  const [wasAnswerPreliminary, setWasAnswerPreliminary] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answerBasisCount, setAnswerBasisCount] = useState<number | null>(null);

  const readyPageCount = sourceCoverage?.readyPages ?? null;
  const totalPageCount = sourceCoverage?.totalPages ?? null;
  const hasSourceBasis = sourceCoverage ? (sourceCoverage.readyPages ?? 0) > 0 : (verifiedCount ?? 0) > 0;
  const chatBlocked = !hasSourceBasis;
  const currentBasisCount = readyPageCount ?? verifiedCount ?? 0;
  const partialNoticeText = sourceCoverage?.totalPages
    ? `Svar bygger på ferdig behandlede kilder. ${Math.max(0, sourceCoverage.totalPages - sourceCoverage.readyPages)} sider krever fortsatt kontroll og brukes ikke som kilde.`
    : "Svar bygger på ferdig behandlede kilder. Uferdige dokumenter brukes ikke som kilde.";

  useEffect(() => {
    if (chatBlocked) {
      setAnswer(blockedAnswer());
      return;
    }
    setAnswer((current) => (current.warnings.includes("NO_SOURCE_BASIS") ? readySourceAnswer : current));
  }, [chatBlocked]);

  const prevCaseIdRef = useRef(caseId);

  useEffect(() => {
    if (prevCaseIdRef.current !== caseId) {
      prevCaseIdRef.current = caseId;
      setQuestion("");
      setAnswer(chatBlocked ? blockedAnswer() : readySourceAnswer);
      setWasAnswerPreliminary(false);
      setError("");
      setLastQuestion("");
      setAnswerBasisCount(null);
    }
  }, [caseId, chatBlocked]);

  async function submitQuestion(q: string) {
    if (!tenantId || !q.trim() || chatBlocked) {
      setAnswer(chatBlocked ? blockedAnswer() : noSourceAnswer);
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
        mode: apiMode[mode],
        includePartial: true,
        sourceBasis: "READY_PAGE_UNITS_ONLY"
      });
      setAnswer(resp);
      setWasAnswerPreliminary(isPreliminary);
      setLastQuestion(q);
      setAnswerBasisCount(currentBasisCount);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saksrom-forespørsel feilet");
      setAnswer(chatBlocked ? blockedAnswer() : requestFailedAnswer);
      setWasAnswerPreliminary(false);
    } finally {
      setIsSending(false);
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(question);
  };

  const showNoSourceBasis = answer.warnings.includes("NO_SOURCE_BASIS");

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
        {openingSummary}
        <div className={showNoSourceBasis ? "ai-message ai-message--unbound" : "ai-message ai-message--source"}>
          {showNoSourceBasis ? <strong>Mangler kildegrunnlag</strong> : null}
          <p>{answer.answer}</p>
          {answer.warnings.map((warning) => (
            <span className="source-warning" key={warning}>
              {warning}
            </span>
          ))}
          {wasAnswerPreliminary && answer.sourceBound ? (
            <div className="preliminary-answer-warning">
              {partialNoticeText}
            </div>
          ) : null}
          {lastQuestion && answerBasisCount !== null && currentBasisCount > answerBasisCount ? (
            <div className="stale-answer-warning">
              <span>Kildegrunnlaget er oppdatert siden forrige svar.</span>
              <button type="button" onClick={() => void submitQuestion(lastQuestion)}>
                Oppsummer saken på nytt
              </button>
            </div>
          ) : null}
          {answer.sourceBound
            ? answer.sources.map((source) => (
                <CitationChip
                  citation={citationFromSource(source)}
                  key={source.sourceUnitId}
                  label={`Side ${source.pageNumber}`}
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
        {isPreliminary && hasSourceBasis ? (
          <div className="partial-chat-notice" role="status">
            <span>{partialNoticeText}</span>
            {readyPageCount !== null && totalPageCount !== null ? (
              <span>{readyPageCount} av {totalPageCount} sider er klare.</span>
            ) : null}
          </div>
        ) : null}
        {!chatBlocked ? (
          <div className="mobile-chat-suggestions" aria-label="Forslag til spørsmål">
            {mobilePromptSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          aria-label="Saksrom melding"
          disabled={chatBlocked}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          placeholder={placeholderForMode(mode)}
          rows={3}
          value={question}
        />
        <button className="send-btn" disabled={isSending || chatBlocked} type="submit">
          {isSending ? "Sender..." : "Send"}
        </button>
      </div>
    </form>
  );
}
