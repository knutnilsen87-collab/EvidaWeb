package no.saksrom.api.document;

import no.saksrom.api.config.EvidaProperties;

public record OcrRuntimeStatus(
        boolean enabled,
        boolean tesseractAvailable,
        String tesseractPath,
        String tesseractVersion,
        String tessdataPath,
        boolean norTraineddataPresent,
        boolean engTraineddataPresent,
        String languages,
        boolean usable,
        String failureReason
) {
    public static OcrRuntimeStatus unprobed(EvidaProperties.Parser parserProperties) {
        EvidaProperties.Parser parser = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
        return new OcrRuntimeStatus(
                parser.ocrEnabled(),
                false,
                normalized(parser.tesseractPath()),
                "",
                normalized(parser.tessdataPath()),
                false,
                false,
                normalized(parser.ocrLanguages()),
                false,
                "OCR_RUNTIME_NOT_PROBED"
        );
    }

    public String safeFailureReason() {
        return failureReason == null || failureReason.isBlank() ? "OCR_RUNTIME_UNAVAILABLE" : failureReason;
    }

    private static String normalized(String value) {
        return value == null ? "" : value.trim();
    }
}
