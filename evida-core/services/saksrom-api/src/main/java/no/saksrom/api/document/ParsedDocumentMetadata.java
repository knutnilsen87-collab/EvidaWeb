package no.saksrom.api.document;

import java.util.UUID;

/**
 * Lightweight document metadata resolved by the parser before page processing starts,
 * so the worker knows pages_total and can compute the first missing page up front.
 */
public record ParsedDocumentMetadata(
        UUID documentId,
        int pageCount,
        String parserName
) {
    public ParsedDocumentMetadata {
        if (pageCount < 1) {
            throw new IllegalArgumentException("pageCount must be >= 1");
        }
    }
}
