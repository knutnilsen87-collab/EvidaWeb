
Phase 01 — Upload E2E + Local Quarantine Storage
Objective

Make document upload work end-to-end for the local prototype:

Web UI
→ /api/documents/upload
→ Spring Boot controller
→ tenant guard
→ validation
→ local quarantine storage
→ Document metadata persistence
→ QUARANTINE response
→ UI success state/list refresh

This phase must prove that the document uploader actually works.

Do not claim success from code inspection alone.

Correct paths
$RepoRoot = "F:\prosjekter_MAIN\EVIDA"
$WebRoot = "F:\prosjekter_MAIN\EVIDA\apps\web"
$BackendRootCandidate = "F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api"
Start commands
cd "F:\prosjekter_MAIN\EVIDA"
Get-Location
Get-ChildItem
git status --short
Scope

In scope:

local quarantine file storage
upload controller/service completion
tenant-aware metadata persistence
tenant-aware document list endpoint if missing
frontend upload success state based on backend response
Vite /api dev proxy if missing
targeted backend tests
targeted frontend tests
direct backend smoke upload
browser/UI smoke upload
wrong-tenant rejection smoke

Out of scope:

OCR
PDF parsing
vector index
RAG
source approval workflow
production S3
OIDC/RBAC
UI redesign
DOCX export
Investigation commands
cd "F:\prosjekter_MAIN\EVIDA"

Get-ChildItem -Recurse -Filter pom.xml
Get-ChildItem -Recurse -Filter mvnw*

Get-ChildItem -Recurse -Path ".\apps\web\src" -Include "*.ts","*.tsx" |
  Select-String -Pattern "uploadDocument|uploadDocuments|QuarantineGate|fetchCaseDocuments|approveDocumentSource|X-Evida-Tenant-ID"

Get-ChildItem -Recurse -Path ".\evida-core\services\saksrom-api\src\main\java" -Include "*.java" |
  Select-String -Pattern "DocumentController|DocumentQuarantineService|DocumentRepository|DocumentParser|upload|QUARANTINE|TenantContext|X-Evida-Tenant-ID"
Required repo-health decision before coding

Write this in the final report before implementation summary:

## Pre-patch ownership decision
- Backend upload owner:
- Backend storage owner:
- Backend metadata owner:
- Frontend upload owner:
- Existing DTO reused:
- Existing repository reused:
- New files justified:
Backend ownership

Prefer existing package:

evida-core/services/saksrom-api/src/main/java/no/saksrom/api/document/

Possible files:

DocumentController.java
DocumentQuarantineService.java
DocumentRepository.java
Document.java
DocumentStatus.java
DocumentResponse.java
LocalQuarantineStorage.java
QuarantineStorageProperties.java

Do not create duplicate packages:

document2
upload2
newdocument
temp
misc
helpers
Backend implementation contract
Local storage config

Add if missing:

evida:
  storage:
    quarantine-root: ${EVIDA_QUARANTINE_ROOT:./data/quarantine}
Storage properties stub

Use only if no existing config class exists.

package no.saksrom.api.document;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "evida.storage")
public class QuarantineStorageProperties {
    private String quarantineRoot = "./data/quarantine";

    public String getQuarantineRoot() {
        return quarantineRoot;
    }

    public void setQuarantineRoot(String quarantineRoot) {
        this.quarantineRoot = quarantineRoot;
    }
}

Register using existing Spring convention. If none exists, add:

@EnableConfigurationProperties(QuarantineStorageProperties.class)

to the application class or existing config class.

Local storage component stub

Use only if physical storage is missing.

package no.saksrom.api.document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class LocalQuarantineStorage {
    private final QuarantineStorageProperties properties;

    public LocalQuarantineStorage(QuarantineStorageProperties properties) {
        this.properties = properties;
    }

    public StoredDocument store(
            MultipartFile file,
            String tenantId,
            String caseId,
            UUID documentId
    ) throws IOException {
        String safeTenant = sanitizePathSegment(tenantId);
        String safeCase = caseId == null || caseId.isBlank()
                ? "_no_case"
                : sanitizePathSegment(caseId);

        Path root = Path.of(properties.getQuarantineRoot()).toAbsolutePath().normalize();
        Path tenantDir = root.resolve(safeTenant).resolve(safeCase).normalize();

        if (!tenantDir.startsWith(root)) {
            throw new IllegalArgumentException("Invalid storage path");
        }

        Files.createDirectories(tenantDir);

        String originalFilename = file.getOriginalFilename() == null
                ? "upload.bin"
                : file.getOriginalFilename();

        String extension = safeExtension(originalFilename);
        Path target = tenantDir.resolve(documentId + extension).normalize();

        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("Invalid target path");
        }

        byte[] bytes = file.getBytes();
        String sha256 = sha256(bytes);
        Files.write(target, bytes);

        return new StoredDocument(
                target.toString(),
                sha256,
                file.getSize(),
                file.getContentType(),
                originalFilename
        );
    }

    private static String sanitizePathSegment(String value) {
        if (value == null || value.isBlank()) {
            return "_unknown";
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private static String safeExtension(String filename) {
        int index = filename.lastIndexOf('.');
        if (index < 0 || index == filename.length() - 1) {
            return ".bin";
        }

        String ext = filename.substring(index).toLowerCase();

        if (!ext.matches("\\.[a-z0-9]{1,12}")) {
            return ".bin";
        }

        return ext;
    }

    private static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to calculate sha256", ex);
        }
    }

    public record StoredDocument(
            String storagePath,
            String sha256,
            long size,
            String contentType,
            String originalFilename
    ) {}
}

