package no.saksrom.api.document;

import java.nio.file.Path;

public interface DocumentParser {
    /**
     * Parses a document into source-unit candidates. Implementations must not report OCR success unless OCR ran.
     * Compatibility API for small documents and legacy call sites; the ingestion worker must use
     * {@link #inspect(Document, Path)} + {@link #parsePages(Document, Path, int, PageUnitSink)} instead,
     * so page units are never accumulated as a full in-memory list for large documents.
     */
    ParsedDocument parse(Document document, Path filePath);

    /**
     * Resolves total page count and parser identity before page processing starts.
     * Fails closed for parsers without streaming support.
     */
    default ParsedDocumentMetadata inspect(Document document, Path filePath) {
        throw new DocumentParsingException("PARSER_STREAMING_NOT_SUPPORTED " + getClass().getSimpleName());
    }

    /**
     * Streams page units one at a time from {@code startPage} (1-based, inclusive) through the last page.
     * The sink is invoked for each page before the next page is processed; failures must throw and abort.
     * Fails closed for parsers without streaming support.
     */
    default void parsePages(Document document, Path filePath, int startPage, PageUnitSink sink) {
        throw new DocumentParsingException("PARSER_STREAMING_NOT_SUPPORTED " + getClass().getSimpleName());
    }
}
