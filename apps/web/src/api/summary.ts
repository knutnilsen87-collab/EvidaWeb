import { OperativeSummaryResponseSchema } from "../engine/schema";
import type { OperativeSummaryResponse } from "../engine/types";
import { authService } from "../lib/auth";

function apiBaseUrl() {
  return import.meta.env.VITE_EVIDA_API_BASE_URL ?? "";
}

export async function fetchOperativeSummary(
  caseId: string,
  tenantId?: string
): Promise<OperativeSummaryResponse> {
  const response = await fetch(`${apiBaseUrl()}/api/cases/${encodeURIComponent(caseId)}/summary`, {
    headers: tenantId ? authService.getHeaders(tenantId) : undefined
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch operative summary: ${response.status}`);
  }

  const json = await response.json();
  const parsed = OperativeSummaryResponseSchema.safeParse(json);

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error("Operative summary failed Court Engine validation.");
  }

  return parsed.data;
}
