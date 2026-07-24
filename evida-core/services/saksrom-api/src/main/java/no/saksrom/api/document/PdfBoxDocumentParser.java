package no.saksrom.api.document;

import jakarta.annotation.PostConstruct;
import no.saksrom.api.config.EvidaProperties;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.awt.Color;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Component
public class PdfBoxDocumentParser implements DocumentParser {
    private static final Logger log = LoggerFactory.getLogger(PdfBoxDocumentParser.class);
    private static final String TEXT_METHOD = "TEXT";
    private static final String OCR_METHOD = "OCR";
    private static final String PARSER_NAME = "pdfbox-tess4j";

    private final EvidaProperties.Parser parserProperties;
    private final OcrRuntimeProbe ocrRuntimeProbe;
    private final OcrEngine ocrEngine;
    private volatile OcrRuntimeStatus ocrRuntimeStatus;

    PdfBoxDocumentParser() {
        this(new EvidaProperties.Parser());
    }

    @Autowired
    public PdfBoxDocumentParser(EvidaProperties properties, OcrRuntimeProbe ocrRuntimeProbe, OcrEngine ocrEngine) {
        this(properties == null ? new EvidaProperties.Parser() : properties.parser(), ocrRuntimeProbe, ocrEngine);
    }

    PdfBoxDocumentParser(EvidaProperties properties) {
        this(properties == null ? new EvidaProperties.Parser() : properties.parser());
    }

    PdfBoxDocumentParser(EvidaProperties.Parser parserProperties) {
        this.parserProperties = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
        this.ocrRuntimeProbe = new OcrRuntimeProbe(this.parserProperties);
        this.ocrEngine = new Tess4jOcrEngine(this.parserProperties);
        this.ocrRuntimeStatus = OcrRuntimeStatus.unprobed(this.parserProperties);
    }

    PdfBoxDocumentParser(EvidaProperties.Parser parserProperties, OcrRuntimeProbe ocrRuntimeProbe, OcrEngine ocrEngine) {
        this.parserProperties = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
        this.ocrRuntimeProbe = ocrRuntimeProbe == null ? new OcrRuntimeProbe(this.parserProperties) : ocrRuntimeProbe;
        this.ocrEngine = ocrEngine == null ? new Tess4jOcrEngine(this.parserProperties) : ocrEngine;
        this.ocrRuntimeStatus = OcrRuntimeStatus.unprobed(this.parserProperties);
    }

    @PostConstruct
    void validateOcrRuntime() {
        OcrRuntimeStatus status = ocrRuntimeProbe.probe();
        ocrRuntimeStatus = status;
        if (!status.usable()) {
            log.warn(
                    "OCR runtime is not usable. enabled={} tesseractAvailable={} tesseract={} tessdata={} languages={} reason={}. OCR pages will fail closed.",
                    status.enabled(),
                    status.tesseractAvailable(),
                    status.tesseractPath().isBlank() ? "PATH" : status.tesseractPath(),
                    status.tessdataPath(),
                    status.languages(),
                    status.safeFailureReason()
            );
            return;
        }

        log.info(
                "OCR runtime usable. tesseract={} version={} tessdata={} languages={}",
                status.tesseractPath().isBlank() ? "PATH" : status.tesseractPath(),
                status.tesseractVersion(),
                status.tessdataPath(),
                status.languages()
        );
    }

    @Override
    public ParsedDocument parse(Document document, Path filePath) {
        List<PageUnit> pages = new ArrayList<>();
        parsePages(document, filePath, 1, pages::add);
        boolean ocrPerformed = pages.stream().anyMatch(page -> OCR_METHOD.equals(page.extractionMethod()));
        return new ParsedDocument(document.getId(), pages, ocrPerformed, ocrPerformed, PARSER_NAME);
    }

    private boolean isTxt(Document document) {
        String filename = document.getFilename() == null ? "" : document.getFilename().toLowerCase(Locale.ROOT);
        return "text/plain".equalsIgnoreCase(document.getMimeType()) || filename.endsWith(".txt");
    }

    @Override
    public ParsedDocumentMetadata inspect(Document document, Path filePath) {
        if (isTxt(document)) {
            return new ParsedDocumentMetadata(document.getId(), 1, PARSER_NAME);
        }
        requirePdf(document);
        try (PDDocument pdf = openScratchBacked(filePath)) {
            return new ParsedDocumentMetadata(document.getId(), validatedPageCount(pdf), PARSER_NAME);
        } catch (InvalidPasswordException e) {
            throw new DocumentParsingException("PDF_ENCRYPTED dokumentet er kryptert", e);
        } catch (IOException e) {
            throw new DocumentParsingException("PDF_PARSE_FAILED " + safeMessage(e), e);
        }
    }

