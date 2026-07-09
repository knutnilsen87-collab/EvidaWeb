package no.saksrom.api.courtengine;

import java.util.List;

public final class OperativeSummaryValidator {
    private OperativeSummaryValidator() {}

    public static void validate(OperativeSummaryResponse summary) {
        require(summary != null, "summary is required");
        require(summary.caseMetadata() != null, "caseMetadata is required");
        requireText(summary.caseMetadata().caseId(), "caseMetadata.caseId");
        requireText(summary.caseMetadata().title(), "caseMetadata.title");
        requireText(summary.caseMetadata().type(), "caseMetadata.type");
        requireText(summary.caseMetadata().status(), "caseMetadata.status");
        requireText(summary.caseMetadata().analysisDate(), "caseMetadata.analysisDate");

        require(summary.coverage() != null, "coverage is required");
        require(summary.coverage().processedPages() >= 0, "coverage.processedPages must be non-negative");
        require(summary.coverage().totalPages() > 0, "coverage.totalPages must be positive");
        require(summary.coverage().coveragePercent() >= 0 && summary.coverage().coveragePercent() <= 100,
                "coverage.coveragePercent must be between 0 and 100");
        require(summary.coverage().integrityStatus() != null, "coverage.integrityStatus is required");
        require(summary.coverage().missingIntervals() != null, "coverage.missingIntervals is required");
        require(summary.coverage().overlaps() != null, "coverage.overlaps is required");

        require(summary.actorMatrix() != null, "actorMatrix is required");
        for (OperativeSummaryResponse.ActorCandidate actor : summary.actorMatrix()) {
            requireText(actor.name(), "actor.name");
            require(actor.roles() != null, "actor.roles is required");
            for (OperativeSummaryResponse.ActorRoleFinding role : actor.roles()) {
                requireText(role.role(), "actor.role");
                validateSourceRule(role.status(), role.sources(), "actor.roles.sources");
            }
        }

        require(summary.operativeSummary() != null, "operativeSummary is required");
        require(summary.operativeSummary().keyFindings() != null, "operativeSummary.keyFindings is required");
        for (OperativeSummaryResponse.KeyFinding finding : summary.operativeSummary().keyFindings()) {
            requireText(finding.finding(), "keyFinding.finding");
            validateSourceRule(finding.status(), finding.sources(), "keyFinding.sources");
        }

        require(summary.operativeSummary().risks() != null, "operativeSummary.risks is required");
        for (OperativeSummaryResponse.RiskFinding risk : summary.operativeSummary().risks()) {
            requireText(risk.type(), "risk.type");
            requireText(risk.description(), "risk.description");
            require(risk.severity() != null, "risk.severity is required");
            validateSourceRule(risk.status(), risk.sources(), "risk.sources");
        }
    }

    private static void validateSourceRule(
            VerificationStatus status,
            List<OperativeSummaryResponse.SourceRef> sources,
            String path
    ) {
        require(status != null, path + " status is required");
        require(sources != null, path + " is required");
        if (status != VerificationStatus.not_documented && sources.isEmpty()) {
            throw new IllegalArgumentException("Documented findings must include at least one source: " + path);
        }
        if (status == VerificationStatus.not_documented && !sources.isEmpty()) {
            throw new IllegalArgumentException("not_documented findings must not include sources: " + path);
        }
        for (OperativeSummaryResponse.SourceRef source : sources) {
            requireText(source.documentId(), path + ".documentId");
            require(source.page() > 0, path + ".page must be positive");
            requireText(source.quote(), path + ".quote");
        }
    }

    private static void requireText(String value, String path) {
        require(value != null && !value.isBlank(), path + " is required");
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
