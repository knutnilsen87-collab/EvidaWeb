import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { askSaksromQuestion, SaksromAnswer, SourceCoverage } from "../lib/api";
import { SaksromStatusLine } from "./SaksromStatusLine";
import { SourceBoundAnswerCard } from "./SourceBoundAnswerCard";
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
  completenessAcknowledged?: boolean;
  completenessPassed?: boolean;
  selectedSourceUnitIds?: string[];
  isPreliminary?: boolean;
  isProcessing?: boolean;
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

const noSourceAnswer: SaksromAnswer = {
  answer: "Mangler kildegrunnlag. Velg en kilde eller klargjør dokumenter før Saksrom kan svare kildebundet.",
  sources: [],
  sourceBound: false,
  warnings: ["NO_SOURCE_BASIS"]
};

const idleSourceAnswer: SaksromAnswer = {
  answer: "",
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
  completenessAcknowledged = false,
  completenessPassed = false,
  selectedSourceUnitIds = [],
  isPreliminary = false,
  isProcessing = false,
  verifiedCount,
  sourceCoverage,
  openingSummary
}: SaksromChatProps) {
  const readyPageCount = sourceCoverage?.readyPages ?? null;
  const totalPageCount = sourceCoverage?.totalPages ?? null;
  const hasSourceBasis = sourceCoverage ? (sourceCoverage.readyPages ?? 0) > 0 : (verifiedCount ?? 0) > 0;
  const chatBlocked = !hasSourceBasis;
  const currentBasisCount = readyPageCount ?? verifiedCount ?? 0;
  const [mode, setMode] = useState<ChatMode>("ASK");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<SaksromAnswer>(() => (chatBlocked ? noSourceAnswer : idleSourceAnswer));
  const [wasAnswerPreliminary, setWasAnswerPreliminary] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answerBasisCount, setAnswerBasisCount] = useState<number | null>(null);
  const [renderedAnswer, setRenderedAnswer] = useState(answer.answer);
  const [isRenderingAnswer, setIsRenderingAnswer] = useState(false);
  const [hasNewUpdates, setHasNewUpdates] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);

  const partialNoticeText = sourceCoverage?.totalPages
    ? `Svar bygger på ferdig behandlede kilder. ${Math.max(0, sourceCoverage.totalPages - sourceCoverage.readyPages)} sider krever fortsatt kontroll og brukes ikke som kilde.`
    : "Svar bygger på ferdig behandlede kilder. Uferdige dokumenter brukes ikke som kilde.";

  useEffect(() => {
    if (chatBlocked) {
      setAnswer(blockedAnswer());
      return;
    }
    setAnswer((current) => (current.warnings.includes("NO_SOURCE_BASIS") ? idleSourceAnswer : current));
  }, [chatBlocked]);

  const prevCaseIdRef = useRef(caseId);

  useEffect(() => {
    if (prevCaseIdRef.current !== caseId) {
      prevCaseIdRef.current = caseId;
      setQuestion("");
      setAnswer(chatBlocked ? blockedAnswer() : idleSourceAnswer);
      setWasAnswerPreliminary(false);
      setError("");
      setLastQuestion("");
      setAnswerBasisCount(null);
    }
  }, [caseId, chatBlocked]);

  useEffect(() => {
    const text = answer.answer;
    if (!lastQuestion || text.length < 2) {
      setRenderedAnswer(text);
      setIsRenderingAnswer(false);
      return;
    }

    setRenderedAnswer("");
    setIsRenderingAnswer(true);
    let offset = 0;
    const chunkSize = Math.max(2, Math.ceil(text.length / 36));
    const timer = window.setInterval(() => {
      offset = Math.min(text.length, offset + chunkSize);
      setRenderedAnswer(text.slice(0, offset));
      if (offset >= text.length) {
        window.clearInterval(timer);
        setIsRenderingAnswer(false);
      }
    }, 18);
    return () => window.clearInterval(timer);
  }, [answer.answer, lastQuestion]);

  function scheduleScrollToBottom(force = false) {
    const container = chatHistoryRef.current;
    if (!container) return;
    if (!force && !isNearBottomRef.current) {
      setHasNewUpdates(true);
      return;
    }
    if (scrollFrameRef.current !== null) (window.cancelAnimationFrame ?? window.clearTimeout)(scrollFrameRef.current);
    const requestFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0));
    scrollFrameRef.current = requestFrame(() => {
      container.scrollTop = container.scrollHeight;
      isNearBottomRef.current = true;
      setHasNewUpdates(false);
      scrollFrameRef.current = null;
    });
  }

  function handleHistoryScroll() {
    const container = chatHistoryRef.current;
    if (!container) return;
    isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 96;
    if (isNearBottomRef.current) setHasNewUpdates(false);
  }

  useEffect(() => {
    const container = chatHistoryRef.current;
    if (!container) return;
    scheduleScrollToBottom(true);
    const observer = new MutationObserver(() => scheduleScrollToBottom());
    observer.observe(container, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scrollFrameRef.current !== null) (window.cancelAnimationFrame ?? window.clearTimeout)(scrollFrameRef.current);
    };
  }, []);

  useEffect(() => {
    scheduleScrollToBottom();
  }, [renderedAnswer, answer.sources.length, answer.warnings.length, error, isSending, openingSummary]);

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
  const showAnswer = renderedAnswer.trim().length > 0;
  const status = (() => {
    if (sourceCoverage?.totalPages) {
      const isFullCoverage = sourceCoverage.readyPages >= sourceCoverage.totalPages;
      const pageCopy = isFullCoverage
        ? `${sourceCoverage.readyPages}/${sourceCoverage.totalPages} sider`
        : `${sourceCoverage.readyPages} av ${sourceCoverage.totalPages} sider klare`;
      const secondary = [
        sourceCoverage.missingOcrPages
          ? `${sourceCoverage.missingOcrPages} side${sourceCoverage.missingOcrPages === 1 ? "" : "r"} krever OCR`
          : null,
        sourceCoverage.belowThresholdPages
          ? `${sourceCoverage.belowThresholdPages} side${sourceCoverage.belowThresholdPages === 1 ? "" : "r"} krever kontroll`
          : null
      ].filter(Boolean).join(" · ") || null;

      if (isFullCoverage) {
        return { primary: `Kildegrunnlaget er klart · ${pageCopy}`, secondary: null, tone: "ready" as const };
      }
      if (isProcessing || sourceCoverage.readyPages === 0) {
        return {
          primary: `Kildegrunnlaget behandles · ${pageCopy}`,
          secondary,
          tone: "processing" as const
        };
      }
      return {
        primary: `Foreløpig kildegrunnlag · ${pageCopy}`,
        secondary,
        tone: "preliminary" as const
      };
    }
    if (!chatBlocked) {
      const documentCount = verifiedCount ?? 1;
      return {
        primary: `Kildegrunnlaget er klart · ${documentCount} dokument${documentCount === 1 ? "" : "er"}`,
        secondary: null,
        tone: "ready" as const
      };
    }
    return null;
  })();

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

      <div className="chat-history" aria-label="Saksrom chatlogg" aria-live="polite" onScroll={handleHistoryScroll} ref={chatHistoryRef}>
        {openingSummary}
        {lastQuestion ? (
          <div className="user-message">
            <p>{lastQuestion}</p>
          </div>
        ) : null}
        {showAnswer && answer.sourceBound && !showNoSourceBasis ? (
          <SourceBoundAnswerCard
            findings={answer.findings}
            isRendering={isRenderingAnswer}
            sources={answer.sources}
            text={renderedAnswer}
          >
            {answer.warnings.map((warning) => (
              <span className="source-warning" key={warning}>
                {warning}
              </span>
            ))}
            {wasAnswerPreliminary ? (
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
          </SourceBoundAnswerCard>
        ) : showAnswer ? (
          <div className="ai-message ai-message--unbound">
            {showNoSourceBasis ? <strong>Mangler kildegrunnlag</strong> : null}
            <div className={isRenderingAnswer ? "streaming-text ai-message__body" : "ai-message__body"}>
              {renderedAnswer.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>)}
            </div>
            {answer.warnings.map((warning) => (
              <span className="source-warning" key={warning}>
                {warning}
              </span>
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="ai-message ai-message--unbound" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      {hasNewUpdates ? (
        <button className="chat-new-updates" onClick={() => scheduleScrollToBottom(true)} type="button">
          Nye oppdateringer
        </button>
      ) : null}

      <div className="chat-input-zone">
        {status ? (
          <SaksromStatusLine
            primary={status.primary}
            secondary={status.secondary}
            tone={status.tone}
          />
        ) : null}
        {completenessAcknowledged ? (
          <div
            className={`saksrom-completeness-chip ${
              completenessPassed ? "saksrom-completeness-chip--passed" : "saksrom-completeness-chip--preliminary"
            }`}
            role="status"
          >
            <span aria-hidden="true">{completenessPassed ? "✓" : "!"}</span>
            {completenessPassed ? "Kompletthetskontroll bestått" : "Foreløpig kompletthetskontroll bekreftet"}
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
