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
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

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

        var parser = new PdfBoxDocumentParser();
        parser.validateOcrRuntime();

        DocumentParsingException error = assertThrows(
                DocumentParsingException.class,
                () -> parser.parse(document("image.pdf"), pdf)
        );

        assertTrue(error.getMessage().contains("PARTIAL_OCR_RUNTIME_MISSING") || error.getMessage().contains("OCR_FAILED"));
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

        assertEquals(72, emittedPages.size());
        assertEquals(List.of(1, 2, 3, 4, 5), warning.ocrRuntimeMissingPages());
        assertEquals(List.of(75), warning.textBelowThresholdPages());
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 10 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 50 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().anyMatch(page -> page.pageNumber() == 60 && page.text().length() >= 40));
        assertTrue(emittedPages.stream().noneMatch(page -> page.pageNumber() <= 5 || page.pageNumber() == 75));
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