    @Override
    public void parsePages(Document document, Path filePath, int startPage, PageUnitSink sink) {
        if (isTxt(document)) {
            if (startPage < 1 || startPage > 1) {
                throw new DocumentParsingException("START_PAGE_OUT_OF_RANGE startPage=" + startPage + " pages=1");
            }
            try {
                String text = stripUtf8Bom(Files.readString(filePath, StandardCharsets.UTF_8));
                sink.accept(pageUnit(1, text, 0.90, TEXT_METHOD));
            } catch (IOException e) {
                throw new DocumentParsingException("TXT_PARSE_FAILED " + safeMessage(e), e);
            }
            return;
        }
        requirePdf(document);
        try (PDDocument pdf = openScratchBacked(filePath)) {
            int pageCount = validatedPageCount(pdf);
            if (startPage < 1 || startPage > pageCount) {
                throw new DocumentParsingException("START_PAGE_OUT_OF_RANGE startPage=" + startPage + " pages=" + pageCount);
            }

            PDFTextStripper stripper = new PDFTextStripper();
            PDFRenderer renderer = new PDFRenderer(pdf);
            List<Integer> ocrRuntimeMissingPages = new ArrayList<>();
            List<Integer> textBelowThresholdPages = new ArrayList<>();
            int emittedPages = 0;
            for (int pageNumber = startPage; pageNumber <= pageCount; pageNumber++) {
                try {
                    sink.accept(parsePage(pdf, stripper, renderer, pageNumber, pageCount > 1));
                    emittedPages++;
                } catch (DocumentParsingException e) {
                    if (isOcrRuntimeUnavailable(e)) {
                        ocrRuntimeMissingPages.add(pageNumber);
                        continue;
                    }
                    if (isPageTextBelowThreshold(e)) {
                        textBelowThresholdPages.add(pageNumber);
                        continue;
                    }
                    if (!ocrRuntimeMissingPages.isEmpty() || !textBelowThresholdPages.isEmpty()) {
                        throw partialException(emittedPages, pageCount, ocrRuntimeMissingPages, textBelowThresholdPages);
                    } else {
                        throw e;
                    }
                }
            }
            if (!ocrRuntimeMissingPages.isEmpty() || !textBelowThresholdPages.isEmpty()) {
                if (emittedPages == 0 && ocrRuntimeMissingPages.isEmpty()) {
                    throw new DocumentParsingException("PAGE_TEXT_BELOW_THRESHOLD pages=" + pageRanges(textBelowThresholdPages));
                }
                throw partialException(emittedPages, pageCount, ocrRuntimeMissingPages, textBelowThresholdPages);
            }
        } catch (InvalidPasswordException e) {
            throw new DocumentParsingException("PDF_ENCRYPTED dokumentet er kryptert", e);
        } catch (IOException e) {
            throw new DocumentParsingException("PDF_PARSE_FAILED " + safeMessage(e), e);
        }
    }

    private PageUnit parsePage(PDDocument pdf, PDFTextStripper stripper, PDFRenderer renderer, int pageNumber, boolean allowBlankPage) throws IOException {
        String text = extractText(pdf, stripper, pageNumber);
        if (hasEnoughText(text)) {
            return pageUnit(pageNumber, text, 0.90, TEXT_METHOD);
        }

        PDPage page = pdf.getPage(pageNumber - 1);
        if (!pageContainsImages(page)) {
            if (allowBlankPage && (text == null || text.isBlank())) {
                return pageUnit(pageNumber, "Blank side uten lesbart kildeinnhold.", 1.0, "BLANK");
            }
            throw new DocumentParsingException("PAGE_TEXT_BELOW_THRESHOLD page=" + pageNumber);
        }

        OcrAttempt ocr = ocrPage(renderer, pageNumber);
        if (!hasEnoughText(ocr.text())) {
            throw new DocumentParsingException("OCR_TEXT_BELOW_THRESHOLD page=" + pageNumber);
        }
        if (ocr.confidence() < parserProperties.ocrMinConfidence()) {
            throw new DocumentParsingException(
                    "OCR_CONFIDENCE_BELOW_THRESHOLD page=" + pageNumber
                            + " confidence=" + String.format(Locale.ROOT, "%.3f", ocr.confidence())
                            + " minimum=" + String.format(Locale.ROOT, "%.3f", parserProperties.ocrMinConfidence())
            );
        }
        return pageUnit(
                pageNumber,
                ocr.text(),
                ocr.confidence(),
                ocr.enhancedRetry() ? "OCR_RETRY_ENHANCED" : OCR_METHOD
        );
    }

