# Spring Boot Backend Test Report - 2026-07-02

## Bundle metadata

- generated_at: `2026-07-02T20:08:00+02:00`
- generated_by: `Codex`
- branch: `calm-surface-readiness-document-control`
- actual_repo_root: `F:\prosjekter_MAIN\EVIDA`
- actual_web_root: `F:\prosjekter_MAIN\EVIDA\apps\web`
- actual_backend_module: `F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api`
- scope: backend false-green elimination first, web regression only after backend pass

## Executive summary

Backend false-green risk was reduced by adding a deterministic Maven wrapper path to the actual Spring Boot control-plane module, `evida-core/services/saksrom-api`.

The module-level wrapper runs successfully without global Maven, and `.\mvnw.cmd test` passed locally in the corrected repo root.

Closure status: `succeeded`.

## Path correction

The correct repo root for this verification is:

```text
F:\prosjekter_MAIN\EVIDA
```

Do not treat `F:\prosjekter_MAIN\EVIDA` or older mojibake path renderings as the active repo for this result.

Stop signal used in this pass: if the expected `apps\web` folder or `evida-core\services\saksrom-api\pom.xml` was not present under the corrected root, verification would have stopped as `blocked`. Both paths were present, so verification continued.

## Changed files

- `evida-core/services/saksrom-api/mvnw`
- `evida-core/services/saksrom-api/mvnw.cmd`
- `evida-core/services/saksrom-api/.mvn/wrapper/maven-wrapper.properties`
- `docs/SPRING_BOOT_VERIFICATION.md`
- `docs/SPRING_BOOT_BACKEND_TEST_REPORT_2026-07-02.md`
- `status_bundle.txt` was updated on disk, but it is ignored by `.gitignore`.

## Backend module mapping

- Module root: `evida-core/services/saksrom-api`
- POM: `evida-core/services/saksrom-api/pom.xml`
- Spring Boot parent: `org.springframework.boot:spring-boot-starter-parent:3.3.7`
- Java: `21`
- Artifact: `no.saksrom:evida-api:0.1.0`

Relevant surfaces:

- Document upload: `DocumentController.java`
- Tenant guard: `TenantContext.java`, `TenantContextFilter.java`, `CurrentUserService.java`
- Quarantine persistence: `DocumentQuarantineService.java`, `Document.java`, `DocumentRepository.java`, `V003__document_quarantine_status.sql`
- Large document ingestion: `LargeDocumentIngestionService.java`

## Verification log

| Command | Working directory | Result |
|---|---|---|
| `rg --files \| rg '(^\|[\\/])mvnw(\\.cmd)?$|maven-wrapper\\.(jar|properties)$|\\.mvn[\\/]'` | repo root | PASS: no existing Maven wrapper found |
| `java -version` | repo root | PASS: Temurin OpenJDK 21.0.10 |
| `Get-Command mvn` | repo root | PASS: Maven not on PATH, wrapper needed |
| `.\mvnw.cmd -version` | `F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api` | PASS: Apache Maven 3.9.11, Java 21.0.10 |
| `.\mvnw.cmd test` | `F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api` | PASS: 29 tests, 0 failures, 0 errors, 0 skipped; finished 2026-07-02T20:04:29+02:00 |
| `npm run lint` | `apps/web` | PASS: `tsc --noEmit` |
| `npm run test -- --run` | `F:\prosjekter_MAIN\EVIDA\apps\web` | PASS: 19 files, 48 tests |
| `npm run build` | `F:\prosjekter_MAIN\EVIDA\apps\web` | PASS: `tsc && vite build`, 327 modules transformed |

## Backend status

`verified`

This means the current Spring Boot test suite is now runnable and green locally. It does not mean the backend is production-ready.

## Web status

`verified after backend pass`

The web regression was intentionally run only after `.\mvnw.cmd test` passed in the Spring Boot module.

## Still not verified

- Physical quarantine storage
- Real PDF/OCR parser
- Source index / vector index
- Mock-based API replacement with production implementations
- Full E2E flow: import -> quarantine -> ingestion -> source approval -> Saksrom citation jump
- Real OIDC/RBAC/secrets/TLS/rate limiting
- Remote CI after wrapper addition

## Repo-health verdict

`improved`

Reason: the repo now has a deterministic backend test command in the correct module without adding a parallel backend contract or requiring global Maven.

## Next recommended action

Add a CI or ops gate that runs:

```powershell
cd evida-core/services/saksrom-api
.\mvnw.cmd test
```

Then add the next narrow backend test for the first unverified P0 path: physical quarantine storage or PDF/OCR parser failure modes.

## Fallback action

If wrapper download is blocked on another machine, pre-seed the Maven wrapper cache or run the same module command in CI/container with outbound access. Keep backend status blocked in that environment until `.\mvnw.cmd test` passes there.

## Unresolved ambiguity flags

- Existing worktree changes in backend and web were present before this session and were not reviewed as production-ready.
- `status_bundle.txt` is ignored by `.gitignore`, so the tracked evidence is this report plus `docs/SPRING_BOOT_VERIFICATION.md`.
