package no.saksrom.api.document;

import no.saksrom.api.config.EvidaProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Component
public class OcrRuntimeProbe {
    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(5);

    private final EvidaProperties.Parser parserProperties;
    private final CommandRunner commandRunner;

    @Autowired
    public OcrRuntimeProbe(EvidaProperties properties) {
        this(properties == null ? new EvidaProperties.Parser() : properties.parser());
    }

    OcrRuntimeProbe(EvidaProperties.Parser parserProperties) {
        this(parserProperties, new ProcessCommandRunner());
    }

    OcrRuntimeProbe(EvidaProperties.Parser parserProperties, CommandRunner commandRunner) {
        this.parserProperties = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
        this.commandRunner = commandRunner == null ? new ProcessCommandRunner() : commandRunner;
    }

    public OcrRuntimeStatus probe() {
        String languages = parserProperties.ocrLanguages();
        Path tessdataPath = Path.of(parserProperties.tessdataPath()).toAbsolutePath().normalize();
        boolean norPresent = Files.isRegularFile(tessdataPath.resolve("nor.traineddata"));
        boolean engPresent = Files.isRegularFile(tessdataPath.resolve("eng.traineddata"));

        if (!parserProperties.ocrEnabled()) {
            return status(false, false, "", "", tessdataPath, norPresent, engPresent, languages, false, "OCR_DISABLED");
        }

        String tesseractPath = resolveTesseractPath();
        CommandResult version = tesseractPath.isBlank()
                ? commandRunner.run(List.of("tesseract", "--version"), COMMAND_TIMEOUT)
                : commandRunner.run(List.of(tesseractPath, "--version"), COMMAND_TIMEOUT);
        boolean tesseractAvailable = version.exitCode() == 0;
        String tesseractVersion = firstLine(version.stdout().isBlank() ? version.stderr() : version.stdout());

        String failureReason = "";
        if (!Files.isDirectory(tessdataPath)) {
            failureReason = "OCR_TESSDATA_DIR_MISSING";
        } else if (!norPresent || !engPresent) {
            failureReason = "OCR_TESSDATA_LANGUAGE_MISSING";
        } else if (!tesseractAvailable) {
            failureReason = "OCR_TESSERACT_UNAVAILABLE";
        }

        boolean usable = failureReason.isBlank();
        return status(true, tesseractAvailable, tesseractPath, tesseractVersion, tessdataPath,
                norPresent, engPresent, languages, usable, failureReason);
    }

    private OcrRuntimeStatus status(
            boolean enabled,
            boolean tesseractAvailable,
            String tesseractPath,
            String tesseractVersion,
            Path tessdataPath,
            boolean norPresent,
            boolean engPresent,
            String languages,
            boolean usable,
            String failureReason
    ) {
        return new OcrRuntimeStatus(
                enabled,
                tesseractAvailable,
                tesseractPath == null ? "" : tesseractPath,
                tesseractVersion == null ? "" : tesseractVersion,
                tessdataPath.toString(),
                norPresent,
                engPresent,
                languages == null ? "" : languages,
                usable,
                failureReason == null ? "" : failureReason
        );
    }

    private String resolveTesseractPath() {
        String configured = parserProperties.tesseractPath();
        if (configured != null && !configured.isBlank()) {
            Path configuredPath = Path.of(configured).toAbsolutePath().normalize();
            return configuredPath.toString();
        }

        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        CommandResult lookup = commandRunner.run(
                windows ? List.of("where.exe", "tesseract") : List.of("which", "tesseract"),
                COMMAND_TIMEOUT
        );
        if (lookup.exitCode() != 0) {
            if (windows) {
                Path standardWindowsInstall = Path.of("C:\\Program Files\\Tesseract-OCR\\tesseract.exe");
                if (Files.isRegularFile(standardWindowsInstall)) {
                    return standardWindowsInstall.toString();
                }
            }
            return "";
        }
        return firstLine(lookup.stdout());
    }

    private String firstLine(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.lines().findFirst().orElse("").trim();
    }

    interface CommandRunner {
        CommandResult run(List<String> command, Duration timeout);
    }

    record CommandResult(int exitCode, String stdout, String stderr) {
    }

    private static final class ProcessCommandRunner implements CommandRunner {
        @Override
        public CommandResult run(List<String> command, Duration timeout) {
            try {
                Process process = new ProcessBuilder(command).start();
                boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    return new CommandResult(124, "", "timeout");
                }
                String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
                return new CommandResult(process.exitValue(), stdout, stderr);
            } catch (IOException e) {
                return new CommandResult(127, "", e.getClass().getSimpleName());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new CommandResult(130, "", "interrupted");
            }
        }
    }
}
