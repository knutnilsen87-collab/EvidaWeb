package no.saksrom.api.saksrom;

import no.saksrom.api.audit.AuditService;
import no.saksrom.api.security.AuthenticatedUser;
import no.saksrom.api.security.CurrentUserService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class SaksromController {
    private final CurrentUserService currentUserService;
    private final SourceBoundSaksromService saksromService;
    private final AuditService auditService;

    public SaksromController(CurrentUserService currentUserService, SourceBoundSaksromService saksromService, AuditService auditService) {
        this.currentUserService = currentUserService;
        this.saksromService = saksromService;
        this.auditService = auditService;
    }

    @GetMapping("/source-units/search")
    public List<SourceBoundSaksromService.SourceSearchResult> searchSourceUnits(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestParam(value = "caseId", required = false) String caseId,
            @RequestParam("q") String query
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        return saksromService.search(tenantId, parseUuidOrNull(caseId), query);
    }

    @PostMapping("/saksrom/ask")
    public SourceBoundSaksromService.SaksromAnswerResponse ask(
            @RequestHeader(CurrentUserService.EVIDA_TENANT_HEADER) String tenantHeader,
            @RequestBody SourceBoundSaksromService.SaksromQuestionRequest request
    ) {
        AuthenticatedUser user = currentUserService.currentUser();
        UUID tenantId = requireMatchingTenant(tenantHeader, user);
        auditService.record(
                tenantId,
                parseUuidOrNull(request.caseId()),
                user.userId(),
                "SAKSROM_QUESTION_ASKED",
                "SAKSROM",
                null,
                "{\"mode\":\"" + safe(request.mode()) + "\"}"
        );
        SourceBoundSaksromService.SaksromAnswerResponse answer = saksromService.answer(tenantId, request);
        auditService.record(
                tenantId,
                parseUuidOrNull(request.caseId()),
                user.userId(),
                "SAKSROM_ANSWER_CREATED",
                "SAKSROM",
                null,
                "{\"sourceBound\":" + answer.sourceBound() + ",\"sourceCount\":" + answer.sources().size() + "}"
        );
        return answer;
    }

    private UUID requireMatchingTenant(String tenantHeader, AuthenticatedUser user) {
        UUID requestedTenant = parseUuid(tenantHeader, "TENANT_HEADER_INVALID");
        if (!requestedTenant.equals(user.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant-kontekst stemmer ikke med autentisert bruker.");
        }
        return requestedTenant;
    }

    private UUID parseUuid(String value, String errorCode) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorCode, e);
        }
    }

    private UUID parseUuidOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
