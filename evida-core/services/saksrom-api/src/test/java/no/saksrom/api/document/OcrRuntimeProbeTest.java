package no.saksrom.api.document;

import no.saksrom.api.config.EvidaProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OcrRuntimeProbeTest {
    @TempDir
    Path tempDir;

    @Test
    void reportsUsableRuntimeWhenExecutableAndNorEngTessdataArePresent() throws Exception {
        Path tessdata = tempDir.resolve("tessdata");
        Files.createDirectories(tessdata);
        Files.writeString(tessdata.resolve("nor.traineddata"), "fake-test-asset");
        Files.writeString(tessdata.resolve("eng.traineddata"), "fake-test-asset");
        EvidaProperties.Parser properties = new EvidaProperties.Parser(
                true,
                40,
                300,
                60,
                tessdata.toString(),
                "",
                "nor+eng",
                20_000
        );
        OcrRuntimeProbe probe = new OcrRuntimeProbe(properties, (command, timeout) -> {
            if (command.equals(List.of("where.exe", "tesseract")) || command.equals(List.of("which", "tesseract"))) {
                return new OcrRuntimeProbe.CommandResult(0, "C:\\Program Files\\Tesseract-OCR\\tesseract.exe\r\n", "");
            }
            return new OcrRuntimeProbe.CommandResult(0, "tesseract 5.5.0\r\n", "");
        });

        OcrRuntimeStatus status = probe.probe();

        assertTrue(status.enabled());
        assertTrue(status.tesseractAvailable());
        assertTrue(status.norTraineddataPresent());
        assertTrue(status.engTraineddataPresent());
        assertEquals("nor+eng", status.languages());
        assertTrue(status.usable());
        assertEquals("", status.failureReason());
    }

    @Test
    void reportsMissingNorEngTessdataWithoutRequiringNativeTesseract() throws Exception {
        Path tessdata = tempDir.resolve("tessdata");
        Files.createDirectories(tessdata);
        EvidaProperties.Parser properties = new EvidaProperties.Parser(
                true,
                40,
                300,
                60,
                tessdata.toString(),
                "",
                "nor+eng",
                20_000
        );
        OcrRuntimeProbe probe = new OcrRuntimeProbe(properties, (command, timeout) ->
                new OcrRuntimeProbe.CommandResult(0, "tesseract 5.5.0\r\n", ""));

        OcrRuntimeStatus status = probe.probe();

        assertFalse(status.norTraineddataPresent());
        assertFalse(status.engTraineddataPresent());
        assertFalse(status.usable());
        assertEquals("OCR_TESSDATA_LANGUAGE_MISSING", status.failureReason());
    }

    @Test
    void reportsDisabledOcrExplicitly() {
        EvidaProperties.Parser properties = new EvidaProperties.Parser(
                false,
                40,
                300,
                60,
                tempDir.resolve("tessdata").toString(),
                "",
                "nor+eng",
                20_000
        );
        OcrRuntimeProbe probe = new OcrRuntimeProbe(properties, (command, timeout) ->
                fail("disabled OCR must not invoke external commands"));

        OcrRuntimeStatus status = probe.probe();

        assertFalse(status.enabled());
        assertFalse(status.usable());
        assertEquals("OCR_DISABLED", status.failureReason());
    }
}
