$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tenant = '00000000-0000-0000-0000-000000000101'
$wrongTenant = '00000000-0000-0000-0000-000000000999'
$caseId = $null
$port = 18102
$base = "http://127.0.0.1:$port"
$tempRoot = Join-Path $env:TEMP ('evida-phase05-court-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot 'data') | Out-Null

$jar = Join-Path $tempRoot 'evida-api.jar'
Copy-Item -LiteralPath (Join-Path $repo 'evida-core\services\saksrom-api\target\evida-api-0.1.0.jar') -Destination $jar
$pdf = Join-Path $tempRoot 'source-text.pdf'
Copy-Item -LiteralPath (Join-Path $repo 'Evida_Aurora_tailored_practical_import_test_pack\evida_tailored_aurora_test_pack\01_MEDIUM_import_fullfort_kontroll_kreves\UPLOAD_THIS_FOLDER\01_pdf_tekstlag\PDF_010_rapport.pdf') -Destination $pdf

$dbPath = (Join-Path $tempRoot 'data\evida-dev') -replace '\\','/'
$quarantine = (Join-Path $tempRoot 'quarantine') -replace '\\','/'
$outLog = Join-Path $tempRoot 'server.out.log'
$errLog = Join-Path $tempRoot 'server.err.log'

$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = 'java.exe'
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$javaArgs = @(
    '-jar',
    $jar,
    '--spring.profiles.active=dev',
    "--server.port=$port",
    '--evida.security.local-dev-mode=true',
    '--evida.documents.raw-upload-allowed=true',
    "--spring.datasource.url=jdbc:h2:file:$dbPath;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
    "--evida.storage.quarantine-root=$quarantine"
)
$processInfo.Arguments = ($javaArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '

$serverProcess = [System.Diagnostics.Process]::new()
$serverProcess.StartInfo = $processInfo
$null = $serverProcess.Start()
$stdout = $serverProcess.StandardOutput.ReadToEndAsync()
$stderr = $serverProcess.StandardError.ReadToEndAsync()

try {
    $ready = $false
    for ($i = 0; $i -lt 75; $i++) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri "$base/actuator/health" -TimeoutSec 2
            if ($health.status -eq 'UP') {
                $ready = $true
                break
            }
        } catch {}
        if ($serverProcess.HasExited) {
            throw 'Server exited early'
        }
    }
    if (-not $ready) {
        throw 'Server did not become ready'
    }

    $requestIdHeaders = Join-Path $tempRoot 'request-id.headers'
    $requestIdStatus = & curl.exe -sS -o NUL -D "$requestIdHeaders" -w "%{http_code}" "$base/actuator/health" -H "X-Request-ID: smoke-request-id"
    $requestIdHeaderText = Get-Content -Raw -Path $requestIdHeaders
    if ($requestIdStatus -ne '200' -or $requestIdHeaderText -notmatch '(?im)^X-Request-ID:\s*smoke-request-id\s*$') {
        throw "request id header missing: status=$requestIdStatus headers=$requestIdHeaderText"
    }

    $me = Invoke-RestMethod -Method Get -Uri "$base/api/auth/me" -Headers @{ 'X-Evida-Authenticated-Tenant-ID' = $tenant }
    if ([string]$me.tenantId -ne $tenant) {
        throw "auth me tenant mismatch: $($me | ConvertTo-Json -Compress)"
    }

    $tenantHeaders = @{
        'X-Evida-Tenant-ID' = $tenant
        'X-Evida-Authenticated-Tenant-ID' = $tenant
    }
    $caseBodyPath = Join-Path $tempRoot 'case.json'
    ([ordered]@{ title = 'Court Engine smoke case' } | ConvertTo-Json -Depth 4 -Compress) | Set-Content -Path $caseBodyPath -Encoding UTF8
    $caseRaw = & curl.exe -sS -X POST "$base/api/v1/cases" -H "X-Evida-Authenticated-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$caseBodyPath"
    $case = $caseRaw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$case.id)) {
        throw "case creation missing id: $caseRaw"
    }
    $caseId = [string]$case.id

    $uploadRaw = & curl.exe -sS -X POST "$base/api/documents/upload" -H "X-Evida-Tenant-ID: $tenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant" -H "X-Evida-Case-ID: $caseId" -F "file=@$pdf;type=application/pdf"
    $upload = $uploadRaw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$upload.id)) {
        throw "upload missing id: $uploadRaw"
    }
    $documents = @(Invoke-RestMethod -Method Get -Uri "$base/api/documents?caseId=$caseId" -Headers $tenantHeaders)
    if ($documents.Count -lt 1) {
        throw 'document list missing uploaded document'
    }
    $detail = Invoke-RestMethod -Method Get -Uri "$base/api/documents/$($upload.id)" -Headers $tenantHeaders
    if ([string]$detail.id -ne [string]$upload.id) {
        throw "document detail mismatch: $($detail | ConvertTo-Json -Compress)"
    }
    $downloadPath = Join-Path $tempRoot 'downloaded.pdf'
    $downloadStatus = & curl.exe -sS -o "$downloadPath" -w "%{http_code}" "$base/api/documents/$($upload.id)/download" -H "X-Evida-Tenant-ID: $tenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant"
    if ($downloadStatus -ne '200' -or -not (Test-Path $downloadPath)) {
        throw "download failed with status $downloadStatus"
    }

    $approveRaw = & curl.exe -sS -X POST "$base/api/documents/$($upload.id)/approve" -H "X-Evida-Tenant-ID: $tenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant"
    $approve = $approveRaw | ConvertFrom-Json
    if ($approve.status -ne 'PENDING' -or [string]::IsNullOrWhiteSpace([string]$approve.id)) {
        throw "approve unexpected: $approveRaw"
    }
    $job = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $job = Invoke-RestMethod -Method Get -Uri "$base/api/ingestion-jobs/$($approve.id)" -Headers $tenantHeaders
        if ($job.status -eq 'COMPLETED' -or $job.status -eq 'FAILED') {
            break
        }
    }
    if ($null -eq $job -or $job.status -ne 'COMPLETED') {
        throw "ingestion job did not complete: $($job | ConvertTo-Json -Compress)"
    }

    $unitsRaw = & curl.exe -sS "$base/api/documents/$($upload.id)/source-units" -H "X-Evida-Tenant-ID: $tenant"
    $sourceUnitIds = @([regex]::Matches($unitsRaw, '"sourceUnitId"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    if ($sourceUnitIds.Count -lt 1) {
        throw 'source units missing'
    }
    $selected = [string]$sourceUnitIds[0]
    if ([string]::IsNullOrWhiteSpace($selected)) {
        throw "selected sourceUnitId missing: $unitsRaw"
    }

    $query = 'rapport'
    if ($unitsRaw -notmatch '(?i)rapport') {
        $match = [regex]::Match($unitsRaw, '[A-Za-z0-9]{4,}')
        if ($match.Success) {
            $query = $match.Value
        } else {
            throw 'no searchable token in source unit'
        }
    }
    $encoded = [uri]::EscapeDataString($query)
    $search = @(Invoke-RestMethod -Method Get -Uri "$base/api/source-units/search?caseId=$caseId&q=$encoded" -Headers $tenantHeaders)
    if ($search.Count -lt 1 -or $search[0].searchMode -ne 'keyword_v1') {
        throw "search unexpected: $($search | ConvertTo-Json -Compress)"
    }

    $askBodyPath = Join-Path $tempRoot 'ask.json'
    ([ordered]@{ caseId = $caseId; question = "Hva sier valgt kilde om $query?"; selectedSourceUnitIds = @($selected); mode = 'sporre' } | ConvertTo-Json -Depth 6 -Compress) | Set-Content -Path $askBodyPath -Encoding UTF8
    $askRaw = & curl.exe -sS -X POST "$base/api/saksrom/ask" -H "X-Evida-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$askBodyPath"
    $ask = $askRaw | ConvertFrom-Json
    if ($ask.sourceBound -ne $true) {
        throw "ask not source-bound selected=[$selected] body=$(Get-Content -Raw $askBodyPath) response=$askRaw"
    }
    if ([string]@($ask.sources)[0].sourceUnitId -ne $selected) {
        throw "ask source mismatch selected=[$selected] response=$askRaw"
    }

    $clientEvents = @(
        @{ eventType = 'CITATION_OPENED'; entityType = 'SOURCE_UNIT'; metadataJson = (@{ sourceUnitId = $selected; page = 1 } | ConvertTo-Json -Compress) },
        @{ eventType = 'EXPORT_CREATED'; entityType = 'DOCX_EXPORT'; metadataJson = (@{ format = 'docx'; sourceBound = $true } | ConvertTo-Json -Compress) },
        @{ eventType = 'ADMIN_ACTION'; entityType = 'SYSTEM'; metadataJson = (@{ action = 'smoke_release_gate' } | ConvertTo-Json -Compress) },
        @{ eventType = 'USER_LOGOUT'; entityType = 'USER'; metadataJson = (@{ reason = 'smoke_complete' } | ConvertTo-Json -Compress) }
    )
    foreach ($clientEvent in $clientEvents) {
        $eventBodyPath = Join-Path $tempRoot ($clientEvent.eventType + '.json')
        ([ordered]@{
            eventType = $clientEvent.eventType
            caseId = $caseId
            entityType = $clientEvent.entityType
            metadataJson = $clientEvent.metadataJson
        } | ConvertTo-Json -Depth 6 -Compress) | Set-Content -Path $eventBodyPath -Encoding UTF8
        $eventRaw = & curl.exe -sS -X POST "$base/api/v1/audit/client-event" -H "X-Evida-Authenticated-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$eventBodyPath"
        $eventResponse = $eventRaw | ConvertFrom-Json
        if ($eventResponse.eventType -ne $clientEvent.eventType) {
            throw "client audit event unexpected: $eventRaw"
        }
    }

    $noSourceBodyPath = Join-Path $tempRoot 'no-source.json'
    ([ordered]@{ caseId = $caseId; question = 'zzzz_unmatched_no_source_basis'; selectedSourceUnitIds = @(); mode = 'sporre' } | ConvertTo-Json -Depth 6 -Compress) | Set-Content -Path $noSourceBodyPath -Encoding UTF8
    $noSource = (& curl.exe -sS -X POST "$base/api/saksrom/ask" -H "X-Evida-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$noSourceBodyPath") | ConvertFrom-Json
    if ($noSource.sourceBound -ne $false -or -not ($noSource.warnings -contains 'NO_SOURCE_BASIS')) {
        throw "no-source unexpected: $($noSource | ConvertTo-Json -Compress)"
    }

    $analysisBodyPath = Join-Path $tempRoot 'analysis.json'
    ([ordered]@{ caseId = $caseId; fileIds = @([string]$upload.id) } | ConvertTo-Json -Depth 6 -Compress) | Set-Content -Path $analysisBodyPath -Encoding UTF8
    $analysis = (& curl.exe -sS -X POST "$base/api/analysis/start" -H "X-Evida-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$analysisBodyPath") | ConvertFrom-Json
    if ($analysis.analysisStatus -ne 'completed') {
        throw "analysis unexpected: $($analysis | ConvertTo-Json -Compress)"
    }
    $summary = Invoke-RestMethod -Method Get -Uri "$base/api/cases/$caseId/summary" -Headers $tenantHeaders
    if ($summary.caseMetadata.caseId -ne $caseId) {
        throw "summary case mismatch: $($summary | ConvertTo-Json -Compress)"
    }
    $badDocumented = @($summary.operativeSummary.keyFindings) | Where-Object { $_.status -ne 'not_documented' -and @($_.sources).Count -lt 1 }
    if (@($badDocumented).Count -gt 0) {
        throw 'summary has documented finding without source'
    }

    $wrongStatus = & curl.exe -sS -o NUL -w "%{http_code}" "$base/api/source-units/search?caseId=$caseId&q=$encoded" -H "X-Evida-Tenant-ID: $wrongTenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant"
    if ($wrongStatus -ne '403') {
        throw "wrong tenant search expected 403, got $wrongStatus"
    }

    $archive = Invoke-RestMethod -Method Post -Uri "$base/api/documents/$($upload.id)/archive" -Headers $tenantHeaders
    if ($archive.status -ne 'ARCHIVED') {
        throw "archive unexpected: $($archive | ConvertTo-Json -Compress)"
    }

    $auditBodyPath = Join-Path $tempRoot 'audit-verify.json'
    ([ordered]@{ tenantId = $tenant; caseId = $caseId } | ConvertTo-Json -Depth 4 -Compress) | Set-Content -Path $auditBodyPath -Encoding UTF8
    $audit = (& curl.exe -sS -X POST "$base/api/v1/audit/verify" -H 'Content-Type: application/json' --data-binary "@$auditBodyPath") | ConvertFrom-Json
    if ($audit.valid -ne $true -or $audit.eventCount -lt 5) {
        throw "audit verification unexpected: $($audit | ConvertTo-Json -Compress)"
    }
    $globalAuditBodyPath = Join-Path $tempRoot 'audit-verify-global.json'
    ([ordered]@{ tenantId = $tenant; caseId = $null } | ConvertTo-Json -Depth 4 -Compress) | Set-Content -Path $globalAuditBodyPath -Encoding UTF8
    $globalAudit = (& curl.exe -sS -X POST "$base/api/v1/audit/verify" -H 'Content-Type: application/json' --data-binary "@$globalAuditBodyPath") | ConvertFrom-Json
    if ($globalAudit.valid -ne $true -or $globalAudit.eventCount -lt 2) {
        throw "global audit verification unexpected: $($globalAudit | ConvertTo-Json -Compress)"
    }

    [pscustomobject]@{
        status = 'PASS'
        caseId = $caseId
        documentId = $upload.id
        ingestionJobId = $approve.id
        ingestionJobStatus = $job.status
        sourceUnitCount = $sourceUnitIds.Count
        searchResults = $search.Count
        askSourceBound = $ask.sourceBound
        askSourceUnitId = @($ask.sources)[0].sourceUnitId
        analysisStatus = $analysis.analysisStatus
        summaryCaseId = $summary.caseMetadata.caseId
        summaryKeyFindings = @($summary.operativeSummary.keyFindings).Count
        wrongTenantStatus = $wrongStatus
        archiveStatus = $archive.status
        auditValid = $audit.valid
        auditEventCount = $audit.eventCount
        requestIdHeader = 'smoke-request-id'
        clientAuditEvents = $clientEvents.Count
        authTenant = $me.tenantId
        globalAuditValid = $globalAudit.valid
        globalAuditEventCount = $globalAudit.eventCount
    } | ConvertTo-Json -Depth 4
} catch {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        $serverProcess.Kill()
        $serverProcess.WaitForExit(5000) | Out-Null
    }
    Set-Content -Path $outLog -Value $stdout.Result -Encoding UTF8
    Set-Content -Path $errLog -Value $stderr.Result -Encoding UTF8
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "Temp: $tempRoot"
    throw
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        $serverProcess.Kill()
        $serverProcess.WaitForExit(5000) | Out-Null
    }
}
