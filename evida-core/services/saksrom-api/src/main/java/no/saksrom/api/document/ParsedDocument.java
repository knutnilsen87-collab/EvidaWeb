package no.saksrom.api.document;

import java.util.List;
import java.util.UUID;

public record ParsedDocument(
        UUID documentId,
        List<PageUnit> pages,
        boolean ocrRequired,
        boolean ocrPerformed,
        String parserName
) {
    public ParsedDocument {
        pages = pages == null ? List.of() : List.copyOf(pages);
    }
}