    private void requirePdf(Document document) {
        String filename = document.getFilename() == null ? "" : document.getFilename().toLowerCase(Locale.ROOT);
        if (!"application/pdf".equalsIgnoreCase(document.getMimeType()) && !filename.endsWith(".pdf")) {
            throw new IllegalArgumentException("UNSUPPORTED_DOCUMENT_TYPE_FOR_INGESTION");
        }
    }

    private PDDocument openScratchBacked(Path filePath) throws IOException {
        // Raw PDF stays on disk via file-backed random access; decoded streams spill to a PDFBox
        // scratch temp file that PDFBox deletes when the document is closed.
        return Loader.loadPDF(filePath.toFile(), IOUtils.createTempFileOnlyStreamCache());
    }

    private int validatedPageCount(PDDocument pdf) {
        if (pdf.isEncrypted()) {
            throw new DocumentParsingException("PDF_ENCRYPTED dokumentet er kryptert");
        }
        int pageCount = pdf.getNumberOfPages();
        if (pageCount < 1) {
            throw new DocumentParsingException("PDF_NO_PAGES");
        }
        if (pageCount > parserProperties.maxPagesPerDocument()) {
            throw new DocumentParsingException("PDF_TOO_MANY_PAGES max=" + parserProperties.maxPagesPerDocument() + " actual=" + pageCount);
        }
        return pageCount;
    }

