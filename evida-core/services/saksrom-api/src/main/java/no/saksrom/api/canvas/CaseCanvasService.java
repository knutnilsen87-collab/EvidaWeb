package no.saksrom.api.canvas;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import no.saksrom.api.audit.AuditService;
import no.saksrom.api.casefile.CaseFileRepository;
import no.saksrom.api.document.DocumentSourceUnit;
import no.saksrom.api.document.DocumentSourceUnitRepository;
import no.saksrom.api.security.AuthenticatedUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class CaseCanvasService {
    private final CaseCanvasRepository repository;
    private final CaseFileRepository caseFileRepository;
    private final DocumentSourceUnitRepository sourceUnitRepository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    public CaseCanvasService(
            CaseCanvasRepository repository,
            CaseFileRepository caseFileRepository,
            DocumentSourceUnitRepository sourceUnitRepository,
            AuditService auditService,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.caseFileRepository = caseFileRepository;
        this.sourceUnitRepository = sourceUnitRepository;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public CaseCanvasDtos.CaseCanvasResponse get(UUID caseId, AuthenticatedUser user) {
        requireCase(caseId, user);
        return repository.findByTenantIdAndCaseId(user.tenantId(), caseId)
                .map(this::toResponse)
                .orElseGet(() -> new CaseCanvasDtos.CaseCanvasResponse(
                        caseId, 0, new CaseCanvasDtos.CanvasPayload(List.of(), List.of(), new CaseCanvasDtos.Viewport(0, 0, 0.85)), null
                ));
    }

    @Transactional
    public CaseCanvasDtos.CaseCanvasResponse save(
            UUID caseId,
            CaseCanvasDtos.SaveCanvasRequest request,
            AuthenticatedUser user
    ) {
        requireCase(caseId, user);
        validateGraph(request.canvas(), caseId, user.tenantId());

        CaseCanvas canvas = repository.findByTenantIdAndCaseId(user.tenantId(), caseId).orElse(null);
        if (canvas == null) {
            if (request.expectedVersion() != 0) throw conflict("Sakslerretet er endret. Last inn siste versjon.");
            canvas = new CaseCanvas(user.tenantId(), caseId, user.userId(), writePayload(request.canvas()));
        } else {
            if (canvas.getVersion() != request.expectedVersion()) throw conflict("Sakslerretet er endret av en annen økt.");
            canvas.replace(writePayload(request.canvas()), user.userId());
        }

        CaseCanvas saved;
        try {
            saved = repository.saveAndFlush(canvas);
        } catch (ObjectOptimisticLockingFailureException | DataIntegrityViolationException concurrentWrite) {
            throw conflict("Sakslerretet ble endret samtidig. Last inn siste versjon.");
        }
        auditService.record(
                user.tenantId(), caseId, user.userId(), "CASE_CANVAS_SAVED", "CASE_CANVAS", saved.getId(),
                "{\"version\":" + saved.getVersion() + ",\"nodeCount\":" + request.canvas().nodes().size()
                        + ",\"edgeCount\":" + request.canvas().edges().size() + "}"
        );
        return toResponse(saved);
    }

    private void validateGraph(CaseCanvasDtos.CanvasPayload payload, UUID caseId, UUID tenantId) {
        Set<UUID> nodeIds = new HashSet<>();
        for (CaseCanvasDtos.CanvasNode node : payload.nodes()) {
            if (!nodeIds.add(node.id())) throw badRequest("Duplisert node-id.");
        }
        Set<UUID> edgeIds = new HashSet<>();
        for (CaseCanvasDtos.CanvasEdge edge : payload.edges()) {
            if (!edgeIds.add(edge.id())) throw badRequest("Duplisert relasjons-id.");
            if (edge.source().equals(edge.target()) || !nodeIds.contains(edge.source()) || !nodeIds.contains(edge.target())) {
                throw badRequest("Relasjoner må peke på to eksisterende, ulike noder.");
            }
        }

        List<CaseCanvasDtos.SourceRef> requested = payload.nodes().stream()
                .map(CaseCanvasDtos.CanvasNode::source)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (requested.isEmpty()) return;
        Collection<String> ids = requested.stream().map(CaseCanvasDtos.SourceRef::sourceUnitId).distinct().toList();
        List<DocumentSourceUnit> units = sourceUnitRepository
                .findByTenantIdAndSourceUnitIdInOrderByPageNumberAscSourceUnitIdAsc(tenantId, ids);
        for (CaseCanvasDtos.SourceRef source : requested) {
            boolean valid = units.stream().anyMatch(unit ->
                    caseId.equals(unit.getCaseId())
                            && source.documentId().equals(unit.getDocumentId())
                            && source.sourceUnitId().equals(unit.getSourceUnitId())
                            && source.pageNumber().equals(unit.getPageNumber()));
            if (!valid) throw badRequest("En kildehenvisning tilhører ikke den aktive saken eller er ikke kildeklar.");
        }
    }

    private void requireCase(UUID caseId, AuthenticatedUser user) {
        caseFileRepository.findByIdAndTenantId(caseId, user.tenantId())
                .filter(caseFile -> !"DELETED".equals(caseFile.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saken finnes ikke."));
    }

    private String writePayload(CaseCanvasDtos.CanvasPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Kunne ikke serialisere sakslerretet.", exception);
        }
    }

    private CaseCanvasDtos.CaseCanvasResponse toResponse(CaseCanvas canvas) {
        try {
            return new CaseCanvasDtos.CaseCanvasResponse(
                    canvas.getCaseId(), canvas.getVersion(),
                    objectMapper.readValue(canvas.getCanvasJson(), CaseCanvasDtos.CanvasPayload.class), canvas.getUpdatedAt()
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Lagret sakslerret har ugyldig format.", exception);
        }
    }

    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
