# Auth Boundary

## Current mode

Prototype/dev by default. Production mode is supported only when `local-dev-mode=false`, a JWT issuer or JWK set is configured, explicit CORS origins are configured, and malware scanner configuration is declared.

## Current authentication source

Local dev mode derives the user from EVIDA dev headers or a fixed dev fallback tenant/user. Production mode requires Spring Security OAuth2 resource server JWT authentication.

## Required production IdP

Use a production IdP that issues JWTs with `tenant_id`, `user_id`, `email`, and roles. Accepted providers can be Entra ID, Auth0, Clerk, or another OIDC-compatible IdP, but issuer/JWK trust must be configured before deployment.

## Token validation

Production startup fails unless `spring.security.oauth2.resourceserver.jwt.issuer-uri` or `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` is configured. `CurrentUserService` requires authenticated JWT principal and tenant/user claims.

## Session expiry

Session expiry is controlled by the IdP token lifetime. EVIDA API does not issue sessions.

## Roles

Minimum roles are `TENANT_ADMIN`, `LAWYER`, `CASE_WORKER`, `VIEWER`, and `SYSTEM_ADMIN`. Legacy dev roles `OWNER`, `ADMIN`, and `USER` are mapped centrally for local compatibility.

## Tenant membership source

Tenant membership is derived from the JWT `tenant_id` claim in production. Every protected request must match `X-Evida-Tenant-ID` to the authenticated tenant.

## Known gaps

- Real production malware scanner adapter must replace `dev-bypass`.
- Per-endpoint RBAC enforcement is centralized but not yet applied to every controller action.
- Audit coverage needs expansion for every protected write action.
- Browser E2E auth tests are not available in this environment.

## Release blocker status

Blocked for production until real IdP, explicit CORS origins, malware scanning, and complete RBAC/audit enforcement are configured.
