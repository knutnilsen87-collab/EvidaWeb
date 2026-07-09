package no.saksrom.api.document;

import java.nio.file.Path;

public class LocalDocumentParser implements DocumentParser {
    @Override
    public ParsedDocument parse(Document document, Path filePath) {
        throw new IllegalStateException("No production OCR/PDF parser is configured for " + filePath);
    }
}
