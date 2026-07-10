package no.saksrom.api.document;

import net.sourceforge.tess4j.Tesseract;
import no.saksrom.api.config.EvidaProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class Tess4jOcrEngine implements OcrEngine {
    private final EvidaProperties.Parser parserProperties;

    @Autowired
    public Tess4jOcrEngine(EvidaProperties properties) {
        this(properties == null ? new EvidaProperties.Parser() : properties.parser());
    }

    Tess4jOcrEngine(EvidaProperties.Parser parserProperties) {
        this.parserProperties = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
    }

    @Override
    public String doOcr(BufferedImage image) throws Exception {
        return newTesseract().doOCR(image);
    }

    Tesseract newTesseract() {
        configureNativeLibraryPath();
        Tesseract tesseract = new Tesseract();
        tesseract.setDatapath(parserProperties.tessdataPath());
        tesseract.setLanguage(parserProperties.ocrLanguages());
        return tesseract;
    }

    private void configureNativeLibraryPath() {
        String configuredPath = parserProperties.tesseractPath();
        if (configuredPath == null || configuredPath.isBlank()) {
            return;
        }
        try {
            Path path = Path.of(configuredPath);
            Path nativeDirectory = Files.isDirectory(path) ? path : path.getParent();
            if (nativeDirectory != null) {
                System.setProperty("jna.library.path", nativeDirectory.toAbsolutePath().normalize().toString());
            }
        } catch (RuntimeException ignored) {
            // The runtime probe reports path problems; OCR itself still fails closed if native load fails.
        }
    }
}
