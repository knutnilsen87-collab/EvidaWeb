export type VerificationStatus = "verified" | "ambiguous" | "not_documented" | "requires_manual_review";

export type IntegrityStatus = "verified" | "unverified";

export type Severity = "low" | "medium" | "high";

export interface SourceRef {
  documentId: string;
  page: number;
  bates?: string;
  exhibitId?: string;
  quote: string;
}

export interface ActorRoleFinding {
  role: string;
  status: VerificationStatus;
  sources: SourceRef[];
}

export interface ActorCandidate {
  name: string;
  roles: ActorRoleFinding[];
}

export interface CoverageStatus {
  processedPages: number;
  totalPages: number;
  coveragePercent: number;
  missingIntervals: string[];
  overlaps: string[];
  integrityStatus: IntegrityStatus;
}

export interface KeyFinding {
  finding: string;
  status: VerificationStatus;
  sources: SourceRef[];
}

export interface RiskFinding {
  type: string;
  description: string;
  severity: Severity;
  status: VerificationStatus;
  sources: SourceRef[];
}

export interface OperativeSummaryResponse {
  caseMetadata: {
    caseId: string;
    title: string;
    type: string;
    status: string;
    analysisDate: string;
  };
  coverage: CoverageStatus;
  actorMatrix: ActorCandidate[];
  operativeSummary: {
    keyFindings: KeyFinding[];
    risks: RiskFinding[];
  };
}

export type AnalysisStatus = "idle" | "processing" | "completed" | "failed";

export interface CourtEngineMessage {
  type: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}
