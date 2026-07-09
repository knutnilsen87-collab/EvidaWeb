# Spring Boot Verification

## Current decision

Spring Boot (`evida-core/services/saksrom-api`) is the canonical enterprise/control-plane backend.

For the current local desktop evaluation build, Spring Boot is treated as a **control-plane milestone** unless a release explicitly says it is included and verified.

Correct repo root for the current verification:

```text
F:\prosjekter_MAIN\EVIDA
```

## Required command

Run before any release that claims Spring Boot/control-plane functionality:

```powershell
cd evida-core/services/saksrom-api
.\mvnw.cmd test
```

The module owns its Maven wrapper so local verification does not depend on a global Maven install.

## Current local status

As of 2026-07-02T20:04:29+02:00:

- Maven is not available on PATH, but the module-level wrapper exists at `evida-core/services/saksrom-api/mvnw.cmd`.
- `.\mvnw.cmd -version` passed and resolved Apache Maven 3.9.11 with Java 21.
- `.\mvnw.cmd test` passed locally.
- Test result: 29 tests run, 0 failures, 0 errors, 0 skipped.
- Verified areas include audit hash, case file service, security mode validation, document upload/controller, quarantine service, large document ingestion, enterprise controller, policy controller, auth/current-user, and tenant context filter.
- This verifies the current Spring Boot test suite only. It does not prove physical quarantine storage, real PDF/OCR parsing, source/vector index, real OIDC/RBAC, TLS, secrets management, rate limiting, or the full import-to-citation E2E flow.

## Release rule

A release may say one of these, but not both:

```text
Spring Boot control plane included and verified: .\mvnw.cmd test passed.
```

or:

```text
Spring Boot control plane is outside this local evaluation build.
```
