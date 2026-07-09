
Phase 02 — Backend Verification Foundation + CI
Objective

Ensure the Spring Boot backend can be tested deterministically by any developer or CI environment.

This phase prevents false green by making backend verification a first-class gate.

Correct paths
$RepoRoot = "F:\prosjekter_MAIN\EVIDA"
$BackendRootCandidate = "F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api"
Scope

In scope:

identify Maven root
add Maven wrapper only at correct ownership boundary if missing
make backend tests runnable
add CI workflow or local CI script
document backend test command
ensure frontend regression command is documented
ensure reports distinguish backend verified vs not-run

Out of scope:

feature development
UI polish
document lifecycle work
OCR/parser work
Investigation
cd "F:\prosjekter_MAIN\EVIDA"

Get-ChildItem -Recurse -Filter pom.xml | Select-Object FullName
Get-ChildItem -Recurse -Filter mvnw* | Select-Object FullName
Get-ChildItem -Recurse -Filter package.json | Select-Object FullName
git status --short
Maven root decision

Codex must choose one:

## Maven root decision
- pom.xml files found:
- selected Maven root:
- reason:
- wrapper location:
- test command:
- rejected alternatives:

Rules:

If there is a parent/root pom.xml that includes evida-core/services/saksrom-api, use root.
If saksrom-api is standalone, use that module root.
Do not create wrapper in both root and module unless repo already uses that structure.
Do not add wrapper under apps/web.
Adding Maven wrapper

If global Maven exists and wrapper is missing, generate wrapper at selected Maven root:

mvn -N wrapper:wrapper

If Maven does not exist, do not fake wrapper files manually unless the repo already contains a known trusted wrapper template.

Instead mark blocked and provide fallback:

Install Maven
or run containerized Maven
or add wrapper from a trusted Maven environment
Optional containerized Maven fallback

If Docker exists, add:

scripts/test-backend.ps1

Stub:

param(
  [string]$BackendPath = "evida-core/services/saksrom-api"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProjectPath = Join-Path $RepoRoot $BackendPath

docker run --rm `
  -v "${ProjectPath}:/workspace" `
  -w /workspace `
  maven:3.9-eclipse-temurin-21 `
  mvn test

Adjust Java version to actual pom.xml.

Backend test requirements

Run:

cd "<selected-maven-root>"
.\mvnw test

or:

mvn test

Report:

## Backend verification
- command:
- result:
- tests run:
- failures:
- errors:
- skipped:
CI workflow

If repo uses GitHub Actions, add:

.github/workflows/backend-web-ci.yml

Stub:

name: Backend and Web CI

on:
  pull_request:
  push:
    branches:
      - main
      - master
      - develop

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: evida-core/services/saksrom-api
    steps:
      - uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: maven

      - name: Test backend
        run: ./mvnw test

  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: apps/web/package-lock.json

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test -- --run

      - name: Build
        run: npm run build

Adjust working directory, Java version, Node version, and lockfile path.

If repo does not use GitHub Actions, create:

docs/runbooks/ci-verification.md

instead of adding workflow files.

Required docs

Create/update:

docs/runbooks/local-backend-verification.md

Content must include:

# Local Backend Verification

## Backend root

## Prerequisites

## Test command

## Expected success

## Common failures

## How to run web regression

## What does not count as backend verification
- frontend build
- frontend tests
- dev server HTTP 200
- code inspection
Verification commands

Backend:

cd "<selected-maven-root>"
.\mvnw test

Web:

cd "F:\prosjekter_MAIN\EVIDA\apps\web"
npm run lint
npm run test -- --run
npm run build
Report file

Write:

docs/codex-reports/2026-07-02_backend_verification_and_ci.md
Terminal states
succeeded
backend deterministic test command exists
backend tests pass
docs updated
CI or local CI runbook exists
web regression passes if in scope
partial
deterministic path improved but backend tests still fail
or backend command exists but CI not added
failed
backend tests run and expose code failure
blocked
no Maven/wrapper/container path can be established safely
Next phase

Run:

03_DOCUMENT_LIFECYCLE_V1.md
