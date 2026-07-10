# Saksrom API - Spring Boot control plane

This service is the enterprise backend/control plane for EVIDA.

It manages tenants, users, case metadata, document metadata, audit events, policies, devices, licenses and AI gateway policy.

It is not the default raw-document storage engine.

## Local development

```bash
docker compose up -d postgres
cd evida-core/services/saksrom-api
mvn spring-boot:run
```

Health:

```text
GET http://localhost:8080/actuator/health
```

## Auth and Tenant Contract

Frontend calls must include:

```text
Authorization: Bearer <jwt>
X-Evida-Tenant-ID: <tenant uuid>
```

The backend remains authoritative:

- `/api/auth/me` returns the authenticated user, email, tenant and roles.
- `TenantContextFilter` compares `X-Evida-Tenant-ID` with the authenticated user tenant.
- Requests with cross-tenant mismatch are rejected with HTTP 403.
- `TenantContext` is request-scoped and cleared after every request.
- Legacy `X-Saksrom-Tenant-Id` remains accepted as a compatibility alias, but new clients must use `X-Evida-Tenant-ID`.

## Secure Document Upload

Quarantine-first upload endpoint:

```text
POST /api/documents/upload
POST /api/v1/documents/upload
```

Rules:

- Requires `X-Evida-Tenant-ID`.
- Rejects cross-tenant mismatch with HTTP 403.
- Rejects empty, oversized, unsupported extension and unsupported MIME files.
- Computes streaming SHA-256.
- Returns metadata with status `QUARANTINE`.
- Does not make the document source-ready; manual document control remains required.

## Large PDF Ingestion

Large files are treated as containers:

- `LargeDocumentIngestionService` plans page source units.
- A 10 000 page PDF is decomposed into page-addressable source units.
- Sections default to 250 pages for batch review.
- Stable source unit IDs use `<documentId>_p<pageNumber>`.
- Upload returns source unit mode metadata so the frontend can lazy-render pages.

## PDF parsing and OCR

`PdfBoxDocumentParser` is the active Spring `DocumentParser` bean in the backend. It uses Apache PDFBox for text extraction and Tess4J/Tesseract for OCR fallback when a PDF page contains images but too little extractable text.

OCR configuration:

```text
EVIDA_OCR_ENABLED=true
EVIDA_TESSDATA_PATH=./data/tessdata
EVIDA_TESSERACT_PATH=
EVIDA_OCR_LANGUAGES=nor+eng
EVIDA_PARSER_OCR_TEXT_THRESHOLD_CHARS=40
EVIDA_PARSER_OCR_DPI=300
EVIDA_PARSER_OCR_TIMEOUT_SECONDS=60
EVIDA_PARSER_MAX_PAGES=20000
```

Place `nor.traineddata` and `eng.traineddata` under the configured tessdata path. These traineddata files are runtime assets and must not be committed to the repo; `**/data/tessdata/` is ignored. If tessdata or native Tesseract runtime support is missing, OCR pages fail closed with a precise ingestion error instead of creating guessed or empty source units.

Windows local OCR setup:

```powershell
winget install UB-Mannheim.TesseractOCR
where.exe tesseract
tesseract --version
Test-Path "C:\Program Files\Tesseract-OCR\tessdata"
Test-Path "C:\Program Files\Tesseract-OCR\tessdata\nor.traineddata"
Test-Path "C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata"
$env:EVIDA_TESSDATA_PATH="C:\Program Files\Tesseract-OCR\tessdata"
$env:EVIDA_OCR_LANGUAGES="nor+eng"
$env:EVIDA_TESSERACT_PATH="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

Restart the backend after changing OCR environment variables. The startup probe reports whether OCR is enabled, which Tesseract executable/version was found, whether `nor` and `eng` traineddata are present, and why OCR is not usable when any requirement is missing.

## Default policy

```text
rawDocumentUploadAllowed = false
aiProviderCallsEnabled = false
localFirst = true
```

## P0 endpoints

```text
GET  /actuator/health
GET  /api/auth/me
POST /api/v1/cases
GET  /api/v1/cases
POST /api/v1/documents/hash
POST /api/v1/documents/upload
POST /api/v1/audit/verify
```

## Production notes

Before production:

```text
- enable OAuth2/JWT
- disable local-dev mode
- configure TLS
- configure real secrets
- add rate limiting
- add Testcontainers
- add SAST/dependency scan
- complete threat model
- run mvn test in CI or on a workstation with Maven installed
```
