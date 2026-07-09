package no.saksrom.api.document;

public class DocumentParsingException extends RuntimeException {
    public DocumentParsingException(String message) {
        super(message);
    }

    public DocumentParsingException(String message, Throwable cause) {
        super(message, cause);
    }
}
