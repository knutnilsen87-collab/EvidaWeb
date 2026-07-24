package no.saksrom.api.document;

import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.ITessAPI;
import net.sourceforge.tess4j.Word;
import no.saksrom.api.config.EvidaProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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

    @Override
    public OcrResult recognize(BufferedImage image) throws Exception {
        Tesseract tesseract = newTesseract();
        List<Word> words = tesseract.getWords(image, ITessAPI.TessPageIteratorLevel.RIL_WORD);
        StringBuilder text = new StringBuilder();
        double weightedConfidence = 0;
        int characterWeight = 0;
        for (Word word : words) {
            String value = word.getText() == null ? "" : word.getText().trim();
            if (value.isEmpty()) {
                continue;
            }
            if (!text.isEmpty()) {
                text.append(' ');
            }
            text.append(value);
            int weight = Math.max(1, value.length());
            weightedConfidence += Math.max(0, Math.min(100, word.getConfidence())) * weight;
            characterWeight += weight;
        }
        double confidence = characterWeight == 0 ? 0.0 : weightedConfidence / characterWeight / 100.0;
        return new OcrResult(text.toString(), confidence);
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
