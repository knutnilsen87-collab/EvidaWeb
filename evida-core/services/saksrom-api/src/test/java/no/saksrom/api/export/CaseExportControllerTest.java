package no.saksrom.api.export;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.casefile.CaseFile;
import no.saksrom.api.casefile.CaseFileRepository;
import no.saksrom.api.saksrom.SourceBoundSaksromService;
import no.saksrom.api.saksrom.SourceReference;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.AuthorizationService;
import no.saksrom.api.security.CurrentUserService;
import no.saksrom.api.security.Permission;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CaseExportControllerTest {
    private static final UUID TENANT = UUID.fromString("00000000-0000-0000-0000-000000001001");
    private static final UUID USER = UUID.fromString("00000000-0000-0000-0000-000000001003");
    private static final UUID CASE = UUID.fromString("00000000-0000-0000-0000-000000001101");
    private static final UUID DOCUMENT = UUID.fromString("00000000-0000-0000-0000-000000001201");

    @Test
    void exportIncludesTraceabilityAndCreatesSafeAuditEvent() {
        CurrentUserService currentUser = mock(CurrentUserService.class);
        AuthorizationService authorization = mock(AuthorizationService.class);
        CaseFileRepository cases = mock(CaseFileRepository.class);
        SourceBoundSaksromService saksrom = mock(SourceBoundSaksromService.class);
        AuditService audit = mock(AuditService.class);
        AuthenticatedUser user = new AuthenticatedUser(TENANT, USER, "jurist@firma.no", Set.of("LAWYER"));
        CaseFile caseFile = new CaseFile(TENANT, "Fiktiv kontraktssak", USER);
        setCaseId(caseFile, CASE);
        SourceReference source = new SourceReference(
                DOCUMENT,
                "doc_001_p1",
                1,
                "Dokumentert faktum.",
                0.96,
                null
        );
        var summary = new SourceBoundSaksromService.SaksromSummaryResponse(
                CASE.toString(),
                "Kildebundet oppsummering",
                "Dokumentert sammendrag.",
                List.of(new SourceBoundSaksromService.SummaryFinding("Funn", "Dokumentert faktum.", List.of(source))),
                List.of(source),
                true,
                List.of(),
                null
        );
        when(currentUser.currentUser()).thenReturn(user);
        when(cases.findById(CASE)).thenReturn(Optional.of(caseFile));
        when(saksrom.summarize(eq(TENANT), any())).thenReturn(summary);
        CaseExportController controller = new CaseExportController(currentUser, authorization, cases, saksrom, audit);

        var response = controller.exportSourceReport(CASE, TENANT.toString());
        String report = new String(response.getBody(), StandardCharsets.UTF_8);

        assertEquals(200, response.getStatusCode().value());
        assertTrue(report.contains("AI-GENERERT UTKAST"));
        assertTrue(report.contains(CASE.toString()));
        assertTrue(report.contains(DOCUMENT.toString()));
        assertTrue(report.contains("doc_001_p1"));
        verify(authorization).requirePermission(user, Permission.EXPORT_CREATE);
        verify(audit).record(
                eq(TENANT), eq(CASE), eq(USER), eq("EXPORT_CREATED"),
                eq("CASE_SOURCE_REPORT"), eq(CASE),
                argThat(payload -> payload.contains("\"sourceCount\":1") && !payload.contains("Dokumentert faktum"))
        );
    }

    @Test
    void exportFailsClosedWithoutSourceBasis() {
        CurrentUserService currentUser = mock(CurrentUserService.class);
        AuthorizationService authorization = mock(AuthorizationService.class);
        CaseFileRepository cases = mock(CaseFileRepository.class);
        SourceBoundSaksromService saksrom = mock(SourceBoundSaksromService.class);
        AuditService audit = mock(AuditService.class);
        AuthenticatedUser user = new AuthenticatedUser(TENANT, USER, "jurist@firma.no", Set.of("LAWYER"));
        CaseFile caseFile = new CaseFile(TENANT, "Fiktiv sak", USER);
        setCaseId(caseFile, CASE);
        when(currentUser.currentUser()).thenReturn(user);
        when(cases.findById(CASE)).thenReturn(Optional.of(caseFile));
        when(saksrom.summarize(eq(TENANT), any())).thenReturn(
                new SourceBoundSaksromService.SaksromSummaryResponse(
                        CASE.toString(), "Ingen kilder", "Ingen kildegrunnlag.",
                        List.of(), List.of(), false, List.of("NO_SOURCE_BASIS"), null
                )
        );
        CaseExportController controller = new CaseExportController(currentUser, authorization, cases, saksrom, audit);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.exportSourceReport(CASE, TENANT.toString())
        );

        assertEquals(409, error.getStatusCode().value());
        verify(audit, never()).record(any(), any(), any(), anyString(), anyString(), any(), anyString());
    }

    private void setCaseId(CaseFile caseFile, UUID id) {
        try {
            var field = CaseFile.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(caseFile, id);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }
}
