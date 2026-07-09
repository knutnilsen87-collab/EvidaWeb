package no.saksrom.api.courtengine;

import java.util.List;

public record OperativeSummaryResponse(
        CaseMetadata caseMetadata,
        CoverageStatus coverage,
        List<ActorCandidate> actorMatrix,
        OperativeSummary operativeSummary
) {
    public record CaseMetadata(
            String caseId,
            String title,
            String type,
            String status,
            String analysisDate
    ) {}

    public record CoverageStatus(
            int processedPages,
            int totalPages,
            double coveragePercent,
            List<String> missingIntervals,
            List<String> overlaps,
            IntegrityStatus integrityStatus
    ) {}

    public enum IntegrityStatus {
        verified,
        unverified
    }

    public enum Severity {
        low,
        medium,
        high
    }

    public record SourceRef(
            String documentId,
            int page,
            String bates,
            String exhibitId,
            String quote
    ) {}

    public record ActorCandidate(
            String name,
            List<ActorRoleFinding> roles
    ) {}

    public record ActorRoleFinding(
            String role,
            VerificationStatus status,
            List<SourceRef> sources
    ) {}

    public record KeyFinding(
            String finding,
            VerificationStatus status,
            List<SourceRef> sources
    ) {}

    public record RiskFinding(
            String type,
            String description,
            Severity severity,
            VerificationStatus status,
            List<SourceRef> sources
    ) {}

    public record OperativeSummary(
            List<KeyFinding> keyFindings,
            List<RiskFinding> risks
    ) {}
}