If existing code already calculates SHA-256, reuse it.

Upload service behavior

Expected behavior:

public Document upload(MultipartFile file, String tenantId, String caseId, AuthenticatedUser user) {
    validateTenant(tenantId, user);
    validateFile(file);

    UUID documentId = UUID.randomUUID();
    StoredDocument stored = storage.store(file, tenantId, caseId, documentId);

    Document doc = new Document();
    doc.setId(documentId);
    doc.setTenantId(tenantId);
    doc.setCaseId(caseId);
    doc.setOriginalFilename(stored.originalFilename());
    doc.setContentType(stored.contentType());
    doc.setSizeBytes(stored.size());
    doc.setFileHash(stored.sha256());
    doc.setStoragePath(stored.storagePath());
    doc.setStatus(DocumentStatus.QUARANTINE);
    doc.setUploadedBy(user.id());
    doc.setCreatedAt(Instant.now());
    doc.setUpdatedAt(Instant.now());

    return repository.save(doc);
}

Adjust field names to existing Document.

Do not create duplicate fields if equivalents exist.

Validation requirements

At minimum:

private void validateFile(MultipartFile file) {
    if (file == null || file.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required");
    }

    if (file.getSize() > maxUploadBytes) {
        throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File too large");
    }

    String contentType = file.getContentType();
    if (!isAllowedContentType(contentType)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported file type");
    }
}

Allowed local prototype MIME types:

application/pdf
text/plain
image/png
image/jpeg
application/vnd.openxmlformats-officedocument.wordprocessingml.document

Hard rules:

Do not trust original filename as path.
Do not allow path traversal.
Do not allow executable file types.
Do not mark upload as VERIFIED.
Upload returns QUARANTINE.
Response DTO

Use existing response object if present. Otherwise:

package no.saksrom.api.document;

import java.time.Instant;
import java.util.UUID;

public record DocumentResponse(
        UUID id,
        String originalFilename,
        String status,
        String fileHash,
        String tenantId,
        String caseId,
        Long sizeBytes,
        String contentType,
        Instant createdAt
) {
    public static DocumentResponse from(Document doc) {
        return new DocumentResponse(
                doc.getId(),
                doc.getOriginalFilename(),
                doc.getStatus().name(),
                doc.getFileHash(),
                doc.getTenantId(),
                doc.getCaseId(),
                doc.getSizeBytes(),
                doc.getContentType(),
                doc.getCreatedAt()
        );
    }
}
Controller contract

Use existing controller if present.

Expected endpoints:

