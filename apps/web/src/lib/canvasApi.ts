import type { CaseCanvasDocument, CaseCanvasEdge, CaseCanvasNode } from "../domain/caseCanvas";
import { relationLabels } from "../domain/caseCanvas";
import { getHeaders } from "./api";

interface BackendCanvasNode {
  id: string;
  nodeType: CaseCanvasNode["data"]["nodeType"];
  title: string;
  body: string;
  status: CaseCanvasNode["data"]["status"];
  x: number;
  y: number;
  source?: { documentId: string; sourceUnitId: string; pageNumber: number; label?: string };
}

interface BackendCanvasEdge {
  id: string;
  source: string;
  target: string;
  relationType: NonNullable<CaseCanvasEdge["data"]>["relationType"];
}

interface BackendCanvasResponse {
  caseId: string;
  version: number;
  canvas: { nodes: BackendCanvasNode[]; edges: BackendCanvasEdge[]; viewport?: { x: number; y: number; zoom: number } };
  updatedAt?: string | null;
}

function toDocument(response: BackendCanvasResponse): CaseCanvasDocument {
  return {
    schemaVersion: 1,
    caseId: response.caseId,
    version: response.version,
    updatedAt: response.updatedAt ?? new Date(0).toISOString(),
    viewport: response.canvas.viewport,
    nodes: response.canvas.nodes.map((node) => ({
      id: node.id,
      type: "legal",
      position: { x: node.x, y: node.y },
      data: {
        nodeType: node.nodeType,
        title: node.title,
        body: node.body,
        status: node.status,
        source: node.source ? {
          ...node.source,
          label: node.source.label || `Side ${node.source.pageNumber}`
        } : undefined
      }
    })),
    edges: response.canvas.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: relationLabels[edge.relationType],
      data: { relationType: edge.relationType }
    }))
  };
}

async function parseResponse(response: Response): Promise<BackendCanvasResponse> {
  if (!response.ok) throw new Error(response.status === 409 ? "Sakslerretet er endret i en annen økt. Last inn på nytt." : `Sakslerret svarte ${response.status}.`);
  return response.json() as Promise<BackendCanvasResponse>;
}

export async function fetchCaseCanvas(tenantId: string, caseId: string): Promise<CaseCanvasDocument> {
  const response = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/canvas`, { headers: getHeaders(tenantId) });
  return toDocument(await parseResponse(response));
}

export async function saveCaseCanvas(tenantId: string, document: CaseCanvasDocument): Promise<CaseCanvasDocument> {
  const response = await fetch(`/api/v1/cases/${encodeURIComponent(document.caseId)}/canvas`, {
    method: "PUT",
    headers: getHeaders(tenantId),
    body: JSON.stringify({
      expectedVersion: document.version,
      canvas: {
        nodes: document.nodes.map((node) => ({
          id: node.id,
          nodeType: node.data.nodeType,
          title: node.data.title,
          body: node.data.body,
          status: node.data.status ?? "UNSOURCED",
          x: node.position.x,
          y: node.position.y,
          source: node.data.source ? {
            documentId: node.data.source.documentId,
            sourceUnitId: node.data.source.sourceUnitId,
            pageNumber: node.data.source.pageNumber,
            label: node.data.source.label
          } : undefined
        })),
        edges: document.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relationType: edge.data?.relationType
        })),
        viewport: document.viewport
      }
    })
  });
  return toDocument(await parseResponse(response));
}
