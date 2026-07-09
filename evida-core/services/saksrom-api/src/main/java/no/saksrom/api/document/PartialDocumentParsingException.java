package no.saksrom.api.document;

import java.util.List;

public class PartialDocumentParsingException extends DocumentParsingException {
    private final int pagesParsed;
    private final int pagesTotal;
    private final List<Integer> ocrRuntimeMissingPages;
    private final List<Integer> textBelowThresholdPages;

    public PartialDocumentParsingException(
            String message,
            int pagesParsed,
            int pagesTotal,
            List<Integer> ocrRuntimeMissingPages
    ) {
        this(message, pagesParsed, pagesTotal, ocrRuntimeMissingPages, List.of());
    }

    public PartialDocumentParsingException(
            String message,
            int pagesParsed,
            int pagesTotal,
            List<Integer> ocrRuntimeMissingPages,
            List<Integer> textBelowThresholdPages
    ) {
        super(message);
        this.pagesParsed = Math.max(0, pagesParsed);
        this.pagesTotal = Math.max(0, pagesTotal);
        this.ocrRuntimeMissingPages = ocrRuntimeMissingPages == null ? List.of() : List.copyOf(ocrRuntimeMissingPages);
        this.textBelowThresholdPages = textBelowThresholdPages == null ? List.of() : List.copyOf(textBelowThresholdPages);
    }

    public int pagesParsed() {
        return pagesParsed;
    }

    public int pagesTotal() {
        return pagesTotal;
    }

    public List<Integer> ocrRuntimeMissingPages() {
        return ocrRuntimeMissingPages;
    }

    public List<Integer> textBelowThresholdPages() {
        return textBelowThresholdPages;
    }
}
