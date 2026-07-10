package no.saksrom.api.saksrom;

import no.saksrom.api.document.Document;
import no.saksrom.api.document.DocumentRepository;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import no.saksrom.api.document.IngestionJob;
import no.saksrom.api.document.IngestionJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class SourceCoverageService {
    private static final List<String> EXCLUDED_DOCUMENT_STATUSES = List.of(
            Document.STATUS_ARCHIVED,
            Document.STATUS_DELETED
    );
    private static final Pattern OCR_MISSING_PATTERN = Pattern.compile("(?:^|\\s)pages=([0-9,\\-]+)");
    private static final Pattern BELOW_THRESHOLD_PATTERN = Pattern.compile("(?:^|\\s)text_below_threshold=([0-9,\\-]+)");

    private final DocumentRepository documentRepository;
    private final IngestionJobRepository ingestionJobRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;

    public SourceCoverageService(
            DocumentRepository documentRepository,
            IngestionJobRepository ingestionJobRepository,
            DocumentSourceUnitRepository sourceUnitRepository
    ) {
        this.documentRepository = documentRepository;
        this.ingestionJobRepository = ingestionJobRepository;
        this.sourceUnitRepository = sourceUnitRepository;
    }

    @Transactional(readOnly = true)
    public SourceCoverageResponse coverage(UUID tenantId, UUID caseId) {
        List<Document> documents = caseId == null
                ? documentRepository.findByTenantIdAndStatusNotInOrderByCreatedAtDesc(tenantId, EXCLUDED_DOCUMENT_STATUSES)
                : documentRepository.findByTenantIdAndCaseIdAndStatusNotInOrderByCreatedAtDesc(tenantId, caseId, EXCLUDED_DOCUMENT_STATUSES);

        List<DocumentCoverage> documentCoverage = documents.stream()
                .map(document -> coverageForDocument(tenantId, document))
                .toList();

        int totalPages = documentCoverage.stream().mapToInt(DocumentCoverage::totalPages).sum();
        int readyPages = documentCoverage.stream().mapToInt(DocumentCoverage::readyPages).sum();
        int missingOcrPages = documentCoverage.stream().mapToInt(DocumentCoverage::missingOcrPages).sum();
        int belowThresholdPages = documentCoverage.stream().mapToInt(DocumentCoverage::belowThresholdPages).sum();
        int failedPages = documentCoverage.stream().mapToInt(DocumentCoverage::failedPages).sum();
        int sourceReadyDocuments = (int) documentCoverage.stream().filter(DocumentCoverage::sourceReady).count();
        int partialDocuments = (int) documentCoverage.stream().filter(DocumentCoverage::partialSourceReady).count();
        int failedDocuments = (int) documentCoverage.stream().filter(DocumentCoverage::failed).count();

        return new SourceCoverageResponse(
                documents.size(),
                sourceReadyDocuments,
                partialDocuments,
                failedDocuments,
                totalPages,
                readyPages,
                0,
                readyPages,
                missingOcrPages,
                belowThresholdPages,
                failedPages,
                coveragePercent(readyPages, totalPages),
                rangeText(documentCoverage.stream().flatMap(d -> d.missingOcrPageNumbers().stream()).toList()),
                rangeText(documentCoverage.stream().flatMap(d -> d.belowThresholdPageNumbers().stream()).toList()),
                documentCoverage
        );
    }

    private DocumentCoverage coverageForDocument(UUID tenantId, Document document) {
        Optional<IngestionJob> latestJob = ingestionJobRepository.findFirstByTenantIdAndDocumentIdOrderByCreatedAtDesc(
                tenantId,
                document.getId()
        );
        List<Integer> readyPageNumbers = sourceUnitRepository.findDistinctPageNumbersByTenantIdAndDocumentId(tenantId, document.getId())
                .stream()
                .filter(page -> page != null && page > 0)
                .distinct()
                .sorted()
                .toList();
        String warning = warningFor(document, latestJob);
        List<Integer> missingOcrPageNumbers = expandPages(OCR_MISSING_PATTERN, warning);
        List<Integer> belowThresholdPageNumbers = expandPages(BELOW_THRESHOLD_PATTERN, warning);
        int totalPages = totalPages(document, latestJob, readyPageNumbers, missingOcrPageNumbers, belowThresholdPageNumbers);
        int readyPages = readyPageNumbers.size();
        int failedPages = Document.STATUS_INGESTION_FAILED.equals(document.getStatus())
                ? Math.max(0, totalPages - readyPages - missingOcrPageNumbers.size() - belowThresholdPageNumbers.size())
                : 0;

        return new DocumentCoverage(
                document.getId(),
                document.getFilename(),
                document.getStatus(),
                totalPages,
                readyPages,
                0,
                readyPages,
                missingOcrPageNumbers.size(),
                belowThresholdPageNumbers.size(),
                failedPages,
                rangeText(missingOcrPageNumbers),
                rangeText(belowThresholdPageNumbers),
                missingOcrPageNumbers,
                belowThresholdPageNumbers,
                warning,
                Document.STATUS_SOURCE_READY.equals(document.getStatus()) || Document.STATUS_VERIFIED.equals(document.getStatus()),
                Document.STATUS_PARTIAL_SOURCE_READY.equals(document.getStatus()),
                Document.STATUS_INGESTION_FAILED.equals(document.getStatus()) || Document.STATUS_REJECTED.equals(document.getStatus())
        );
    }

    private String warningFor(Document document, Optional<IngestionJob> latestJob) {
        if (latestJob.isPresent() && latestJob.get().getErrorMessage() != null && !latestJob.get().getErrorMessage().isBlank()) {
            return latestJob.get().getErrorMessage();
        }
        return document.getIngestionError();
    }

    private int totalPages(
            Document document,
            Optional<IngestionJob> latestJob,
            List<Integer> readyPageNumbers,
            List<Integer> missingOcrPageNumbers,
            List<Integer> belowThresholdPageNumbers
    ) {
        if (latestJob.isPresent() && latestJob.get().getPagesTotal() != null && latestJob.get().getPagesTotal() > 0) {
            return latestJob.get().getPagesTotal();
        }
        if (document.getPageCount() != null && document.getPageCount() > 0) {
            return document.getPageCount();
        }
        TreeSet<Integer> pages = new TreeSet<>();
        pages.addAll(readyPageNumbers);
        pages.addAll(missingOcrPageNumbers);
        pages.addAll(belowThresholdPageNumbers);
        return pages.size();
    }

    private static List<Integer> expandPages(Pattern pattern, String warning) {
        if (warning == null || warning.isBlank()) {
            return List.of();
        }
        var matcher = pattern.matcher(warning);
        if (!matcher.find()) {
            return List.of();
        }
        TreeSet<Integer> pages = new TreeSet<>();
        for (String token : matcher.group(1).split(",")) {
            if (token.isBlank()) {
                continue;
            }
            if (token.contains("-")) {
                String[] parts = token.split("-", 2);
                int start = parsePositiveInt(parts[0]);
                int end = parsePositiveInt(parts[1]);
                if (start > 0 && end >= start) {
                    for (int page = start; page <= end; page++) {
                        pages.add(page);
                    }
                }
            } else {
                int page = parsePositiveInt(token);
                if (page > 0) {
                    pages.add(page);
                }
            }
        }
        return List.copyOf(pages);
    }

    private static int parsePositiveInt(String value) {
        try {
            return Integer.parseInt(value.trim());
        } catch (RuntimeException e) {
            return -1;
        }
    }

    private static int coveragePercent(int readyPages, int totalPages) {
        if (totalPages <= 0) {
            return 0;
        }
        return Math.min(100, Math.round((readyPages * 100.0f) / totalPages));
    }

    private static String rangeText(List<Integer> pages) {
        if (pages == null || pages.isEmpty()) {
            return "";
        }
        List<Integer> sorted = pages.stream().filter(page -> page != null && page > 0).distinct().sorted().toList();
        List<String> ranges = new ArrayList<>();
        int start = sorted.get(0);
        int previous = start;
        for (int i = 1; i < sorted.size(); i++) {
            int current = sorted.get(i);
            if (current == previous + 1) {
                previous = current;
                continue;
            }
            ranges.add(start == previous ? String.valueOf(start) : start + "-" + previous);
            start = current;
            previous = current;
        }
        ranges.add(start == previous ? String.valueOf(start) : start + "-" + previous);
        return String.join(", ", ranges);
    }

    public record SourceCoverageResponse(
            int totalDocuments,
            int sourceReadyDocuments,
            int partialDocuments,
            int failedDocuments,
            int totalPages,
            int readyPages,
            int ocrReadyPages,
            int textReadyPages,
            int missingOcrPages,
            int belowThresholdPages,
            int failedPages,
            int coveragePercent,
            String missingOcrPageRanges,
            String belowThresholdPageRanges,
            List<DocumentCoverage> documentCoverage
    ) {}

    public record DocumentCoverage(
            UUID id,
            String filename,
            String status,
            int totalPages,
            int readyPages,
            int ocrReadyPages,
            int textReadyPages,
            int missingOcrPages,
            int belowThresholdPages,
            int failedPages,
            String missingOcrPageRanges,
            String belowThresholdPageRanges,
            List<Integer> missingOcrPageNumbers,
            List<Integer> belowThresholdPageNumbers,
            String warning,
            boolean sourceReady,
            boolean partialSourceReady,
            boolean failed
    ) {}
}
