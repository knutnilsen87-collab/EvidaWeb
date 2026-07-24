import type { ReactNode } from "react";
import type { SaksromSummaryFinding, SourceReference } from "../lib/api";
import type { Citation } from "../lib/CitationManager";
import { CitationChip } from "./chat/CitationChip";
import "./SourceBoundAnswerCard.css";

type AnswerBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "unordered-list"; items: string[] };

interface SourceBoundAnswerCardProps {
  children?: ReactNode;
  findings?: SaksromSummaryFinding[];
  isRendering?: boolean;
  sources: SourceReference[];
  text: string;
}

const orderedItemPattern = /^\s*\d+[.)]\s+(.+)$/;
const unorderedItemPattern = /^\s*[-*•]\s+(.+)$/;

function parseAnswerBlocks(text: string): AnswerBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AnswerBlock[] = [];
  let paragraphLines: string[] = [];
  let listKind: "ordered-list" | "unordered-list" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listKind && listItems.length > 0) {
      blocks.push({ kind: listKind, items: listItems });
      listKind = null;
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const orderedItem = line.match(orderedItemPattern);
    if (orderedItem) {
      flushParagraph();
      if (listKind !== "ordered-list") {
        flushList();
        listKind = "ordered-list";
      }
      listItems.push(orderedItem[1]);
      continue;
    }

    const unorderedItem = line.match(unorderedItemPattern);
    if (unorderedItem) {
      flushParagraph();
      if (listKind !== "unordered-list") {
        flushList();
        listKind = "unordered-list";
      }
      listItems.push(unorderedItem[1]);
      continue;
    }

    flushList();
    const headingLabel = line.slice(0, -1);
    const isExplicitHeading = line.endsWith(":")
      && headingLabel.length <= 48
      && headingLabel.split(/\s+/).length <= 6
      && !/[.,;!?]/.test(headingLabel);
    if (isExplicitHeading) {
      flushParagraph();
      blocks.push({ kind: "heading", text: headingLabel });
      continue;
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
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

export function SourceBoundAnswerCard({
  children,
  findings = [],
  isRendering = false,
  sources,
  text
}: SourceBoundAnswerCardProps) {
  const blocks = parseAnswerBlocks(text);
  const allSources = [...sources, ...findings.flatMap((finding) => finding.sources ?? [])]
    .filter((source, index, candidates) => candidates.findIndex((candidate) =>
      candidate.documentId === source.documentId
      && candidate.sourceUnitId === source.sourceUnitId
      && candidate.pageNumber === source.pageNumber
    ) === index);
  const sourcePages = [...new Set(allSources.map((source) => source.pageNumber))].sort((left, right) => left - right);

  return (
    <article className="source-bound-answer" aria-label="Kildebundet svar">
      <header className="source-bound-answer__header">
        <div>
          <span className="source-bound-answer__eyebrow">Kildebundet analyse</span>
          <h2>Kildebundet svar</h2>
        </div>
        <div className="source-bound-answer__metadata" aria-label="Svarmetadata">
          <span>{allSources.length} kildehenvisning{allSources.length === 1 ? "" : "er"}</span>
          <span>{sourcePages.length} side{sourcePages.length === 1 ? "" : "r"}</span>
        </div>
      </header>

      <div className={isRendering ? "source-bound-answer__body streaming-text" : "source-bound-answer__body"}>
        {blocks.map((block, index) => {
          if (block.kind === "heading") {
            return <h3 key={`heading-${index}`}>{block.text}</h3>;
          }
          if (block.kind === "ordered-list") {
            return (
              <ol key={`ordered-${index}`}>
                {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}
              </ol>
            );
          }
          if (block.kind === "unordered-list") {
            return (
              <ul key={`unordered-${index}`}>
                {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}
              </ul>
            );
          }
          return <p key={`paragraph-${index}`}>{block.text}</p>;
        })}
      </div>

      {findings.length > 0 ? (
        <section className="source-bound-answer__findings" aria-labelledby="source-bound-answer-findings">
          <h3 id="source-bound-answer-findings">Sentrale funn</h3>
          <ol>
            {findings.map((finding, findingIndex) => (
              <li key={`${finding.heading}-${finding.text}-${findingIndex}`}>
                <div className="source-bound-answer__finding-text">
                  {finding.heading ? <strong>{finding.heading}:</strong> : null} {finding.text}
                </div>
                {(finding.sources ?? []).length > 0 ? (
                  <div
                    aria-label={`Kilder for funn ${findingIndex + 1}`}
                    className="source-bound-answer__claim-sources"
                  >
                    {finding.sources.map((source, sourceIndex) => (
                      <CitationChip
                        ariaContext={`for funn ${findingIndex + 1}`}
                        citation={citationFromSource(source)}
                        excerpt={source.quote}
                        key={`${source.sourceUnitId}-${sourceIndex}`}
                        label={`Side ${source.pageNumber}`}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {children}

      {allSources.length > 0 ? (
        <section className="source-bound-answer__sources" aria-labelledby="source-bound-answer-sources">
          <h3 id="source-bound-answer-sources">Kilder brukt</h3>
          <div className="source-bound-answer__chips">
            {allSources.map((source, sourceIndex) => (
              <CitationChip
                citation={citationFromSource(source)}
                excerpt={source.quote}
                key={`${source.sourceUnitId}-${sourceIndex}`}
                label={`Side ${source.pageNumber}`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
