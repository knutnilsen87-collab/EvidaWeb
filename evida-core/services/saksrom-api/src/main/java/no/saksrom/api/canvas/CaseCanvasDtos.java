package no.saksrom.api.canvas;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class CaseCanvasDtos {
    private CaseCanvasDtos() {}

    public record SourceRef(
            @NotNull UUID documentId,
            @NotBlank @Size(max = 180) String sourceUnitId,
            @NotNull @Min(1) Integer pageNumber,
            @Size(max = 240) String label
    ) {}

    public record CanvasNode(
            @NotNull UUID id,
            @NotBlank @Pattern(regexp = "FACT|CLAIM|EVIDENCE|LEGAL_RULE|RISK") String nodeType,
            @NotBlank @Size(max = 240) String title,
            @NotBlank @Size(max = 4000) String body,
            @NotBlank @Pattern(regexp = "VERIFIED|PRELIMINARY|UNSOURCED") String status,
            double x,
            double y,
            @Valid SourceRef source
    ) {}

    public record CanvasEdge(
            @NotNull UUID id,
            @NotNull UUID source,
            @NotNull UUID target,
            @NotBlank @Pattern(regexp = "SUPPORTS|CONTRADICTS|QUALIFIES|DEPENDS_ON") String relationType
    ) {}

    public record Viewport(
            double x,
            double y,
            @DecimalMin("0.2") @DecimalMax("2.0") double zoom
    ) {}

    public record CanvasPayload(
            @NotNull @Size(max = 500) List<@Valid CanvasNode> nodes,
            @NotNull @Size(max = 1000) List<@Valid CanvasEdge> edges,
            @Valid Viewport viewport
    ) {}

    public record SaveCanvasRequest(
            @Min(0) long expectedVersion,
            @NotNull @Valid CanvasPayload canvas
    ) {}

    public record CaseCanvasResponse(
            UUID caseId,
            long version,
            CanvasPayload canvas,
            OffsetDateTime updatedAt
    ) {}
}
