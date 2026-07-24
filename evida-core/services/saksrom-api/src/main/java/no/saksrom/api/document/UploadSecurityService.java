package no.saksrom.api.document;

import no.saksrom.api.config.EvidaProperties;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.tika.Tika;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.CharBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class UploadSecurityService {
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("pdf", "txt");
    private static final Map<String, String> EXPECTED_MIME_BY_EXTENSION = Map.of(
            "pdf", "application/pdf",
            "txt", "text/plain"
    );
    private static final int TEXT_BUFFER_SIZE = 8192;

    private final EvidaProperties properties;
    private final Tika tika = new Tika();

    public UploadSecurityService(EvidaProperties properties) {
        this.properties = properties;
    }

    public void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            reject("UPLOAD_REJECTED_EMPTY_FILE", HttpStatus.BAD_REQUEST);
        }
        if (file.getSize() > properties.documents().maxFileSizeBytes()) {
            reject("UPLOAD_REJECTED_FILE_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE);
        }

        String extension = extension(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            reject("UPLOAD_REJECTED_EXTENSION", HttpStatus.BAD_REQUEST);
        }

        String expectedMime = EXPECTED_MIME_BY_EXTENSION.get(extension);
        String declaredMime = normalizeMime(file.getContentType());
        if (!expectedMime.equals(declaredMime)) {
            reject("UPLOAD_REJECTED_DECLARED_MIME_MISMATCH", HttpStatus.BAD_REQUEST);
        }

        String actualMime = detectedMime(file);
        if (!expectedMime.equals(actualMime)) {
            reject("UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH", HttpStatus.BAD_REQUEST);
        }

        if ("pdf".equals(extension)) {
            validatePdf(file);
        } else {
            validateText(file);
        }
    }

    public String safeMessage(String code) {
        return switch (code) {
            case "UPLOAD_REJECTED_EMPTY_FILE" -> "Filen er tom.";
            case "UPLOAD_REJECTED_FILE_TOO_LARGE" -> "Filen er større enn tillatt grense.";
            case "UPLOAD_REJECTED_EXTENSION" -> "Filtypen støttes ikke. Pilotopplasting støtter kun PDF og TXT.";
            case "UPLOAD_REJECTED_DECLARED_MIME_MISMATCH" -> "Filens deklarerte type stemmer ikke med filendelsen.";
            case "UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH" -> "Filens innhold stemmer ikke med filtypekontrakten.";
            case "UPLOAD_REJECTED_INVALID_PDF" -> "PDF-filen er ikke en gyldig, lesbar PDF.";
            case "UPLOAD_REJECTED_ENCRYPTED_PDF" -> "Passordbeskyttede PDF-filer støttes ikke i pilotopplasting.";
            case "UPLOAD_REJECTED_INVALID_TEXT" -> "TXT-filen må være gyldig UTF-8 tekst uten binært innhold.";
            case "MALWARE_DETECTED" -> "Filen ble avvist av malware-kontroll.";
            case "MALWARE_SCAN_UNAVAILABLE" -> "Malware-kontroll er ikke tilgjengelig. Opplasting er midlertidig stengt.";
            case "MALWARE_SCAN_FAILED" -> "Malware-kontroll feilet. Opplasting er midlertidig stengt.";
            default -> "Opplasting feilet: sikkerhetskontroll avviste forespørselen.";
        };
    }

    private String detectedMime(MultipartFile file) {
        try (InputStream input = file.getInputStream()) {
            return normalizeMime(tika.detect(input));
        } catch (Exception e) {
            reject("UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH", HttpStatus.BAD_REQUEST);
            return "application/octet-stream";
        }
    }

    private void validatePdf(MultipartFile file) {
        Path tempFile = null;
        try {
            tempFile = Files.createTempFile("evida-upload-validation-", ".pdf");
            try (InputStream input = file.getInputStream()) {
                Files.copy(input, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }
            try (PDDocument document = Loader.loadPDF(tempFile.toFile(), IOUtils.createTempFileOnlyStreamCache())) {
                if (document.isEncrypted()) {
                    reject("UPLOAD_REJECTED_ENCRYPTED_PDF", HttpStatus.BAD_REQUEST);
                }
                if (document.getNumberOfPages() < 1) {
                    reject("UPLOAD_REJECTED_INVALID_PDF", HttpStatus.BAD_REQUEST);
                }
            }
        } catch (UploadSecurityException e) {
            throw e;
        } catch (Exception e) {
            reject("UPLOAD_REJECTED_INVALID_PDF", HttpStatus.BAD_REQUEST);
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (Exception ignored) {
                    // Best-effort cleanup for a validation scratch file.
                }
            }
        }
    }

    private void validateText(MultipartFile file) {
        var decoder = StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        char[] buffer = new char[TEXT_BUFFER_SIZE];
        try (InputStreamReader reader = new InputStreamReader(file.getInputStream(), decoder)) {
            int read;
            while ((read = reader.read(buffer)) != -1) {
                CharBuffer chars = CharBuffer.wrap(buffer, 0, read);
                while (chars.hasRemaining()) {
                    char c = chars.get();
                    if (c == '\u0000') {
                        reject("UPLOAD_REJECTED_INVALID_TEXT", HttpStatus.BAD_REQUEST);
                    }
                }
            }
        } catch (UploadSecurityException e) {
            throw e;
        } catch (Exception e) {
            reject("UPLOAD_REJECTED_INVALID_TEXT", HttpStatus.BAD_REQUEST);
        }
    }

    private String extension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "";
        }
        String suffix = filename.substring(filename.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
        return suffix.contains("/") || suffix.contains("\\") ? "" : suffix;
    }

    private String normalizeMime(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    }

    private void reject(String code, HttpStatus httpStatus) {
        throw new UploadSecurityException(code, httpStatus);
    }
}
