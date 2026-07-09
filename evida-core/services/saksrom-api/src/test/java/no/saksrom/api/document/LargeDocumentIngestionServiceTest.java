package no.saksrom.api.document;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class LargeDocumentIngestionServiceTest {
    @Test
    void decomposesLargePdfIntoPageSourceSections() {
        var service = new LargeDocumentIngestionService();
        var documentId = UUID.fromString("00000000-0000-0000-0000-000000001111");

        var plan = service.plan(documentId, 10_000);

        assertTrue(plan.largeDocument());
        assertEquals("PAGE_SOURCE_UNITS", plan.sourceUnitMode());
        assertEquals(40, plan.sections().size());
        assertEquals(1, plan.sections().get(0).startPage());
        assertEquals(250, plan.sections().get(0).endPage());
        assertEquals(9751, plan.sections().get(39).startPage());
        assertEquals(10_000, plan.sections().get(39).endPage());
    }

    @Test
    void createsStablePageSourceUnitIds() {
        var service = new LargeDocumentIngestionService();
        var documentId = UUID.fromString("00000000-0000-0000-0000-000000001111");

        assertEquals("doc_00000000_p0450_b0001", service.sourceUnitId(documentId, 450));
        assertEquals("doc_00000000_p0450_b0007", service.sourceUnitId(documentId, 450, 7));
        assertThrows(IllegalArgumentException.class, () -> service.sourceUnitId(documentId, 0));
        assertThrows(IllegalArgumentException.class, () -> service.sourceUnitId(documentId, 1, 0));
    }

    @Test
    void synchronousIngestEndpointIsDisabledAsAWritePath() {
        var service = new LargeDocumentIngestionService();
        var error = assertThrows(
                ResponseStatusException.class,
                () -> service.ingestDocument(
                        UUID.fromString("00000000-0000-0000-0000-000000001111"),
                        UUID.fromString("00000000-0000-0000-0000-000000001001")
                )
        );

        assertEquals(410, error.getStatusCode().value());
    }
}
