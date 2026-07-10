package no.saksrom.api.document;

import java.awt.image.BufferedImage;

public interface OcrEngine {
    String doOcr(BufferedImage image) throws Exception;
}