    private String extractText(PDDocument pdf, PDFTextStripper stripper, int pageNumber) throws IOException {
        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);
        return normalize(stripper.getText(pdf));
    }

    private boolean hasEnoughText(String text) {
        return text != null && text.replaceAll("\\s+", "").length() >= parserProperties.ocrTextThresholdChars();
    }

    private PageUnit pageUnit(int pageNumber, String text, double confidence, String extractionMethod) {
        String normalized = normalize(text);
        return new PageUnit(pageNumber, normalized, confidence, List.of(
                new TextBlock(normalized, 0, normalized.length(), null, confidence)
        ), extractionMethod);
    }

    private boolean pageContainsImages(PDPage page) throws IOException {
        return resourcesContainImages(page.getResources(), new HashSet<>());
    }

    private boolean resourcesContainImages(PDResources resources, Set<COSName> visited) throws IOException {
        if (resources == null) {
            return false;
        }
        for (COSName name : resources.getXObjectNames()) {
            if (!visited.add(name)) {
                continue;
            }
            PDXObject xObject = resources.getXObject(name);
            if (xObject instanceof PDImageXObject) {
                return true;
            }
            if (xObject instanceof PDFormXObject form && resourcesContainImages(form.getResources(), visited)) {
                return true;
            }
        }
        return false;
    }

    private OcrAttempt ocrPage(PDFRenderer renderer, int pageNumber) {
        OcrRuntimeStatus status = ocrRuntimeStatus;
        if (status == null || !status.usable()) {
            String reason = status == null ? "OCR_RUNTIME_NOT_PROBED" : status.safeFailureReason();
            String tessdataPath = status == null ? parserProperties.tessdataPath() : status.tessdataPath();
            throw new DocumentParsingException("OCR_RUNTIME_UNAVAILABLE page=" + pageNumber
                    + " reason=" + reason
                    + " tessdata=" + tessdataPath);
        }

        BufferedImage image = null;
        BufferedImage retryImage = null;
        try {
            image = renderer.renderImageWithDPI(pageNumber - 1, parserProperties.ocrDpi());
            OcrEngine.OcrResult first = recognizeWithTimeout(image, pageNumber, "initial");
            OcrAttempt best = new OcrAttempt(normalize(first.text()), first.confidence(), false);
            boolean retryRequired = parserProperties.ocrEnhancementEnabled()
                    && (!hasEnoughText(best.text()) || best.confidence() < parserProperties.ocrMinConfidence());
            if (!retryRequired) {
                return best;
            }

            BufferedImage renderedRetry = renderer.renderImageWithDPI(pageNumber - 1, parserProperties.ocrRetryDpi());
            retryImage = enhanceForOcr(renderedRetry);
            if (retryImage != renderedRetry) {
                renderedRetry.flush();
            }
            OcrEngine.OcrResult retry = recognizeWithTimeout(retryImage, pageNumber, "enhanced_retry");
            OcrAttempt retried = new OcrAttempt(normalize(retry.text()), retry.confidence(), true);
            if (retried.confidence() > best.confidence()
                    || (!hasEnoughText(best.text()) && hasEnoughText(retried.text()))) {
                return retried;
            }
            return best;
        } catch (TimeoutException e) {
            throw new DocumentParsingException("OCR_TIMEOUT page=" + pageNumber + " seconds=" + parserProperties.ocrTimeoutSeconds(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DocumentParsingException("OCR_INTERRUPTED page=" + pageNumber, e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            throw new DocumentParsingException("OCR_FAILED page=" + pageNumber + " " + safeMessage(cause), cause);
        } catch (IOException | UnsatisfiedLinkError | RuntimeException e) {
            throw new DocumentParsingException("OCR_FAILED page=" + pageNumber + " " + safeMessage(e), e);
        } finally {
            if (image != null) {
                image.flush();
            }
            if (retryImage != null) {
                retryImage.flush();
            }
        }
    }

    private OcrEngine.OcrResult recognizeWithTimeout(
            BufferedImage image,
            int pageNumber,
            String attempt
    ) throws TimeoutException, InterruptedException, ExecutionException {
        ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "evida-ocr-page-" + pageNumber + "-" + attempt);
            thread.setDaemon(true);
            return thread;
        });
        try {
            Future<OcrEngine.OcrResult> future = executor.submit(() -> ocrEngine.recognize(image));
            return future.get(parserProperties.ocrTimeoutSeconds(), TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
    }

    private BufferedImage enhanceForOcr(BufferedImage source) {
        BufferedImage enhanced = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                Color color = new Color(source.getRGB(x, y));
                int gray = (int) Math.round(0.299 * color.getRed() + 0.587 * color.getGreen() + 0.114 * color.getBlue());
                int contrasted = gray < 180 ? Math.max(0, gray - 35) : Math.min(255, gray + 35);
                int rgb = (contrasted << 16) | (contrasted << 8) | contrasted;
                enhanced.setRGB(x, y, rgb);
            }
        }
        return enhanced;
    }

    private record OcrAttempt(String text, double confidence, boolean enhancedRetry) {}

    private String normalize(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private String stripUtf8Bom(String text) {
        if (text != null && !text.isEmpty() && text.charAt(0) == '\uFEFF') {
            return text.substring(1);
        }
        return text;
    }

    private boolean isOcrRuntimeUnavailable(DocumentParsingException e) {
        String message = e.getMessage();
        return message != null && message.contains("OCR_RUNTIME_UNAVAILABLE");
    }

    private boolean isPageTextBelowThreshold(DocumentParsingException e) {
        String message = e.getMessage();
        return message != null && message.contains("PAGE_TEXT_BELOW_THRESHOLD");
    }

    private PartialDocumentParsingException partialException(
            int emittedPages,
            int pageCount,
            List<Integer> ocrRuntimeMissingPages,
            List<Integer> textBelowThresholdPages
    ) {
        String message = "PARTIAL_OCR_RUNTIME_MISSING pages=" + pageRanges(ocrRuntimeMissingPages)
                + " text_below_threshold=" + pageRanges(textBelowThresholdPages)
                + " parsed_pages=" + emittedPages + "/" + pageCount;
        return new PartialDocumentParsingException(
                message,
                emittedPages,
                pageCount,
                ocrRuntimeMissingPages,
                textBelowThresholdPages
        );
    }

    private String pageRanges(List<Integer> pageNumbers) {
        if (pageNumbers == null || pageNumbers.isEmpty()) {
            return "";
        }
        List<Integer> sorted = pageNumbers.stream().sorted().toList();
        List<String> ranges = new ArrayList<>();
        int start = sorted.getFirst();
        int previous = start;
        for (int index = 1; index < sorted.size(); index++) {
            int current = sorted.get(index);
            if (current == previous + 1) {
                previous = current;
                continue;
            }
            ranges.add(start == previous ? String.valueOf(start) : start + "-" + previous);
            start = current;
            previous = current;
        }
        ranges.add(start == previous ? String.valueOf(start) : start + "-" + previous);
        return String.join(",", ranges);
    }

    private String safeMessage(Throwable throwable) {
        return throwable.getMessage() == null ? throwable.getClass().getSimpleName() : throwable.getMessage();
    }
}
