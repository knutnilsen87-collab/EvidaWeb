import { useEffect, useRef } from "react";
import { fetchOperativeSummary } from "../api/summary";
import type { AnalysisStatus, CourtEngineMessage } from "../engine/types";
import { formatOperativeSummary } from "../utils/formatOperativeSummary";

interface UseCourtEngineParams {
  caseId: string | null;
  tenantId?: string;
  analysisStatus: AnalysisStatus;
  addMessageToChat: (message: CourtEngineMessage) => void;
}

export function useCourtEngine({
  caseId,
  tenantId,
  analysisStatus,
  addMessageToChat
}: UseCourtEngineParams) {
  const injectedForCase = useRef<string | null>(null);

  useEffect(() => {
    if (!caseId || !tenantId) {
      return;
    }
    if (analysisStatus !== "completed") {
      return;
    }
    if (injectedForCase.current === caseId) {
      return;
    }

    injectedForCase.current = caseId;

    fetchOperativeSummary(caseId, tenantId)
      .then((summary) => {
        addMessageToChat({
          type: "system",
          content: formatOperativeSummary(summary),
          timestamp: new Date().toISOString()
        });
      })
      .catch((error) => {
        console.error(error);
        addMessageToChat({
          type: "system",
          content:
            "Operativ lederoppsummering kunne ikke hentes eller valideres. Kontroller backend-respons, Zod-validering og saksdekning.",
          timestamp: new Date().toISOString()
        });
      });
  }, [caseId, tenantId, analysisStatus, addMessageToChat]);
}
