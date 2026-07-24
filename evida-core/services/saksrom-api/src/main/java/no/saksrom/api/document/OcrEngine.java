package no.saksrom.api.document;

import java.awt.image.BufferedImage;

public interface OcrEngine {
    String doOcr(BufferedImage image) throws Exception;

    default OcrResult recognize(BufferedImage image) throws Exception {
        return new OcrResult(doOcr(image), 1.0);
    }

    record OcrResult(String text, double confidence) {
        public OcrResult {
            text = text == null ? "" : text;
            confidence = Math.max(0.0, Math.min(1.0, confidence));
        }
    }
}
