package no.saksrom.api.saksrom;

import no.saksrom.api.document.DocumentSourceUnit;

import java.util.UUID;

public record SourceReference(
        UUID documentId,
        String sourceUnitId,
        Integer pageNumber,
        String quote,
        Double confidence,
        String highlightJson
) {
    public static SourceReference from(DocumentSourceUnit unit) {
        return new SourceReference(
                unit.getDocumentId(),
                unit.getSourceUnitId(),
                unit.getPageNumber(),
                unit.getTextContent(),
                unit.getExtractionConfidence(),
                unit.getBboxJson()
        );
    }
}
