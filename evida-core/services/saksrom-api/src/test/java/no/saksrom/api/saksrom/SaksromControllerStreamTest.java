package no.saksrom.api.saksrom;

import com.fasterxml.jackson.databind.ObjectMapper;
import no.saksrom.api.ai.SseAiStreamer;
import no.saksrom.api.ai.StreamingProperties;
import no.saksrom.api.audit.AuditService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SaksromControllerStreamTest {
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000001002");
    private static final UUID CASE_ID = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000001111");

    @Test
    void summaryStreamEmitsStructuredEventsFromRealSummaryShape() throws Exception {
        var currentUserService = mock(CurrentUserService.class);
        var saksromService = mock(SourceBoundSaksromService.class);
        var coverageService = mock(SourceCoverageService.class);
        var auditService = mock(AuditService.class);
        var objectMapper = new ObjectMapper();
        var controller = new SaksromController(
                currentUserService,
                saksromService,
                coverageService,
                auditService,
                objectMapper,
                new SseAiStreamer(objectMapper, new StreamingProperties())
        );
        var request = new SourceBoundSaksromService.SaksromSummaryRequest(
                CASE_ID.toString(),
                true,
                "READY_PAGE_UNITS_ONLY"
        );
        var source = new SourceReference(
                DOCUMENT_ID,
                "doc_00000000_p0002_b0001",
                2,
                "Rettsbok utdrag",
                0.88,
                null
        );
        var coverage = new SourceCoverageService.SourceCoverageResponse(
                1,
                0,
                1,
                0,
                78,
                72,
                0,
                72,
                5,
                1,
                0,
                92,
                "1-5",
                "75",
                List.of()
        );
        var summary = new SourceBoundSaksromService.SaksromSummaryResponse(
                CASE_ID.toString(),
                "Foreløpig kildebundet saksoppsummering",
                "Foreløpig kildegrunnlag fra klare PageUnits.",
                List.of(new SourceBoundSaksromService.SummaryFinding(
                        "Side 2",
                        "Rettsboken dokumenterer behandling.",
                        List.of(source)
                )),
                List.of(source),
                true,
                List.of("PARTIAL_SOURCE_COVERAGE", "MISSING_OCR_PAGES=1-5"),
                coverage
        );

        when(currentUserService.currentUser()).thenReturn(new AuthenticatedUser(TENANT_ID, USER_ID, Set.of("USER")));
        when(saksromService.summarize(TENANT_ID, request)).thenReturn(summary);

        var outputStream = new ByteArrayOutputStream();
        controller.summaryStream(TENANT_ID.toString(), request).writeTo(outputStream);
        String body = outputStream.toString(StandardCharsets.UTF_8);

        assertTrue(body.contains("\"type\":\"stage\""));
        assertTrue(body.contains("\"stage\":\"reading_sources\""));
        assertTrue(body.contains("\"type\":\"text_delta\""));
        assertTrue(body.contains("\"type\":\"citation\""));
        assertTrue(body.contains("\"sourceUnitId\":\"doc_00000000_p0002_b0001\""));
        assertTrue(body.contains("\"type\":\"finding\""));
        assertTrue(body.contains("\"type\":\"warning\""));
        assertTrue(body.contains("\"type\":\"complete\""));
    }
}
