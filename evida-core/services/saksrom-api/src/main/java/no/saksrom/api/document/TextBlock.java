package no.saksrom.api.document;

public record TextBlock(
        String text,
        Integer charStart,
        Integer charEnd,
        String bboxJson,
        double confidence
) {}
