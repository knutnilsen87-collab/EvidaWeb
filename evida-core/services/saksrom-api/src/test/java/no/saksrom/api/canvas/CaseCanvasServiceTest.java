package no.saksrom.api.canvas;

import com.fasterxml.jackson.databind.ObjectMapper;
import no.saksrom.api.audit.AuditService;
import no.saksrom.api.casefile.CaseFile;
import no.saksrom.api.casefile.CaseFileRepository;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import no.saksrom.api.security.AuthenticatedUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CaseCanvasServiceTest {
    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID caseId = UUID.randomUUID();
    private final AuthenticatedUser user = new AuthenticatedUser(tenantId, userId, "jurist@example.test", Set.of("LAWYER"));
    private CaseCanvasRepository repository;
    private CaseFileRepository caseFileRepository;
    private DocumentSourceUnitRepository sourceUnitRepository;
    private AuditService auditService;
    private CaseCanvasService service;

    @BeforeEach
    void setUp() {
        repository = mock(CaseCanvasRepository.class);
        caseFileRepository = mock(CaseFileRepository.class);
        sourceUnitRepository = mock(DocumentSourceUnitRepository.class);
        auditService = mock(AuditService.class);
        service = new CaseCanvasService(repository, caseFileRepository, sourceUnitRepository, auditService, new ObjectMapper());

        CaseFile caseFile = mock(CaseFile.class);
        when(caseFile.getStatus()).thenReturn("OPEN");
        when(caseFileRepository.findByIdAndTenantId(caseId, tenantId)).thenReturn(Optional.of(caseFile));
    }

    @Test
    void createsEmptyCanvasAndRecordsMetadataOnlyAudit() {
        when(repository.findByTenantIdAndCaseId(tenantId, caseId)).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any(CaseCanvas.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var payload = new CaseCanvasDtos.CanvasPayload(List.of(), List.of(), new CaseCanvasDtos.Viewport(0, 0, 0.85));

        var response = service.save(caseId, new CaseCanvasDtos.SaveCanvasRequest(0, payload), user);

        assertThat(response.caseId()).isEqualTo(caseId);
        assertThat(response.canvas().nodes()).isEmpty();
        verify(auditService).record(eq(tenantId), eq(caseId), eq(userId), eq("CASE_CANVAS_SAVED"), eq("CASE_CANVAS"), any(), eq("{\"version\":0,\"nodeCount\":0,\"edgeCount\":0}"));
    }

    @Test
    void rejectsDanglingRelationsBeforePersistence() {
        UUID nodeId = UUID.randomUUID();
        var node = new CaseCanvasDtos.CanvasNode(nodeId, "FACT", "Faktum", "Beskrivelse", "UNSOURCED", 0, 0, null);
        var edge = new CaseCanvasDtos.CanvasEdge(UUID.randomUUID(), nodeId, UUID.randomUUID(), "SUPPORTS");
        var request = new CaseCanvasDtos.SaveCanvasRequest(0, new CaseCanvasDtos.CanvasPayload(List.of(node), List.of(edge), null));

        assertThatThrownBy(() -> service.save(caseId, request, user))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Relasjoner");
    }

    @Test
    void rejectsStaleExpectedVersion() {
        CaseCanvas existing = new CaseCanvas(tenantId, caseId, userId, "{\"nodes\":[],\"edges\":[],\"viewport\":null}");
        when(repository.findByTenantIdAndCaseId(tenantId, caseId)).thenReturn(Optional.of(existing));
        var payload = new CaseCanvasDtos.CanvasPayload(List.of(), List.of(), null);

        assertThatThrownBy(() -> service.save(caseId, new CaseCanvasDtos.SaveCanvasRequest(1, payload), user))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("annen økt");
    }

    @Test
    void mapsDatabaseOptimisticRaceToConflict() {
        when(repository.findByTenantIdAndCaseId(tenantId, caseId)).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any(CaseCanvas.class))).thenThrow(new ObjectOptimisticLockingFailureException(CaseCanvas.class, caseId));
        var payload = new CaseCanvasDtos.CanvasPayload(List.of(), List.of(), null);

        assertThatThrownBy(() -> service.save(caseId, new CaseCanvasDtos.SaveCanvasRequest(0, payload), user))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("samtidig");
    }
}
