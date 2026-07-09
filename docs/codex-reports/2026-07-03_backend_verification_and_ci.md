# Codex Report - backend_verification_and_ci

## Metadata
- generated_at: 2026-07-03T08:46:00+02:00
- repo_root: F:\prosjekter_MAIN\EVIDA
- web_root: F:\prosjekter_MAIN\EVIDA\apps\web
- branch: calm-surface-readiness-document-control
- phase: 02_BACKEND_VERIFICATION_AND_CI
- terminal_state: succeeded

## Maven root decision
- pom.xml files found: active backend module at `evida-core/services/saksrom-api/pom.xml`; other `pom.xml` files are archived legacy/staging copies.
- selected Maven root: `evida-core/services/saksrom-api`
- reason: no active parent Maven aggregator exists for the Spring Boot module.
- wrapper location: `evida-core/services/saksrom-api/mvnw` and `mvnw.cmd`
- test command: `.\mvnw.cmd test` locally, `./mvnw test` in CI.
- rejected alternatives: repo-root wrapper, `apps/web`, legacy archived Spring Boot copies.

## Executive summary
Backend verification is now deterministic through the module-owned Maven wrapper. Existing GitHub Actions CI was updated to use `./mvnw test` for Spring Boot and now includes `apps/web` install/lint/test/build as a separate web gate.

## Files changed
- `.github/workflows/ci.yml`
- `docs/runbooks/local-backend-verification.md`
- this report

## Commands run
- `cd evida-core/services/saksrom-api; .\mvnw.cmd test`
- `cd apps/web; npm run lint; npm run test -- --run; npm run build`

## Test results
- Backend: PASS, 31 tests, 0 failures, 0 errors, 0 skipped.
- Web lint: PASS.
- Web tests: PASS, 19 files / 55 tests.
- Web build: PASS.

## Smoke results
- Not applicable for phase 02 beyond deterministic command verification.

## Security checks
- CI continues to include existing `gitleaks/gitleaks-action@v2`.
- Dependency review job remains for pull requests.

## Repo-health verdict
improved

## Remaining limitations
- CI was not executed remotely from GitHub in this local session.
- `spring-boot:run` still has a Windows emoji-path classpath issue; backend tests are unaffected.

## Ambiguity flags
- Existing CI still includes legacy desktop/AI jobs; they were left intact.

## Recommended next action
Run phase 03 document lifecycle implementation.

## Fallback action
If CI cannot execute `./mvnw`, set executable bit for `mvnw` in Git on a Unix-capable environment.

## Stop path signal
No stop. Continue to phase 03.
