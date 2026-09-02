import type { Edge, Node, Viewport } from "@xyflow/react";
import type { SourceUnitRef } from "./sourceUnitRef";

export type CaseCanvasNodeType = "FACT" | "CLAIM" | "EVIDENCE" | "LEGAL_RULE" | "RISK";
export type CaseCanvasRelationType = "SUPPORTS" | "CONTRADICTS" | "QUALIFIES" | "DEPENDS_ON";

export interface CaseCanvasNodeData extends Record<string, unknown> {
  nodeType: CaseCanvasNodeType;
  title: string;
  body: string;
  source?: SourceUnitRef;
  status?: "VERIFIED" | "PRELIMINARY" | "UNSOURCED";
}

export interface CaseCanvasEdgeData extends Record<string, unknown> {
  relationType: CaseCanvasRelationType;
}

export type CaseCanvasNode = Node<CaseCanvasNodeData, "legal">;
export type CaseCanvasEdge = Edge<CaseCanvasEdgeData>;

export interface CaseCanvasDocument {
  schemaVersion: 1;
  caseId: string;
  version: number;
  nodes: CaseCanvasNode[];
  edges: CaseCanvasEdge[];
  viewport?: Viewport;
  updatedAt: string;
}

export const relationLabels: Record<CaseCanvasRelationType, string> = {
  SUPPORTS: "Støtter",
  CONTRADICTS: "Motsier",
  QUALIFIES: "Nyanserer",
  DEPENDS_ON: "Avhenger av"
};

export const nodeTypeLabels: Record<CaseCanvasNodeType, string> = {
  FACT: "Faktum",
  CLAIM: "Påstand",
  EVIDENCE: "Bevis",
  LEGAL_RULE: "Rettsregel",
  RISK: "Risiko"
};