@PostMapping(path = {"/api/documents/upload", "/api/v1/documents/upload"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public DocumentResponse upload(
        @RequestParam("file") MultipartFile file,
        @RequestHeader("X-Evida-Tenant-ID") String tenantId,
        @RequestHeader(value = "X-Evida-Case-ID", required = false) String caseId
) {
    AuthenticatedUser user = currentUserService.currentUser();
    Document doc = quarantineService.upload(file, tenantId, caseId, user);
    return DocumentResponse.from(doc);
}

@GetMapping("/api/documents")
public List<DocumentResponse> list(
        @RequestHeader("X-Evida-Tenant-ID") String tenantId,
        @RequestParam(value = "caseId", required = false) String caseId
) {
    AuthenticatedUser user = currentUserService.currentUser();
    return quarantineService.listForTenant(tenantId, caseId, user)
            .stream()
            .map(DocumentResponse::from)
            .toList();
}
Frontend contract

Likely file:

apps/web/src/lib/api.ts

Expected shape:

export type DocumentStatus =
  | 'QUARANTINE'
  | 'VERIFIED'
  | 'REJECTED'
  | 'APPROVED_FOR_INGESTION'
  | 'INGESTING'
  | 'INGESTION_FAILED'
  | 'SOURCE_READY';

export interface CaseDocument {
  id: string;
  originalFilename?: string;
  filename?: string;
  status: DocumentStatus;
  fileHash?: string;
  tenantId?: string;
  caseId?: string | null;
  sizeBytes?: number;
  contentType?: string;
  createdAt?: string;
}

export async function uploadDocument(file: File, tenantId: string, caseId?: string): Promise<CaseDocument> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: {
      ...getHeaders(tenantId),
      ...(caseId ? { 'X-Evida-Case-ID': caseId } : {}),
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Upload failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchCaseDocuments(tenantId: string, caseId?: string): Promise<CaseDocument[]> {
  const params = new URLSearchParams();

  if (caseId) {
    params.set('caseId', caseId);
  }

  const url = params.toString()
    ? `/api/documents?${params.toString()}`
    : '/api/documents';

  const response = await fetch(url, {
    headers: getHeaders(tenantId),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.status}`);
  }

  return response.json();
}

Do not set Content-Type manually for multipart upload.

QuarantineGate behavior

Likely file:

apps/web/src/components/QuarantineGate.tsx

Required states:

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
type UploadState = 'idle' | 'uploading' | 'success' | 'error';

After successful upload:

show success
refresh from backend list endpoint
if refresh fails, add returned backend document into local list
never show upload success based only on mock

Example pattern:

const [documents, setDocuments] = useState<CaseDocument[]>([]);
const [loadState, setLoadState] = useState<LoadState>('idle');
const [uploadState, setUploadState] = useState<UploadState>('idle');
const [error, setError] = useState<string | null>(null);

async function refreshDocuments() {
  setLoadState('loading');

  try {
    const items = await fetchCaseDocuments(user.tenantId, activeCaseId);
    setDocuments(items);
    setLoadState('loaded');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Could not load documents');
    setLoadState('error');
  }
}

async function handleUpload(file: File) {
  setUploadState('uploading');
  setError(null);

  try {
    const uploaded = await uploadDocument(file, user.tenantId, activeCaseId);

    try {
      await refreshDocuments();
    } catch {
      setDocuments((prev) => [uploaded, ...prev]);
    }

    setUploadState('success');
  } catch (err) {
    setUploadState('error');
    setError(err instanceof Error ? err.message : 'Upload failed');
  }
}
Mock data rule

Production path must not silently show mock documents.

Allowed dev-only fallback:

const allowMockDocuments =
  import.meta.env.DEV && import.meta.env.VITE_ALLOW_MOCK_DOCUMENTS === 'true';
Vite proxy

If missing, add to apps/web/vite.config.ts:

server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
      changeOrigin: true,
    },
  },
},

Merge with existing config.

Backend tests

Minimum tests:

successful upload returns QUARANTINE
upload writes metadata
upload writes file to quarantine storage
wrong tenant rejected
empty file rejected
Frontend tests

Minimum tests:

upload API sends tenant header
QuarantineGate displays success from backend response
QuarantineGate displays upload error
Verification commands

Backend:

cd "F:\prosjekter_MAIN\EVIDA"
Get-ChildItem -Recurse -Filter pom.xml
Get-ChildItem -Recurse -Filter mvnw*

If backend module owns wrapper:

cd "F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api"
.\mvnw test

If repo root owns wrapper:

cd "F:\prosjekter_MAIN\EVIDA"
.\mvnw test

If only global Maven exists:

cd "F:\prosjekter_MAIN\EVIDA\evida-core\services\saksrom-api"
mvn test

Frontend:

cd "F:\prosjekter_MAIN\EVIDA\apps\web"
npm run lint
npm run test -- --run
npm run build
Direct backend smoke test

Start backend on 127.0.0.1:8080.

Create test file:

Set-Content -Path "$env:TEMP\evida-upload-smoke.txt" -Value "EVIDA upload smoke test"

Upload:

curl.exe -i `
  -X POST "http://127.0.0.1:8080/api/documents/upload" `
  -H "X-Evida-Tenant-ID: tenant-dev" `
  -H "Authorization: Bearer dev-token" `
  -F "file=@$env:TEMP\evida-upload-smoke.txt;type=text/plain"

Expected:

HTTP 200 or 201
status = QUARANTINE
id exists
fileHash exists
tenantId = tenant-dev
storage file exists
metadata exists

Wrong tenant:

curl.exe -i `
  -X POST "http://127.0.0.1:8080/api/documents/upload" `
  -H "X-Evida-Tenant-ID: wrong-tenant" `
  -H "Authorization: Bearer dev-token" `
  -F "file=@$env:TEMP\evida-upload-smoke.txt;type=text/plain"

Expected:

401/403/4xx
no cross-tenant document created
Browser smoke test

Start backend.

Start web:

cd "F:\prosjekter_MAIN\EVIDA\apps\web"
npm run dev

Open:

http://127.0.0.1:5173

Steps:

Navigate to Import/Dokumentkontroll/QuarantineGate.
Upload evida-upload-smoke.txt.
Confirm uploading state appears.
Confirm success appears.
Confirm document appears with QUARANTINE.
Confirm no CORS/proxy error.
Refresh and confirm document remains visible if list endpoint exists.
Report file

Write:

docs/codex-reports/2026-07-02_upload_e2e_local_quarantine.md
Success criteria

succeeded only if:

backend tests pass
frontend lint/test/build pass
direct backend upload smoke passes
wrong-tenant smoke is rejected
browser/UI upload smoke passes
file exists in quarantine storage
metadata is persisted

If implementation is done but smoke is not run, terminal state is:

partial — implemented_not_verified
Next phase

Run:

02_BACKEND_VERIFICATION_AND_CI.md
