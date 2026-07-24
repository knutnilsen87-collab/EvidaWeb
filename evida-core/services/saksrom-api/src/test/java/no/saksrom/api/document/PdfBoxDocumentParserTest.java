package no.saksrom.api.document;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import no.saksrom.api.config.EvidaProperties;

import static org.junit.jupiter.api.Assertions.*;

class PdfBoxDocumentParserTest {
    @TempDir
    Path tempDir;

    @Test
    void extractsTextFromFivePageTextBasedPdf() throws Exception {
        Path pdf = tempDir.resolve("text.pdf");
        try (PDDocument document = new PDDocument()) {
            for (int pageNumber = 1; pageNumber <= 5; pageNumber++) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(72, 720);
                    content.showText("Strafferettslig kildegrunnlag med tilstrekkelig tekst side " + pageNumber);
                    content.endText();
                }
            }
            document.save(pdf.toFile());
        }

        ParsedDocument parsed = new PdfBoxDocumentParser().parse(document("text.pdf"), pdf);

        assertFalse(parsed.ocrRequired());
        assertFalse(parsed.ocrPerformed());
        assertEquals("pdfbox-tess4j", parsed.parserName());
        assertEquals(5, parsed.pages().size());
        assertTrue(parsed.pages().get(0).text().contains("Strafferettslig kildegrunnlag"));
        assertEquals("TEXT", parsed.pages().get(0).extractionMethod());
        assertEquals(1, parsed.pages().get(0).blocks().size());
    }

    @Test
    void blankPdfFailsClosedInsteadOfCreatingEmptyPageUnit() throws Exception {
        Path pdf = tempDir.resolve("blank.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.save(pdf.toFile());
        }

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> new PdfBoxDocumentParser().parse(document("blank.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PAGE_TEXT_BELOW_THRESHOLD"));
    }

    @Test
    void blankPageInsideMultipagePdfIsAccountedAsBlankPageUnit() throws Exception {
        Path pdf = tempDir.resolve("one-blank-page.pdf");
        try (PDDocument document = new PDDocument()) {
            addTextPage(document, "Side en har nok juridisk tekst til parserterskelen.");
            document.addPage(new PDPage());
            document.save(pdf.toFile());
        }

        ParsedDocument parsed = new PdfBoxDocumentParser().parse(document("one-blank-page.pdf"), pdf);

        assertEquals(2, parsed.pages().size());
        assertEquals("TEXT", parsed.pages().get(0).extractionMethod());
        assertEquals("BLANK", parsed.pages().get(1).extractionMethod());
        assertEquals("Blank side uten lesbart kildeinnhold.", parsed.pages().get(1).text());
    }

    @Test
    void imagePdfWithoutTessdataFailsClosedOnOcrPath() throws Exception {
        Path pdf = tempDir.resolve("image.pdf");
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            BufferedImage image = new BufferedImage(400, 160, BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = image.createGraphics();
            try {
                graphics.setColor(Color.WHITE);
                graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
                graphics.setColor(Color.BLACK);
                graphics.drawString("Skannet tekst", 40, 80);
            } finally {
                graphics.dispose();
            }
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.drawImage(JPEGFactory.createFromImage(document, image), 72, 600, 240, 96);
            } finally {
                image.flush();
            }
            document.save(pdf.toFile());
        }

        var parser = new PdfBoxDocumentParser(new EvidaProperties.Parser(
                true,
                40,
                72,
                5,
                tempDir.resolve("missing-tessdata").toString(),
                "",
                "nor+eng",
                20_000
        ));
        parser.validateOcrRuntime();

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> parser.parse(document("image.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PARTIAL_OCR_RUNTIME_MISSING") || error.getMessage().contains("OCR_FAILED"));
    }

    @Test
    void imagePdfCreatesOcrPageUnitWhenRuntimeProbeIsUsable() throws Exception {
        Path pdf = imageOnlyPdf("image-ocr.pdf", "Skannet tekst");
        EvidaProperties.Parser properties = ocrTestProperties();
        PdfBoxDocumentParser parser = parserWithOcr(
                properties,
                image -> "OCR tekst fra skannet juridisk dokument med nok innhold"
        );
        parser.validateOcrRuntime();

        ParsedDocument parsed = parser.parse(document("image-ocr.pdf"), pdf);

        assertTrue(parsed.ocrRequired());
        assertTrue(parsed.ocrPerformed());
        assertEquals(1, parsed.pages().size());
        assertEquals("OCR", parsed.pages().getFirst().extractionMethod());
        assertTrue(parsed.pages().getFirst().text().contains("OCR tekst fra skannet"));
    }

    @Test
    void imagePdfWithEmptyOcrOutputFailsClosedWithoutPageUnit() throws Exception {
        Path pdf = imageOnlyPdf("empty-ocr.pdf", "Skannet tekst");
        EvidaProperties.Parser properties = ocrTestProperties();
        PdfBoxDocumentParser parser = parserWithOcr(properties, image -> "   ");
        parser.validateOcrRuntime();

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> parser.parse(document("empty-ocr.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("OCR_TEXT_BELOW_THRESHOLD"));
    }

    @Test
    void lowConfidenceOcrRetriesWithEnhancementAndStoresRetryConfidence() throws Exception {
        Path pdf = imageOnlyPdf("low-confidence-retry.pdf", "Skannet tekst");
        EvidaProperties.Parser properties = new EvidaProperties.Parser(
                true,
                40,
                72,
                5,
                tempDir.resolve("tessdata").toString(),
                "",
                "nor+eng",
                20_000,
                144,
                0.70,
                true
        );
        java.util.concurrent.atomic.AtomicInteger attempts = new java.util.concurrent.atomic.AtomicInteger();
        OcrEngine engine = new OcrEngine() {
            @Override
            public String doOcr(java.awt.image.BufferedImage image) {
                return "";
            }

            @Override
            public OcrResult recognize(java.awt.image.BufferedImage image) {
                if (attempts.incrementAndGet() == 1) {
                    return new OcrResult("svak tekst fra første forsøk med nok tegn til validering", 0.31);
                }
                return new OcrResult("forbedret juridisk OCR tekst med tilstrekkelig sikkerhet", 0.88);
            }
        };
        PdfBoxDocumentParser parser = parserWithOcr(properties, engine);
        parser.validateOcrRuntime();

        ParsedDocument parsed = parser.parse(document("low-confidence-retry.pdf"), pdf);

        assertEquals(2, attempts.get());
        assertEquals("OCR_RETRY_ENHANCED", parsed.pages().getFirst().extractionMethod());
        assertEquals(0.88, parsed.pages().getFirst().confidence(), 0.001);
    }

    @Test
    void ocrBelowConfidenceAfterRetryFailsClosed() throws Exception {
        Path pdf = imageOnlyPdf("low-confidence-fail.pdf", "Skannet tekst");
        EvidaProperties.Parser properties = new EvidaProperties.Parser(
                true, 40, 72, 5, tempDir.resolve("tessdata").toString(), "", "nor+eng",
                20_000, 144, 0.75, true
        );
        OcrEngine engine = new OcrEngine() {
            @Override
            public String doOcr(java.awt.image.BufferedImage image) {
                return "";
            }

            @Override
            public OcrResult recognize(java.awt.image.BufferedImage image) {
                return new OcrResult("lang nok OCR tekst men fortsatt utilstrekkelig confidence", 0.42);
            }
        };
        PdfBoxDocumentParser parser = parserWithOcr(properties, engine);
        parser.validateOcrRuntime();

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> parser.parse(document("low-confidence-fail.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("OCR_CONFIDENCE_BELOW_THRESHOLD"));
    }

    @Test
    void mixedPdfWithUsableOcrRuntimeEmitsOcrAndTextPageUnits() throws Exception {
        Path pdf = mixedFiveScannedSeventyThreeTextPdf("mixed-ocr-available.pdf");
        EvidaProperties.Parser properties = ocrTestProperties();
        PdfBoxDocumentParser parser = parserWithOcr(
                properties,
                image -> "OCR tekst fra skannet juridisk side med tilstrekkelig innhold"
        );
        parser.validateOcrRuntime();

        ParsedDocument parsed = parser.parse(document("mixed-ocr-available.pdf"), pdf);

        assertEquals(78, parsed.pages().size());
        assertTrue(parsed.ocrRequired());
        assertTrue(parsed.ocrPerformed());
        assertEquals("OCR", parsed.pages().getFirst().extractionMethod());
        assertEquals("TEXT", parsed.pages().get(5).extractionMethod());
        assertTrue(parsed.pages().stream().anyMatch(page -> page.pageNumber() == 10 && "TEXT".equals(page.extractionMethod())));
    }

    @Test
    void realConfiguredOcrRuntimeCreatesPageUnitWhenEnvPresent() throws Exception {
        Path pdf = highContrastImagePdf("real-ocr.pdf");
        EvidaProperties.Parser properties = realOcrProperties(8);
        PdfBoxDocumentParser parser = new PdfBoxDocumentParser(properties);
        parser.validateOcrRuntime();

        ParsedDocument parsed = parser.parse(document("real-ocr.pdf"), pdf);

        assertEquals(1, parsed.pages().size());
        assertEquals("OCR", parsed.pages().getFirst().extractionMethod());
        assertTrue(parsed.pages().getFirst().text().replaceAll("\\s+", "").length() >= 8);
    }

    @Test
    void mixedPdfWithoutOcrRuntimeStillEmitsTextLayerPagesAndReportsMissingOcrPages() throws Exception {
        Path pdf = mixedFiveScannedSeventyThreeTextPdf("mixed-78.pdf");
        var parser = new PdfBoxDocumentParser();
        List<PageUnit> emittedPages = new java.util.ArrayList<>();

        PartialDocumentParsingException warning = assertThrows(
                PartialDocumentParsingException.class,
                () -> parser.parsePages(document("mixed-78.pdf"), pdf, 1, emittedPages::add)
        );

        assertEquals(73, emittedPages.size());
        assertEquals(6, emittedPages.getFirst().pageNumber());
        assertEquals(78, emittedPages.getLast().pageNumber());
        assertTrue(emittedPages.stream().allMatch(page -> "TEXT".equals(page.extractionMethod())));
        assertEquals(List.of(1, 2, 3, 4, 5), warning.ocrRuntimeMissingPages());
        assertEquals(73, warning.pagesParsed());
        assertEquals(78, warning.pagesTotal());
        assertTrue(warning.getMessage().contains("PARTIAL_OCR_RUNTIME_MISSING"));
        assertTrue(warning.getMessage().contains("pages=1-5"));
    }

    @Test
    void masterdocFixtureWithoutOcrRuntimeKeepsLaterTextLayerPagesAvailable() {
        Path pdf = Path.of("..", "..", "..", "testpakker", "Masterdoc_001_Kompleks_Saksbehandling.pdf");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(pdf), "Manual Masterdoc fixture is not committed");
        var parser = new PdfBoxDocumentParser();
        List<PageUnit> emittedPages = new java.util.ArrayList<>();

        PartialDocumentParsingException warning = assertThrows(
                PartialDocumentParsingException.class,
                () -> parser.parsePages(document("Masterdoc_001_Kompleks_Saksbehandling.pdf"), pdf, 1, emittedPages::add)
        );

        assertEquals(73, emittedPages.size());
        assertEquals(List.of(1, 2, 3, 4, 5), warning.ocrRuntimeMissingPages());
        assertEquals(List.of(), warning.textBelowThresholdPages());
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 10 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 50 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 60 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().noneMatch(page -> page.pageNumber() <= 5));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 75 && "BLANK".equals(page.extractionMethod())));
    }

    @Test
    void masterdocFixtureWithRealOcrRuntimeCreatesOcrAndTextPagesWhenEnvPresent() {
        Path pdf = Path.of("..", "..", "..", "testpakker", "Masterdoc_001_Kompleks_Saksbehandling.pdf");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(pdf), "Manual Masterdoc fixture is not committed");
        EvidaProperties.Parser properties = realOcrProperties(40);
        PdfBoxDocumentParser parser = new PdfBoxDocumentParser(properties);
        parser.validateOcrRuntime();
        List<PageUnit> emittedPages = new java.util.ArrayList<>();
        PartialDocumentParsingException warning = null;

        try {
            parser.parsePages(document("Masterdoc_001_Kompleks_Saksbehandling.pdf"), pdf, 1, emittedPages::add);
        } catch (PartialDocumentParsingException e) {
            warning = e;
        }

        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 1 && "OCR".equals(page.extractionMethod())));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 5 && "OCR".equals(page.extractionMethod())));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 10 && "TEXT".equals(page.extractionMethod())));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 50 && "TEXT".equals(page.extractionMethod())));
        if (warning != null) {
            assertTrue(warning.ocrRuntimeMissingPages().isEmpty());
        }
    }

    @Test
    void corruptPdfFailsClosed() throws Exception {
        Path pdf = tempDir.resolve("corrupt.pdf");
        Files.writeString(pdf, "%PDF-1.7\ntruncated");

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> new PdfBoxDocumentParser().parse(document("corrupt.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PDF_PARSE_FAILED"));
    }

    @Test
    void encryptedPdfFailsClosedWithPreciseMessage() throws Exception {
        Path pdf = tempDir.resolve("encrypted.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                    "owner-secret",
                    "user-secret",
                    new AccessPermission()
            );
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            document.save(pdf.toFile());
        }

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> new PdfBoxDocumentParser().parse(document("encrypted.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PDF_ENCRYPTED"));
    }

    @Test
    void parsesFiveHundredPageTextPdfFromTempFixture() throws Exception {
        Path pdf = tempDir.resolve("large-text.pdf");
        try (PDDocument document = new PDDocument()) {
            for (int pageNumber = 1; pageNumber <= 500; pageNumber++) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    content.newLineAtOffset(72, 720);
                    content.showText("Minnetest med avgrenset PDFBox parsing og nok tekst side " + pageNumber);
                    content.endText();
                }
            }
            document.save(pdf.toFile());
        }

        ParsedDocument parsed = new PdfBoxDocumentParser().parse(document("large-text.pdf"), pdf);

        assertEquals(500, parsed.pages().size());
        assertEquals("TEXT", parsed.pages().get(499).extractionMethod());
        assertTrue(parsed.pages().get(499).text().contains("side 500"));
    }

    @Test
    void inspectReportsPageCountBeforePageProcessing() throws Exception {
        Path pdf = fivePageTextPdf("inspect.pdf");

        ParsedDocumentMetadata metadata = new PdfBoxDocumentParser().inspect(document("inspect.pdf"), pdf);

        assertEquals(5, metadata.pageCount());
        assertEquals("pdfbox-tess4j", metadata.parserName());
    }

    @Test
    void inspectFailsClosedOnEncryptedPdf() throws Exception {
        Path pdf = tempDir.resolve("encrypted-inspect.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                    "owner-secret",
                    "user-secret",
                    new AccessPermission()
            );
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            document.save(pdf.toFile());
        }

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> new PdfBoxDocumentParser().inspect(document("encrypted-inspect.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PDF_ENCRYPTED"));
    }

    @Test
    void parsePagesStreamsOnePageAtATimeFromRequestedStartPage() throws Exception {
        Path pdf = fivePageTextPdf("stream.pdf");
        List<Integer> emittedPages = new java.util.ArrayList<>();

        new PdfBoxDocumentParser().parsePages(document("stream.pdf"), pdf, 4, page -> {
            emittedPages.add(page.pageNumber());
            assertTrue(page.text().contains("side " + page.pageNumber()));
            assertEquals("TEXT", page.extractionMethod());
        });

        assertEquals(List.of(4, 5), emittedPages);
    }

    @Test
    void parsePagesRejectsStartPageOutsideDocument() throws Exception {
        Path pdf = fivePageTextPdf("range.pdf");

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> new PdfBoxDocumentParser().parsePages(document("range.pdf"), pdf, 6, page -> {})
        );

        assertTrue(error.getMessage().contains("START_PAGE_OUT_OF_RANGE"));
    }

    @Test
    void parsePagesAbortsOnSinkFailureWithoutSwallowingCause() throws Exception {
        Path pdf = fivePageTextPdf("sink-fail.pdf");
        List<Integer> emittedPages = new java.util.ArrayList<>();

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> new PdfBoxDocumentParser().parsePages(document("sink-fail.pdf"), pdf, 1, page -> {
                    emittedPages.add(page.pageNumber());
                    if (page.pageNumber() == 3) {
                        throw new IllegalStateException("persistence_failed page=3");
                    }
                })
        );

        assertEquals("persistence_failed page=3", error.getMessage());
        assertEquals(List.of(1, 2, 3), emittedPages);
    }

    @Test
    void activeParserAndWorkerPathStaysScratchBackedWithoutWholeFileHeapReads() throws Exception {
        // Guard against regressions to heap-backed loading: the active parser/worker sources must
        // keep the temp-file stream cache and must not read the whole PDF into a byte array.
        Path parserSource = Path.of("src", "main", "java", "no", "saksrom", "api", "document", "PdfBoxDocumentParser.java");
        Path workerSource = Path.of("src", "main", "java", "no", "saksrom", "api", "document", "IngestionWorkerService.java");
        String parserCode = Files.readString(parserSource);
        String workerCode = Files.readString(workerSource);

        assertTrue(
                parserCode.contains("IOUtils.createTempFileOnlyStreamCache()"),
                "PdfBoxDocumentParser must load PDFs with the scratch/temp-file stream cache"
        );
        for (String forbidden : List.of("readAllBytes", "toByteArray", "loadPDF(byte[]")) {
            assertFalse(parserCode.contains(forbidden), "PdfBoxDocumentParser must not use " + forbidden);
            assertFalse(workerCode.contains(forbidden), "IngestionWorkerService must not use " + forbidden);
        }
    }

    @Test
    void parsesTxtFileSuccessfully() throws Exception {
        Path txt = tempDir.resolve("test.txt");
        Files.writeString(txt, "Dette er testinnhold for en plain text fil.");

        ParsedDocument parsed = new PdfBoxDocumentParser().parse(txtDocument("test.txt"), txt);

        assertFalse(parsed.ocrRequired());
        assertFalse(parsed.ocrPerformed());
        assertEquals("pdfbox-tess4j", parsed.parserName());
        assertEquals(1, parsed.pages().size());
        assertEquals("Dette er testinnhold for en plain text fil.", parsed.pages().get(0).text());
        assertEquals("TEXT", parsed.pages().get(0).extractionMethod());
    }

    @Test
    void parsesUtf8TxtWithNordicCharactersWithoutBomLeak() throws Exception {
        Path txt = tempDir.resolve("norsk.txt");
        Files.writeString(txt, "\uFEFFSpørsmål: Hva står på siden om kilder?", StandardCharsets.UTF_8);

        ParsedDocument parsed = new PdfBoxDocumentParser().parse(txtDocument("norsk.txt"), txt);

        assertEquals("Spørsmål: Hva står på siden om kilder?", parsed.pages().get(0).text());
        assertFalse(parsed.pages().get(0).text().startsWith("\uFEFF"));
    }

    private Document txtDocument(String filename) {
        return new Document(
                UUID.fromString("00000000-0000-0000-0000-000000001111"),
                UUID.fromString("00000000-0000-0000-0000-000000001001"),
                UUID.fromString("00000000-0000-0000-0000-000000001101"),
                UUID.fromString("00000000-0000-0000-0000-000000001003"),
                filename,
                filename,
                "text/plain",
                4L,
                1,
                "hash",
                filename,
                "QUARANTINE_LOCAL"
        );
    }

    private Path fivePageTextPdf(String filename) throws Exception {
        Path pdf = tempDir.resolve(filename);
        try (PDDocument document = new PDDocument()) {
            for (int pageNumber = 1; pageNumber <= 5; pageNumber++) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(72, 720);
                    content.showText("Strafferettslig kildegrunnlag med tilstrekkelig tekst side " + pageNumber);
                    content.endText();
                }
            }
            document.save(pdf.toFile());
        }
        return pdf;
    }

    private Path imageOnlyPdf(String filename, String imageText) throws Exception {
        Path pdf = tempDir.resolve(filename);
        try (PDDocument document = new PDDocument()) {
            addImageOnlyPage(document, imageText);
            document.save(pdf.toFile());
        }
        return pdf;
    }

    private Path highContrastImagePdf(String filename) throws Exception {
        Path pdf = tempDir.resolve(filename);
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            BufferedImage image = new BufferedImage(900, 260, BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = image.createGraphics();
            try {
                graphics.setColor(Color.WHITE);
                graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
                graphics.setColor(Color.BLACK);
                graphics.setFont(new Font("Arial", Font.BOLD, 48));
                graphics.drawString("LEASE DOCUMENT PAGE ONE", 40, 130);
            } finally {
                graphics.dispose();
            }
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.drawImage(JPEGFactory.createFromImage(document, image), 72, 520, 440, 128);
            } finally {
                image.flush();
            }
            document.save(pdf.toFile());
        }
        return pdf;
    }

    private Path mixedFiveScannedSeventyThreeTextPdf(String filename) throws Exception {
        Path pdf = tempDir.resolve(filename);
        try (PDDocument document = new PDDocument()) {
            for (int pageNumber = 1; pageNumber <= 5; pageNumber++) {
                addImageOnlyPage(document, "Skannet juridisk side " + pageNumber);
            }
            for (int pageNumber = 6; pageNumber <= 78; pageNumber++) {
                PDPage page = new PDPage();
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    content.newLineAtOffset(72, 720);
                    content.showText("Tekstlag for blandet PDF med leieavtale endringsavtale transaksjoner side " + pageNumber);
                    content.endText();
                }
            }
            document.save(pdf.toFile());
        }
        return pdf;
    }

    private void addImageOnlyPage(PDDocument document, String imageText) throws Exception {
        PDPage page = new PDPage();
        document.addPage(page);
        BufferedImage image = new BufferedImage(420, 160, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
            graphics.setColor(Color.BLACK);
            graphics.drawString(imageText, 40, 80);
        } finally {
            graphics.dispose();
        }
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.drawImage(JPEGFactory.createFromImage(document, image), 72, 600, 260, 100);
        } finally {
            image.flush();
        }
    }

    private void addTextPage(PDDocument document, String text) throws Exception {
        PDPage page = new PDPage();
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.newLineAtOffset(72, 720);
            content.showText(text);
            content.endText();
        }
    }

    private EvidaProperties.Parser ocrTestProperties() {
        return new EvidaProperties.Parser(
                true,
                40,
                72,
                5,
                tempDir.resolve("tessdata").toString(),
                "",
                "nor+eng",
                20_000
        );
    }

    private EvidaProperties.Parser realOcrProperties(int textThresholdChars) {
        String tessdataPath = System.getenv("EVIDA_TESSDATA_PATH");
        String tesseractPath = System.getenv("EVIDA_TESSERACT_PATH");
        org.junit.jupiter.api.Assumptions.assumeTrue(
                tessdataPath != null
                        && !tessdataPath.isBlank()
                        && Files.isRegularFile(Path.of(tessdataPath).resolve("nor.traineddata"))
                        && Files.isRegularFile(Path.of(tessdataPath).resolve("eng.traineddata")),
                "real OCR runtime tessdata env is not configured"
        );
        org.junit.jupiter.api.Assumptions.assumeTrue(
                tesseractPath != null && !tesseractPath.isBlank() && Files.isRegularFile(Path.of(tesseractPath)),
                "real OCR runtime executable env is not configured"
        );
        return new EvidaProperties.Parser(
                true,
                textThresholdChars,
                300,
                30,
                tessdataPath,
                tesseractPath,
                "nor+eng",
                20_000
        );
    }

    private PdfBoxDocumentParser parserWithOcr(EvidaProperties.Parser properties, OcrEngine ocrEngine) {
        OcrRuntimeProbe probe = new OcrRuntimeProbe(properties) {
            @Override
            public OcrRuntimeStatus probe() {
                return new OcrRuntimeStatus(
                        true,
                        true,
                        "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                        "tesseract 5",
                        properties.tessdataPath(),
                        true,
                        true,
                        properties.ocrLanguages(),
                        true,
                        ""
                );
            }
        };
        return new PdfBoxDocumentParser(properties, probe, ocrEngine);
    }

    private Document document(String filename) {
        return new Document(
                UUID.fromString("00000000-0000-0000-0000-000000001111"),
                UUID.fromString("00000000-0000-0000-0000-000000001001"),
                UUID.fromString("00000000-0000-0000-0000-000000001101"),
                UUID.fromString("00000000-0000-0000-0000-000000001003"),
                filename,
                filename,
                "application/pdf",
                4L,
                1,
                "hash",
                filename,
                "QUARANTINE_LOCAL"
        );
    }
}
