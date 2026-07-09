package no.saksrom.api.document;

import java.util.List;

public record PageUnit(
        int pageNumber,
        String text,
        double confidence,
        List<TextBlock> blocks,
        String extractionMethod
) {
    public PageUnit(int pageNumber, String text, double confidence, List<TextBlock> blocks) {
        this(pageNumber, text, confidence, blocks, "TEXT");
    }

    public PageUnit {
        if (pageNumber < 1) {
            throw new IllegalArgumentException("pageNumber must be >= 1");
        }
        blocks = blocks == null ? List.of() : List.copyOf(blocks);
        extractionMethod = extractionMethod == null || extractionMethod.isBlank() ? "TEXT" : extractionMethod;
    }
}
