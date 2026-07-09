// EVIDA Bulk Ingestion Prompt 5 — deterministic stress fixture generator (verification only).
// Run standalone with PDFBox jars on the classpath:
//   java -cp "<pdfbox>;<fontbox>;<pdfbox-io>;..." StressFixtureGenerator.java <fixtureRoot> <seed>
// Writes all fixtures to <fixtureRoot> (OS temp) and a manifest.json with the expected numbers.
// No production code is touched; large files never enter the repo.

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class StressFixtureGenerator {
    static final int MASTERDOC_PAGES = 10_000;
    static final int BULK_UNIQUE = 170;
    static final int BULK_DUPLICATES = 30;
    static final int MIXED_DOCS = 5;
    static final int VALID_BATCH = 50;
    static final int OVERSIZED_PAGES = 20_001;

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        long seed = Long.parseLong(args[1]);
        Files.createDirectories(root.resolve("bulk"));
        Files.createDirectories(root.resolve("mixed"));
        Files.createDirectories(root.resolve("gift"));
        Files.createDirectories(root.resolve("valid"));

        Random random = new Random(seed);
        List<String> generatedPaths = new ArrayList<>();
        List<String> expectedFailedFiles = new ArrayList<>();
        List<String> giftFiles = new ArrayList<>();

        // 1. MASTERDOC — 10 000 pages with unique searchable text per page.
        Path masterdoc = root.resolve("masterdoc_10000.pdf");
        writeTextPdf(masterdoc, MASTERDOC_PAGES, StressFixtureGenerator::masterdocPageText);
        generatedPaths.add(rel(root, masterdoc));
        System.out.println("masterdoc done: " + Files.size(masterdoc) + " bytes");

        // 2. BULK — 170 unique small PDFs (1-20 pages) + 30 byte-identical duplicates.
        int bulkUniquePages = 0;
        List<Path> bulkUniques = new ArrayList<>();
        for (int doc = 1; doc <= BULK_UNIQUE; doc++) {
            int pages = 1 + random.nextInt(20);
            bulkUniquePages += pages;
            int docNumber = doc;
            Path pdf = root.resolve("bulk").resolve(String.format("bulk_%03d.pdf", doc));
            writeTextPdf(pdf, pages, page -> String.format(
                    "EVIDA-BULK-DOC-%03d-SIDE-%02d seed %d unique bulk legal stress content", docNumber, page, seed));
            bulkUniques.add(pdf);
            generatedPaths.add(rel(root, pdf));
        }
        for (int dup = 1; dup <= BULK_DUPLICATES; dup++) {
            Path original = bulkUniques.get(dup - 1);
            Path copy = root.resolve("bulk").resolve(String.format("bulk_dup_%03d.pdf", dup));
            Files.copy(original, copy, StandardCopyOption.REPLACE_EXISTING);
            generatedPaths.add(rel(root, copy));
        }
        System.out.println("bulk done: unique=" + BULK_UNIQUE + " uniquePages=" + bulkUniquePages + " duplicates=" + BULK_DUPLICATES);

        // 3. OCR/MIXED — 5 PDFs mixing text pages and an image-only page that requires OCR.
        for (int doc = 1; doc <= MIXED_DOCS; doc++) {
            Path pdf = root.resolve("mixed").resolve(String.format("mixed_%02d.pdf", doc));
            writeMixedPdf(pdf, doc, seed);
            generatedPaths.add(rel(root, pdf));
            expectedFailedFiles.add(rel(root, pdf) + "|OCR_RUNTIME_UNAVAILABLE_OR_OCR_FAILED");
        }
        System.out.println("mixed done");

        // 4. GIFT / fail-closed files.
        Path encrypted = root.resolve("gift").resolve("gift_encrypted.pdf");
        writeEncryptedPdf(encrypted);
        giftFiles.add(rel(root, encrypted));
        expectedFailedFiles.add(rel(root, encrypted) + "|PDF_ENCRYPTED");
        generatedPaths.add(rel(root, encrypted));

        Path corrupt = root.resolve("gift").resolve("gift_corrupt.pdf");
        Path corruptSource = root.resolve("gift").resolve("gift_corrupt_source.tmp");
        writeTextPdf(corruptSource, 3, page -> "EVIDA-GIFT-CORRUPT-SIDE-" + page + " content that will be truncated soon");
        byte[] whole = Files.readAllBytes(corruptSource);
        Files.write(corrupt, java.util.Arrays.copyOf(whole, Math.max(64, whole.length / 3)));
        Files.delete(corruptSource);
        giftFiles.add(rel(root, corrupt));
        expectedFailedFiles.add(rel(root, corrupt) + "|PDF_PARSE_FAILED");
        generatedPaths.add(rel(root, corrupt));

        Path imageOnly = root.resolve("gift").resolve("gift_image_only.pdf");
        writeImageOnlyPdf(imageOnly);
        giftFiles.add(rel(root, imageOnly));
        expectedFailedFiles.add(rel(root, imageOnly) + "|OCR_RUNTIME_UNAVAILABLE_OR_OCR_FAILED");
        generatedPaths.add(rel(root, imageOnly));

        Path oversized = root.resolve("gift").resolve("gift_oversized_20001.pdf");
        writeTextPdf(oversized, OVERSIZED_PAGES, page -> "EVIDA-OVERSIZED-SIDE-" + page + " exceeds max page limit fixture content");
        giftFiles.add(rel(root, oversized));
        expectedFailedFiles.add(rel(root, oversized) + "|PDF_TOO_MANY_PAGES");
        generatedPaths.add(rel(root, oversized));
        System.out.println("gift done");

        // 5. VALID batch for fail-closed-under-load (C6): 50 small valid PDFs.
        int validPages = 0;
        for (int doc = 1; doc <= VALID_BATCH; doc++) {
            int pages = 1 + random.nextInt(3);
            validPages += pages;
            int docNumber = doc;
            Path pdf = root.resolve("valid").resolve(String.format("valid_%03d.pdf", doc));
            writeTextPdf(pdf, pages, page -> String.format(
                    "EVIDA-VALID-DOC-%03d-SIDE-%02d seed %d fail-closed batch companion content", docNumber, page, seed));
            generatedPaths.add(rel(root, pdf));
        }
        System.out.println("valid done: validPages=" + validPages);

        int totalDocuments = 1 + BULK_UNIQUE + BULK_DUPLICATES + MIXED_DOCS + giftFiles.size() + VALID_BATCH;
        int uniqueDocuments = totalDocuments - BULK_DUPLICATES;
        int expectedPageUnits = MASTERDOC_PAGES + bulkUniquePages + validPages;

        StringBuilder manifest = new StringBuilder();
        manifest.append("{\n");
        manifest.append("  \"seed\": \"").append(seed).append("\",\n");
        manifest.append("  \"generated_at\": \"").append(OffsetDateTime.now()).append("\",\n");
        manifest.append("  \"fixture_root\": ").append(jsonString(root.toString())).append(",\n");
        manifest.append("  \"total_documents\": ").append(totalDocuments).append(",\n");
        manifest.append("  \"unique_documents\": ").append(uniqueDocuments).append(",\n");
        manifest.append("  \"duplicate_count\": ").append(BULK_DUPLICATES).append(",\n");
        manifest.append("  \"expected_page_units\": ").append(expectedPageUnits).append(",\n");
        manifest.append("  \"masterdoc_pages\": ").append(MASTERDOC_PAGES).append(",\n");
        manifest.append("  \"masterdoc_page_text_format\": \"EVIDA-STRESS-SIDE-%05d unique legal stress content page %d\",\n");
        manifest.append("  \"bulk_small_pdf_count\": ").append(BULK_UNIQUE + BULK_DUPLICATES).append(",\n");
        manifest.append("  \"bulk_unique_count\": ").append(BULK_UNIQUE).append(",\n");
        manifest.append("  \"bulk_unique_pages\": ").append(bulkUniquePages).append(",\n");
        manifest.append("  \"bulk_duplicate_count\": ").append(BULK_DUPLICATES).append(",\n");
        manifest.append("  \"valid_batch_count\": ").append(VALID_BATCH).append(",\n");
        manifest.append("  \"valid_batch_pages\": ").append(validPages).append(",\n");
        manifest.append("  \"ocr_required_documents\": ").append(MIXED_DOCS + 1).append(",\n");
        manifest.append("  \"oversized_pages\": ").append(OVERSIZED_PAGES).append(",\n");
        manifest.append("  \"gift_files\": ").append(jsonArray(giftFiles)).append(",\n");
        manifest.append("  \"expected_failed_files\": ").append(jsonArray(expectedFailedFiles)).append(",\n");
        manifest.append("  \"generated_paths\": ").append(jsonArray(generatedPaths)).append("\n");
        manifest.append("}\n");
        Files.writeString(root.resolve("manifest.json"), manifest.toString());
        System.out.println("manifest written: " + root.resolve("manifest.json"));
    }

    static String masterdocPageText(int page) {
        return String.format("EVIDA-STRESS-SIDE-%05d unique legal stress content page %d", page, page);
    }

    interface PageText {
        String text(int page);
    }

    static void writeTextPdf(Path target, int pages, PageText pageText) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (int page = 1; page <= pages; page++) {
                PDPage pdPage = new PDPage();
                document.addPage(pdPage);
                try (PDPageContentStream content = new PDPageContentStream(document, pdPage)) {
                    content.beginText();
                    content.setFont(font, 11);
                    content.newLineAtOffset(60, 720);
                    content.showText(pageText.text(page));
                    content.endText();
                }
            }
            document.save(target.toFile());
        }
    }

    static void writeMixedPdf(Path target, int docNumber, long seed) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (int page = 1; page <= 2; page++) {
                PDPage pdPage = new PDPage();
                document.addPage(pdPage);
                try (PDPageContentStream content = new PDPageContentStream(document, pdPage)) {
                    content.beginText();
                    content.setFont(font, 11);
                    content.newLineAtOffset(60, 720);
                    content.showText(String.format(
                            "EVIDA-MIXED-DOC-%02d-TEKST-SIDE-%d seed %d scanned mix fixture", docNumber, page, seed));
                    content.endText();
                }
            }
            addImageOnlyPage(document, "Skannet side i mixed dokument " + docNumber);
            document.save(target.toFile());
        }
    }

    static void writeImageOnlyPdf(Path target) throws IOException {
        try (PDDocument document = new PDDocument()) {
            addImageOnlyPage(document, "Ren skannet gift-side uten tekstlag");
            document.save(target.toFile());
        }
    }

    static void addImageOnlyPage(PDDocument document, String label) throws IOException {
        PDPage page = new PDPage();
        document.addPage(page);
        BufferedImage image = new BufferedImage(500, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
            graphics.setColor(Color.BLACK);
            graphics.drawString(label, 30, 100);
        } finally {
            graphics.dispose();
        }
        PDImageXObject xImage = JPEGFactory.createFromImage(document, image);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.drawImage(xImage, 60, 500, 400, 160);
        } finally {
            image.flush();
        }
    }

    static void writeEncryptedPdf(Path target) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                content.newLineAtOffset(60, 720);
                content.showText("EVIDA-GIFT-ENCRYPTED innhold bak passord");
                content.endText();
            }
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                    "owner-secret", "user-secret", new AccessPermission());
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            document.save(target.toFile());
        }
    }

    static String rel(Path root, Path file) {
        return root.relativize(file).toString().replace('\\', '/');
    }

    static String jsonString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    static String jsonArray(List<String> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(jsonString(values.get(i)));
        }
        return sb.append("]").toString();
    }
}
