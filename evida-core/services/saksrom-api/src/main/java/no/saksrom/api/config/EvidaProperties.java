package no.saksrom.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

import java.util.List;

@ConfigurationProperties(prefix = "evida")
public record EvidaProperties(
        Security security,
        Ai ai,
        Documents documents,
        Parser parser
) {
    public EvidaProperties(Security security, Ai ai, Documents documents) {
        this(security, ai, documents, new Parser());
    }

    // Two constructors on a @ConfigurationProperties record: Spring Boot must be told which one
    // binds, otherwise context startup fails with "No default constructor found".
    @ConstructorBinding
    public EvidaProperties {
        if (security == null) {
            security = Security.of(false);
        }
        if (ai == null) {
            ai = Ai.of(false);
        }
        if (documents == null) {
            documents = Documents.of(false);
        }
        if (parser == null) {
            parser = new Parser();
        }
    }

    public record Security(
            boolean localDevMode,
            List<String> allowedOrigins,
            boolean malwareScannerConfigured
    ) {
        public static Security of(boolean localDevMode) {
            return new Security(localDevMode, List.of(), false);
        }
    }
    public record Ai(boolean providerCallsEnabled) {
        public static Ai of(boolean providerCallsEnabled) {
            return new Ai(providerCallsEnabled);
        }
    }
    public record Documents(boolean rawUploadAllowed, long maxFileSizeBytes) {
        public static final long DEFAULT_MAX_FILE_SIZE_BYTES = 100L * 1024L * 1024L;

        public static Documents of(boolean rawUploadAllowed) {
            return new Documents(rawUploadAllowed, DEFAULT_MAX_FILE_SIZE_BYTES);
        }

        public Documents {
            if (maxFileSizeBytes <= 0) {
                maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES;
            }
        }
    }

    public record Parser(
            boolean ocrEnabled,
            int ocrTextThresholdChars,
            int ocrDpi,
            int ocrTimeoutSeconds,
            String tessdataPath,
            String tesseractPath,
            String ocrLanguages,
            int maxPagesPerDocument
    ) {
        public Parser() {
            this(true, 40, 300, 60, "./data/tessdata", "", "nor+eng", 20_000);
        }

        public Parser {
            if (ocrTextThresholdChars < 0) {
                ocrTextThresholdChars = 40;
            }
            if (ocrDpi <= 0) {
                ocrDpi = 300;
            }
            if (ocrTimeoutSeconds <= 0) {
                ocrTimeoutSeconds = 60;
            }
            if (tessdataPath == null || tessdataPath.isBlank()) {
                tessdataPath = "./data/tessdata";
            }
            if (tesseractPath == null) {
                tesseractPath = "";
            }
            if (ocrLanguages == null || ocrLanguages.isBlank()) {
                ocrLanguages = "nor+eng";
            }
            if (maxPagesPerDocument <= 0) {
                maxPagesPerDocument = 20_000;
            }
        }
    }
}
