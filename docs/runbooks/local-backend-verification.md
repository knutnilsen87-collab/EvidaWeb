# Local Backend Verification

## Backend root

`evida-core/services/saksrom-api`

This module is currently the selected Maven root. The repository does not have a parent Maven root that owns the Spring Boot module.

## Prerequisites

- Java 21
- The module-level Maven wrapper at `evida-core/services/saksrom-api/mvnw.cmd` or `mvnw`
- Network access for Maven dependency resolution on first run

## Test command

From the repository root:

```powershell
cd evida-core/services/saksrom-api
.\mvnw.cmd test
```

On Linux/macOS CI:

```bash
cd evida-core/services/saksrom-api
./mvnw test
```

## Expected success

The command must complete with `BUILD SUCCESS` and report zero failures and zero errors.

## Common failures

- Java version below 21.
- Wrapper files missing or not executable on Linux.
- Maven dependency download blocked by network policy.
- Running `spring-boot:run` directly from the emoji path may fail in this Windows environment with a Maven plugin classpath encoding error. This does not invalidate `mvnw test`, but runtime smoke should use an ASCII path workaround until the path issue is fixed.

## How to run web regression

```powershell
cd apps/web
npm run lint
npm run test -- --run
npm run build
```

## What does not count as backend verification

- Frontend build.
- Frontend tests.
- Dev server HTTP 200.
- Code inspection.
- A successful Vite proxy request without Spring Boot tests.
