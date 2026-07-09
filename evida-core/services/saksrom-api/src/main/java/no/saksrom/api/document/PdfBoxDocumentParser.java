package no.saksrom.api.document;

import jakarta.annotation.PostConstruct;
import net.sourceforge.tess4j.Tesseract;
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
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;
import java.io.IOException;
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
    private volatile boolean tessdataAvailable;

    public PdfBoxDocumentParser() {
        this(new EvidaProperties.Parser());
    }

    public PdfBoxDocumentParser(EvidaProperties properties) {
        this(properties.parser());
    }

    PdfBoxDocumentParser(EvidaProperties.Parser parserProperties) {
        this.parserProperties = parserProperties == null ? new EvidaProperties.Parser() : parserProperties;
    }

    @PostConstruct
    void validateOcrRuntime() {
        Path tessdataPath = Path.of(parserProperties.tessdataPath());
        tessdataAvailable = Files.isDirectory(tessdataPath)
                && Files.isRegularFile(tessdataPath.resolve("nor.traineddata"))
                && Files.isRegularFile(tessdataPath.resolve("eng.traineddata"));
        if (!tessdataAvailable) {
            log.warn(
                    "OCR tessdata is not fully configured at {}. Expected nor.traineddata and eng.traineddata. OCR pages will fail closed.",
                    tessdataPath.toAbsolutePath()
            );
        }

        try {
            Tesseract tesseract = newTesseract();
            tesseract.setLanguage("nor+eng");
        } catch (UnsatisfiedLinkError | RuntimeException e) {
            log.warn("Tesseract native runtime could not be initialized. OCR pages will fail closed: {}", e.toString());
            tessdataAvailable = false;
        }
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
                String text = Files.readString(filePath);
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
                    sink.accept(parsePage(pdf, stripper, renderer, pageNumber));
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

    private PageUnit parsePage(PDDocument pdf, PDFTextStripper stripper, PDFRenderer renderer, int pageNumber) throws IOException {
        String text = extractText(pdf, stripper, pageNumber);
        if (hasEnoughText(text)) {
            return pageUnit(pageNumber, text, 0.90, TEXT_METHOD);
        }

        PDPage page = pdf.getPage(pageNumber - 1);
        if (!pageContainsImages(page)) {
            throw new DocumentParsingException("PAGE_TEXT_BELOW_THRESHOLD page=" + pageNumber);
        }

        String ocrText = ocrPage(renderer, pageNumber);
        if (!hasEnoughText(ocrText)) {
            throw new DocumentParsingException("OCR_TEXT_BELOW_THRESHOLD page=" + pageNumber);
        }
        return pageUnit(pageNumber, ocrText, 0.0, OCR_METHOD);
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

    private String ocrPage(PDFRenderer renderer, int pageNumber) {
        if (!tessdataAvailable) {
            throw new DocumentParsingException("OCR_RUNTIME_UNAVAILABLE page=" + pageNumber + " tessdata=" + parserProperties.tessdataPath());
        }

        BufferedImage image = null;
        ExecutorService executor = null;
        try {
            image = renderer.renderImageWithDPI(pageNumber - 1, parserProperties.ocrDpi());
            BufferedImage ocrImage = image;
            executor = Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "evida-ocr-page-" + pageNumber);
                thread.setDaemon(true);
                return thread;
            });
            Future<String> future = executor.submit(() -> {
                Tesseract tesseract = newTesseract();
                tesseract.setLanguage("nor+eng");
                return tesseract.doOCR(ocrImage);
            });
            return normalize(future.get(parserProperties.ocrTimeoutSeconds(), TimeUnit.SECONDS));
        } catch (TimeoutException e) {
            throw new DocumentParsingException("OCR_TIMEOUT page=" + pageNumber + " seconds=" + parserProperties.ocrTimeoutSeconds(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DocumentParsingException("OCR_INTERRUPTED page=" + pageNumber, e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            throw new DocumentParsingException("OCR_FAILED page=" + pageNumber + " " + safeMessage(cause), cause);
        } catch (IOException | UnsatisfiedLinkError e) {
            throw new DocumentParsingException("OCR_FAILED page=" + pageNumber + " " + safeMessage(e), e);
        } finally {
            if (executor != null) {
                executor.shutdownNow();
            }
            if (image != null) {
                image.flush();
            }
        }
    }

    private Tesseract newTesseract() {
        Tesseract tesseract = new Tesseract();
        tesseract.setDatapath(parserProperties.tessdataPath());
        tesseract.setLanguage("nor+eng");
        return tesseract;
    }

    private String normalize(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("\r\n", "\n").replace('\r', '\n').trim();
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
