# EVIDA Bulk Ingestion Prompt 5 - Masterdoc Stress Gate (verification only).
# Drives the real Spring Boot backend over HTTP. No production code is touched.
# Phases (run sequentially; state is kept in the artifact dir):
#   generate | serve | masterdoc-start | masterdoc-wait | crash-start | crash-kill |
#   crash-reset | crash-wait | bulk | tenant | failclosed-start | failclosed-wait |
#   shutdown | sql | all
param(
    [Parameter(Mandatory = $true)][string]$Phase,
    [string]$StateDir,
    [int]$WaitMinutes = 8
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tenantA = '00000000-0000-0000-0000-000000000101'
$tenantB = '00000000-0000-0000-0000-000000000202'
$port = 18110
$base = "http://127.0.0.1:$port"
$seed = 50042

if (-not $StateDir) {
    $StateDir = Join-Path $repo ("artifacts\stress\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$statePath = Join-Path $StateDir 'stress-state.json'

function Load-State {
    if (Test-Path $statePath) { return Get-Content -Raw $statePath | ConvertFrom-Json }
    return [pscustomobject]@{}
}
function Save-State($state) {
    $json = $state | ConvertTo-Json -Depth 8
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            Set-Content -Path $statePath -Value $json -Encoding UTF8 -ErrorAction Stop
            return
        } catch {
            if ($attempt -eq 10) { throw }
            Start-Sleep -Milliseconds 300
        }
    }
}
function Set-StateValue($state, [string]$name, $value) {
    if ($state.PSObject.Properties[$name]) { $state.$name = $value }
    else { $state | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}
function Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Write-Output $line
    try { Add-Content -Path (Join-Path $StateDir 'stress-run.log') -Value $line -ErrorAction Stop } catch {}
}
function HeadersFor([string]$tenant) {
    return @{ 'X-Evida-Tenant-ID' = $tenant; 'X-Evida-Authenticated-Tenant-ID' = $tenant }
}
function Api-Get([string]$path, [string]$tenant) {
    return Invoke-RestMethod -Method Get -Uri "$base$path" -Headers (HeadersFor $tenant)
}
function Api-GetStatus([string]$path, [string]$authTenant, [string]$headerTenant) {
    $out = Join-Path $env:TEMP ('evida-probe-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $code = & curl.exe -sS -o $out -w "%{http_code}" "$base$path" -H "X-Evida-Tenant-ID: $headerTenant" -H "X-Evida-Authenticated-Tenant-ID: $authTenant"
        $body = if (Test-Path $out) { Get-Content -Raw $out } else { '' }
        return @{ code = [string]$code; body = [string]$body }
    } finally { Remove-Item $out -ErrorAction SilentlyContinue }
}
function Api-PostStatus([string]$path, [string]$authTenant, [string]$headerTenant) {
    $out = Join-Path $env:TEMP ('evida-probe-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $code = & curl.exe -sS -X POST -o $out -w "%{http_code}" "$base$path" -H "X-Evida-Tenant-ID: $headerTenant" -H "X-Evida-Authenticated-Tenant-ID: $authTenant"
        $body = if (Test-Path $out) { Get-Content -Raw $out } else { '' }
        return @{ code = [string]$code; body = [string]$body }
    } finally { Remove-Item $out -ErrorAction SilentlyContinue }
}
function Upload-File([string]$filePath, [string]$tenant, [string]$caseId) {
    $raw = & curl.exe -sS -X POST "$base/api/documents/upload" `
        -H "X-Evida-Tenant-ID: $tenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant" `
        -H "X-Evida-Case-ID: $caseId" -F "file=@$filePath;type=application/pdf"
    return $raw | ConvertFrom-Json
}
function Create-Case([string]$tenant, [string]$title) {
    $bodyPath = Join-Path $env:TEMP ('evida-case-' + [guid]::NewGuid().ToString('N') + '.json')
    (@{ title = $title } | ConvertTo-Json -Compress) | Set-Content -Path $bodyPath -Encoding UTF8
    try {
        $raw = & curl.exe -sS -X POST "$base/api/v1/cases" -H "X-Evida-Authenticated-Tenant-ID: $tenant" -H 'Content-Type: application/json' --data-binary "@$bodyPath"
        return ($raw | ConvertFrom-Json)
    } finally { Remove-Item $bodyPath -ErrorAction SilentlyContinue }
}
function Find-Jar([string]$relative) {
    $jar = Join-Path "$env:USERPROFILE\.m2\repository" $relative
    if (-not (Test-Path $jar)) { throw "Missing jar: $jar" }
    return $jar
}
function Get-PdfBoxClasspath {
    $jars = @(
        (Find-Jar 'org\apache\pdfbox\pdfbox\3.0.3\pdfbox-3.0.3.jar'),
        (Find-Jar 'org\apache\pdfbox\fontbox\3.0.3\fontbox-3.0.3.jar'),
        (Find-Jar 'org\apache\pdfbox\pdfbox-io\3.0.3\pdfbox-io-3.0.3.jar')
    )
    $commonsLogging = Get-ChildItem "$env:USERPROFILE\.m2\repository\commons-logging" -Recurse -Filter '*.jar' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'sources|javadoc' } | Select-Object -First 1
    if ($commonsLogging) { $jars += $commonsLogging.FullName }
    $slf4j = Get-ChildItem "$env:USERPROFILE\.m2\repository\org\slf4j\slf4j-api" -Recurse -Filter '*.jar' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'sources|javadoc' } | Select-Object -First 1
    if ($slf4j) { $jars += $slf4j.FullName }
    return ($jars -join ';')
}
function Start-Server($state, [string[]]$ExtraServerArgs = @()) {
    $dbDir = [string]$state.dbDir
    $quarantine = [string]$state.quarantineDir
    $jar = Join-Path $repo 'evida-core\services\saksrom-api\target\evida-api-0.1.0.jar'
    if (-not (Test-Path $jar)) { throw "Jar missing: $jar (run mvnw -DskipTests package first)" }
    $outLog = Join-Path $StateDir ("server-" + (Get-Date -Format 'HHmmss') + ".out.log")
    $errLog = Join-Path $StateDir ("server-" + (Get-Date -Format 'HHmmss') + ".err.log")
    $dbUrl = "jdbc:h2:file:$($dbDir -replace '\\','/')/evida-stress;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH"
    $args = @(
        '-Xmx512m', '-jar', $jar,
        '--spring.profiles.active=dev',
        "--server.port=$port",
        '--evida.security.local-dev-mode=true',
        '--evida.documents.raw-upload-allowed=true',
        "--spring.datasource.url=$dbUrl",
        "--evida.storage.quarantine-root=$($quarantine -replace '\\','/')",
        '--evida.ingestion.worker-fixed-delay-ms=200'
        # DEFECT-P5-1 is fixed in application.yml (spring.servlet.multipart.* = 100MB default);
        # no CLI multipart override anymore, so runs through this script prove the yml fix.
    )
    if ($ExtraServerArgs.Count -gt 0) { $args += $ExtraServerArgs }
    $proc = Start-Process -FilePath 'java.exe' -ArgumentList $args -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WorkingDirectory $StateDir
    Set-StateValue $state 'serverPid' $proc.Id
    Save-State $state
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri "$base/actuator/health" -TimeoutSec 2
            if ($health.status -eq 'UP') { $ready = $true; break }
        } catch {}
        if ($proc.HasExited) { throw "Server exited early. See $errLog / $outLog" }
    }
    if (-not $ready) { throw 'Server did not become ready in 90s' }
    Log "server ready pid=$($proc.Id) heap=-Xmx512m port=$port"
}
function Stop-Server($state, [switch]$Hard) {
    if ($state.PSObject.Properties['serverPid'] -and $state.serverPid) {
        $proc = Get-Process -Id $state.serverPid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $proc.Id -Force
            Log "server pid=$($proc.Id) stopped (hard=$($Hard.IsPresent))"
            Start-Sleep -Seconds 2
        }
    }
}
function Approve-Doc([string]$docId, [string]$tenant) {
    $raw = & curl.exe -sS -X POST "$base/api/documents/$docId/approve" -H "X-Evida-Tenant-ID: $tenant" -H "X-Evida-Authenticated-Tenant-ID: $tenant"
    return $raw | ConvertFrom-Json
}
function Get-Job([string]$jobId, [string]$tenant) {
    return Api-Get "/api/ingestion-jobs/$jobId" $tenant
}
function Save-GateResult([string]$name, $data) {
    $data | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $StateDir "gate-$name.json") -Encoding UTF8
    Log "gate result written: gate-$name.json"
}

$state = Load-State

switch ($Phase) {
    'generate' {
        $fixtureRoot = Join-Path $env:TEMP ("evida-stress-fixtures-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
        $cp = Get-PdfBoxClasspath
        Log "generating fixtures in $fixtureRoot (seed=$seed)"
        & java.exe -cp $cp (Join-Path $PSScriptRoot 'StressFixtureGenerator.java') $fixtureRoot $seed
        if ($LASTEXITCODE -ne 0) { throw "fixture generator failed: $LASTEXITCODE" }
        Copy-Item (Join-Path $fixtureRoot 'manifest.json') (Join-Path $StateDir 'manifest.json')
        $dbDir = Join-Path $env:TEMP ("evida-stress-db-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        $quarantineDir = Join-Path $env:TEMP ("evida-stress-quarantine-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        New-Item -ItemType Directory -Force -Path $dbDir, $quarantineDir | Out-Null
        Set-StateValue $state 'fixtureRoot' $fixtureRoot
        Set-StateValue $state 'dbDir' $dbDir
        Set-StateValue $state 'quarantineDir' $quarantineDir
        Set-StateValue $state 'seed' $seed
        Save-State $state
        Log "generate phase complete"
    }

    'serve' {
        Start-Server $state
    }

    'masterdoc-start' {
        $case = Create-Case $tenantA 'Stress case A - masterdoc C2'
        $upload = Upload-File (Join-Path $state.fixtureRoot 'masterdoc_10000.pdf') $tenantA ([string]$case.id)
        if (-not $upload.id) { throw "masterdoc upload failed: $($upload | ConvertTo-Json -Compress)" }
        $job = Approve-Doc ([string]$upload.id) $tenantA
        Set-StateValue $state 'caseA' ([string]$case.id)
        Set-StateValue $state 'masterdocDocId' ([string]$upload.id)
        Set-StateValue $state 'masterdocJobId' ([string]$job.id)
        Set-StateValue $state 'masterdocStartedAt' (Get-Date -Format 'o')
        Save-State $state
        Log "masterdoc C2 started: doc=$($upload.id) job=$($job.id) status=$($job.status)"
    }

    'masterdoc-wait' {
        $deadline = (Get-Date).AddMinutes($WaitMinutes)
        while ((Get-Date) -lt $deadline) {
            $job = Get-Job $state.masterdocJobId $tenantA
            Log "masterdoc C2 progress: status=$($job.status) pages=$($job.pagesProcessed)/$($job.pagesTotal) attempts=$($job.attemptCount)"
            if ($job.status -in @('COMPLETED', 'FAILED')) {
                $doc = Api-Get "/api/documents/$($state.masterdocDocId)" $tenantA
                $elapsed = (New-TimeSpan -Start ([datetime]$state.masterdocStartedAt) -End (Get-Date)).TotalSeconds
                Save-GateResult 'c2-masterdoc' @{
                    jobStatus = $job.status; pagesProcessed = $job.pagesProcessed; pagesTotal = $job.pagesTotal
                    attemptCount = $job.attemptCount; documentStatus = $doc.status; elapsedSeconds = [int]$elapsed
                    errorMessage = $job.errorMessage
                }
                Log "masterdoc C2 terminal: job=$($job.status) doc=$($doc.status) elapsed=${elapsed}s"
                exit 0
            }
            Start-Sleep -Seconds 5
        }
        Log "masterdoc C2 still running after $WaitMinutes min window; re-run masterdoc-wait"
        exit 3
    }

    'masterdoc-sample' {
        # Sample 20 deterministic-random pages and verify exact page text from manifest format.
        $rng = New-Object System.Random($seed)
        $mismatches = @(); $checked = @()
        for ($i = 0; $i -lt 20; $i++) {
            $page = 1 + $rng.Next(10000)
            $units = @(Api-Get "/api/documents/$($state.masterdocDocId)/source-units/window?page=$page&radius=0" $tenantA)
            $expected = ('EVIDA-STRESS-SIDE-{0:d5} unique legal stress content page {1}' -f $page, $page)
            $actual = if ($units.Count -ge 1) { [string]$units[0].textContent } else { '<MISSING>' }
            $checked += $page
            if ($actual.Trim() -ne $expected) { $mismatches += @{ page = $page; expected = $expected; actual = $actual } }
        }
        Save-GateResult 'c2-sample' @{ checkedPages = $checked; mismatchCount = $mismatches.Count; mismatches = $mismatches }
        if ($mismatches.Count -gt 0) { Log "SAMPLE MISMATCHES: $($mismatches.Count)"; exit 2 }
        Log "sample gate PASS: 20/20 pages match expected text"
    }

    'crash-start' {
        $case = Create-Case $tenantA 'Stress case B - crash/restart C3'
        $upload = Upload-File (Join-Path $state.fixtureRoot 'masterdoc_10000.pdf') $tenantA ([string]$case.id)
        if (-not $upload.id) { throw "crash masterdoc upload failed" }
        $job = Approve-Doc ([string]$upload.id) $tenantA
        Set-StateValue $state 'caseB' ([string]$case.id)
        Set-StateValue $state 'crashDocId' ([string]$upload.id)
        Set-StateValue $state 'crashJobId' ([string]$job.id)
        Save-State $state
        Log "crash C3 started: doc=$($upload.id) job=$($job.id)"
    }

    'crash-kill' {
        $deadline = (Get-Date).AddMinutes($WaitMinutes)
        while ((Get-Date) -lt $deadline) {
            $job = Get-Job $state.crashJobId $tenantA
            Log "crash C3 progress: status=$($job.status) pages=$($job.pagesProcessed)/$($job.pagesTotal)"
            if ($job.status -eq 'RUNNING' -and $job.pagesProcessed -ge 4500) {
                if ($job.pagesProcessed -gt 6000) { Log "WARNING: kill window overshot at $($job.pagesProcessed)" }
                Set-StateValue $state 'crashKilledAtPages' $job.pagesProcessed
                Save-State $state
                Stop-Server $state -Hard
                Log "HARD KILL executed at pagesProcessed=$($job.pagesProcessed)"
                exit 0
            }
            if ($job.status -in @('COMPLETED','FAILED')) { throw "crash gate missed window: job already $($job.status)" }
            Start-Sleep -Seconds 2
        }
        throw 'crash-kill window not reached in time'
    }

    'crash-run' {
        # Combined start + tight-poll + hard kill: the 10k parse finishes in ~50s, so the kill
        # window (40-60%) is only a few seconds wide and must be polled tightly in one phase.
        $attempts = 0
        while ($attempts -lt 3) {
            $attempts++
            $case = Create-Case $tenantA "Stress case B$attempts - crash/restart C3"
            $upload = Upload-File (Join-Path $state.fixtureRoot 'masterdoc_10000.pdf') $tenantA ([string]$case.id)
            if (-not $upload.id) { throw "crash masterdoc upload failed" }
            $job = Approve-Doc ([string]$upload.id) $tenantA
            Set-StateValue $state 'caseB' ([string]$case.id)
            Set-StateValue $state 'crashDocId' ([string]$upload.id)
            Set-StateValue $state 'crashJobId' ([string]$job.id)
            Save-State $state
            Log "crash C3 attempt ${attempts}: doc=$($upload.id) job=$($job.id)"
            $deadline = (Get-Date).AddMinutes(5)
            $missed = $false
            while ((Get-Date) -lt $deadline) {
                $j = Get-Job ([string]$job.id) $tenantA
                if ($j.pagesProcessed -ge 4200 -and $j.status -eq 'RUNNING') {
                    Set-StateValue $state 'crashKilledAtPages' $j.pagesProcessed
                    Save-State $state
                    Stop-Server $state -Hard
                    Log "HARD KILL executed at pagesProcessed=$($j.pagesProcessed)"
                    exit 0
                }
                if ($j.status -in @('COMPLETED','FAILED')) {
                    Log "crash window missed (job $($j.status) at $($j.pagesProcessed)); retrying with new case"
                    $missed = $true
                    break
                }
                Start-Sleep -Milliseconds 400
            }
            if (-not $missed) { throw 'crash-run: window never reached before deadline' }
        }
        throw 'crash-run: failed to hit kill window in 3 attempts'
    }

    'crash-reset' {
        # After hard kill the job is expected to be stuck RUNNING (no stale-lock auto-recovery
        # exists in production code). Verify that on restart, then apply a manual, documented
        # SQL compensation (RUNNING -> PENDING) with the server stopped, mirroring what an
        # operator would do today. This is test tooling, not a production change.
        Start-Server $state
        Start-Sleep -Seconds 10
        $job = Get-Job $state.crashJobId $tenantA
        $stuckRunning = ($job.status -eq 'RUNNING')
        Log "post-restart job state: status=$($job.status) pages=$($job.pagesProcessed) (stuckRunning=$stuckRunning)"
        Set-StateValue $state 'crashStuckRunningObserved' $stuckRunning
        Set-StateValue $state 'crashPagesBeforeReset' $job.pagesProcessed
        Save-State $state
        if ($stuckRunning) {
            Stop-Server $state
            $h2 = Join-Path "$env:USERPROFILE\.m2\repository" 'com\h2database\h2\2.2.224\h2-2.2.224.jar'
            $dbUrl = "jdbc:h2:file:$(([string]$state.dbDir) -replace '\\','/')/evida-stress;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH"
            $sqlFile = Join-Path $StateDir 'crash-reset.sql'
            "UPDATE ingestion_jobs SET status='PENDING', locked_by=NULL, locked_at=NULL WHERE id='$($state.crashJobId)' AND status='RUNNING';" | Set-Content -Path $sqlFile -Encoding ASCII
            & java.exe -cp $h2 org.h2.tools.RunScript -url $dbUrl -user sa -script $sqlFile
            if ($LASTEXITCODE -ne 0) { throw 'manual RUNNING->PENDING reset failed' }
            Log "manual compensation applied: RUNNING -> PENDING for job $($state.crashJobId)"
            Start-Server $state
        }
        Log "crash-reset complete"
    }

    'crash-wait' {
        $deadline = (Get-Date).AddMinutes($WaitMinutes)
        while ((Get-Date) -lt $deadline) {
            $job = Get-Job $state.crashJobId $tenantA
            Log "crash C3 resume progress: status=$($job.status) pages=$($job.pagesProcessed)/$($job.pagesTotal) attempts=$($job.attemptCount)"
            if ($job.status -in @('COMPLETED', 'FAILED')) {
                $doc = Api-Get "/api/documents/$($state.crashDocId)" $tenantA
                Save-GateResult 'c3-crash-restart' @{
                    killedAtPages = $state.crashKilledAtPages
                    stuckRunningObserved = $state.crashStuckRunningObserved
                    pagesBeforeReset = $state.crashPagesBeforeReset
                    finalJobStatus = $job.status; pagesProcessed = $job.pagesProcessed; pagesTotal = $job.pagesTotal
                    attemptCount = $job.attemptCount; documentStatus = $doc.status; errorMessage = $job.errorMessage
                }
                Log "crash C3 terminal: job=$($job.status) doc=$($doc.status) attempts=$($job.attemptCount)"
                exit 0
            }
            Start-Sleep -Seconds 5
        }
        Log "crash C3 still running; re-run crash-wait"
        exit 3
    }

    'bulk' {
        $case = Create-Case $tenantA 'Stress case C - bulk dedup C4'
        Set-StateValue $state 'caseC' ([string]$case.id)
        $bulkDir = Join-Path $state.fixtureRoot 'bulk'
        $files = Get-ChildItem $bulkDir -Filter '*.pdf' | Sort-Object Name
        $uploaded = @{}; $duplicateResponses = 0; $uniqueResponses = 0; $dupTraceable = 0
        foreach ($file in $files) {
            $resp = Upload-File $file.FullName $tenantA ([string]$case.id)
            if (-not $resp.id) { throw "bulk upload failed for $($file.Name): $($resp | ConvertTo-Json -Compress)" }
            $id = [string]$resp.id
            if ($uploaded.ContainsKey($id)) {
                $duplicateResponses++
                if ([string]$resp.message -match 'finnes allerede') { $dupTraceable++ }
            } else {
                $uploaded[$id] = $file.Name
                $uniqueResponses++
            }
        }
        $docs = @(Api-Get "/api/documents?caseId=$($case.id)" $tenantA)
        Log "bulk uploads: files=$($files.Count) uniqueDocs=$uniqueResponses duplicates=$duplicateResponses listCount=$($docs.Count)"

        # Approve every unique doc; re-approve first 10 to prove single active job per document.
        $jobIds = @{}
        foreach ($docId in $uploaded.Keys) {
            $job = Approve-Doc $docId $tenantA
            $jobIds[$docId] = [string]$job.id
        }
        $reapproveSameJob = 0
        $firstTen = @($uploaded.Keys | Select-Object -First 10)
        foreach ($docId in $firstTen) {
            $again = Approve-Doc $docId $tenantA
            if ([string]$again.id -eq $jobIds[$docId]) { $reapproveSameJob++ }
        }
        Set-StateValue $state 'bulkDocIds' @($uploaded.Keys)
        Set-StateValue $state 'bulkJobIds' @($jobIds.Values)
        Save-State $state
        Save-GateResult 'c4-bulk-upload' @{
            filesUploaded = $files.Count; uniqueDocuments = $uniqueResponses; duplicateResponses = $duplicateResponses
            duplicateTraceableMessages = $dupTraceable; documentListCount = $docs.Count
            reapprovedDocs = $firstTen.Count; reapproveReturnedSameActiveJob = $reapproveSameJob
        }
        Log "bulk phase queued: jobs=$($jobIds.Count) reapprove-same-job=$reapproveSameJob/10"
    }

    'bulk-wait' {
        $deadline = (Get-Date).AddMinutes($WaitMinutes)
        $docIds = @($state.bulkDocIds)
        while ((Get-Date) -lt $deadline) {
            $chunks = @()
            for ($i = 0; $i -lt $docIds.Count; $i += 150) {
                $chunk = $docIds[$i..([Math]::Min($i + 149, $docIds.Count - 1))]
                $chunks += ,@($chunk)
            }
            $all = @()
            foreach ($chunk in $chunks) {
                $csv = ($chunk -join ',')
                $resp = Api-Get "/api/ingestion-jobs?documentIds=$csv" $tenantA
                foreach ($jobItem in @($resp)) { $all += $jobItem }
            }
            $completed = @($all | Where-Object { $_.status -eq 'COMPLETED' }).Count
            $failed = @($all | Where-Object { $_.status -eq 'FAILED' }).Count
            $active = @($all | Where-Object { $_.status -in @('PENDING','RUNNING') }).Count
            Log "bulk C4 progress: completed=$completed failed=$failed active=$active of $($docIds.Count)"
            if ($active -eq 0) {
                $pagesTotalSum = ($all | Measure-Object -Property pagesTotal -Sum).Sum
                Save-GateResult 'c4-bulk-jobs' @{
                    totalJobs = $all.Count; completed = $completed; failed = $failed
                    pagesTotalSum = $pagesTotalSum
                }
                Log "bulk C4 terminal: completed=$completed failed=$failed pagesTotalSum=$pagesTotalSum"
                exit 0
            }
            Start-Sleep -Seconds 5
        }
        Log "bulk C4 still running; re-run bulk-wait"
        exit 3
    }

    'tenant' {
        # Tenant B (authenticated as B) probes Tenant A resources. Anti-enumeration contract:
        # 403 on header mismatch, 404/empty on tenant-scoped lookups. No A-data in bodies.
        $docA = [string]$state.masterdocDocId
        $jobA = [string]$state.masterdocJobId
        $masterdocHash = (Get-FileHash -Algorithm SHA256 (Join-Path $state.fixtureRoot 'masterdoc_10000.pdf')).Hash.ToLower()
        $probes = [ordered]@{}
        $probes['b_reads_a_document']      = Api-GetStatus  "/api/documents/$docA" $tenantB $tenantB
        $probes['b_reads_a_job']           = Api-GetStatus  "/api/ingestion-jobs/$jobA" $tenantB $tenantB
        $probes['b_approves_a_document']   = Api-PostStatus "/api/documents/$docA/approve" $tenantB $tenantB
        $probes['b_retries_a_job']         = Api-PostStatus "/api/ingestion-jobs/$jobA/retry" $tenantB $tenantB
        $probes['b_reads_a_source_units']  = Api-GetStatus  "/api/documents/$docA/source-units" $tenantB $tenantB
        $probes['b_header_mismatch_list']  = Api-GetStatus  "/api/documents" $tenantB $tenantA
        $existsOut = Api-GetStatus "/api/documents/exists?sha256=$masterdocHash" $tenantB $tenantB
        $probes['b_dupcheck_a_hash'] = $existsOut

        $leaks = @()
        foreach ($name in $probes.Keys) {
            $p = $probes[$name]
            if ($p.body -match 'masterdoc_10000' -or ($name -ne 'b_dupcheck_a_hash' -and $p.body -match $masterdocHash)) {
                $leaks += $name
            }
        }
        $existsLeak = $false
        try {
            $existsJson = $existsOut.body | ConvertFrom-Json
            if ($existsJson.exists -eq $true) { $existsLeak = $true; $leaks += 'b_dupcheck_a_hash_exists_true' }
        } catch {}
        $summary = [ordered]@{}
        foreach ($name in $probes.Keys) { $summary[$name] = @{ code = $probes[$name].code; bodyPreview = ($probes[$name].body.Substring(0, [Math]::Min(200, $probes[$name].body.Length))) } }
        $summary['leaks'] = $leaks
        $summary['cross_tenant_exists_leak'] = $existsLeak
        Save-GateResult 'c5-tenant-isolation' $summary
        if ($leaks.Count -gt 0) { Log "TENANT LEAKS FOUND: $($leaks -join ', ')"; exit 2 }
        Log "tenant isolation probes complete, no leakage observed"
    }

    'failclosed-start' {
        $case = Create-Case $tenantA 'Stress case D - fail-closed C6'
        Set-StateValue $state 'caseD' ([string]$case.id)
        $uploads = @{}
        foreach ($file in (Get-ChildItem (Join-Path $state.fixtureRoot 'valid') -Filter '*.pdf' | Sort-Object Name)) {
            $resp = Upload-File $file.FullName $tenantA ([string]$case.id)
            if ($resp.id) { $uploads[[string]$resp.id] = @{ name = $file.Name; kind = 'valid' } }
        }
        foreach ($file in (Get-ChildItem (Join-Path $state.fixtureRoot 'mixed') -Filter '*.pdf' | Sort-Object Name)) {
            $resp = Upload-File $file.FullName $tenantA ([string]$case.id)
            if ($resp.id) { $uploads[[string]$resp.id] = @{ name = $file.Name; kind = 'mixed-ocr' } }
        }
        foreach ($file in (Get-ChildItem (Join-Path $state.fixtureRoot 'gift') -Filter '*.pdf' | Sort-Object Name)) {
            $resp = Upload-File $file.FullName $tenantA ([string]$case.id)
            if ($resp.id) { $uploads[[string]$resp.id] = @{ name = $file.Name; kind = 'gift' } }
        }
        $jobMap = @{}
        foreach ($docId in $uploads.Keys) {
            $job = Approve-Doc $docId $tenantA
            $jobMap[$docId] = [string]$job.id
        }
        Set-StateValue $state 'failclosedUploads' $uploads
        Set-StateValue $state 'failclosedJobs' $jobMap
        Save-State $state
        Log "failclosed C6 queued: uploads=$($uploads.Count) jobs=$($jobMap.Count)"
    }

    'failclosed-wait' {
        $deadline = (Get-Date).AddMinutes($WaitMinutes)
        $jobMap = $state.failclosedJobs
        $uploads = $state.failclosedUploads
        while ((Get-Date) -lt $deadline) {
            $results = @()
            $active = 0
            foreach ($prop in $jobMap.PSObject.Properties) {
                $docId = $prop.Name
                $job = Get-Job ([string]$prop.Value) $tenantA
                if ($job.status -in @('PENDING','RUNNING')) { $active++ }
                $results += [pscustomobject]@{
                    docId = $docId
                    name = $uploads.$docId.name
                    kind = $uploads.$docId.kind
                    jobStatus = $job.status
                    pages = $job.pagesProcessed
                    pagesTotal = $job.pagesTotal
                    error = $job.errorMessage
                }
            }
            Log "failclosed C6 progress: active=$active of $(@($jobMap.PSObject.Properties).Count)"
            if ($active -eq 0) {
                $withDocStatus = @()
                foreach ($r in $results) {
                    $doc = Api-Get "/api/documents/$($r.docId)" $tenantA
                    $withDocStatus += [pscustomobject]@{
                        name = $r.name; kind = $r.kind; jobStatus = $r.jobStatus
                        pagesTotal = $r.pagesTotal; error = $r.error; documentStatus = $doc.status
                    }
                }
                $validOk = @($withDocStatus | Where-Object { $_.kind -eq 'valid' -and $_.jobStatus -eq 'COMPLETED' -and $_.documentStatus -eq 'SOURCE_READY' }).Count
                $giftFailedClosed = @($withDocStatus | Where-Object { $_.kind -in @('gift','mixed-ocr') -and $_.jobStatus -eq 'FAILED' -and $_.documentStatus -eq 'INGESTION_FAILED' }).Count
                $falseGreen = @($withDocStatus | Where-Object { $_.kind -in @('gift','mixed-ocr') -and ($_.jobStatus -eq 'COMPLETED' -or $_.documentStatus -eq 'SOURCE_READY') }).Count
                Save-GateResult 'c6-failclosed' @{
                    detail = $withDocStatus; validCompleted = $validOk
                    giftAndOcrFailedClosed = $giftFailedClosed; falseGreenCount = $falseGreen
                }
                Log "failclosed C6 terminal: valid=$validOk failedClosed=$giftFailedClosed falseGreen=$falseGreen"
                exit 0
            }
            Start-Sleep -Seconds 5
        }
        Log "failclosed C6 still running; re-run failclosed-wait"
        exit 3
    }

    'crash-recovery-auto' {
        # Prompt 5.1 mini-gate: crash mid-ingestion and prove AUTOMATIC stale-RUNNING recovery
        # (no manual SQL). Uses a short stale timeout via test config; production default is 900s.
        $staleArgs = @(
            '--evida.ingestion.stale-running-timeout-seconds=20',
            '--evida.ingestion.stale-recovery-fixed-delay-ms=5000'
        )
        Start-Server $state $staleArgs

        $case = Create-Case $tenantA 'Prompt 5.1 auto-recovery case'
        # The 2.1MB masterdoc upload also proves the multipart yml fix: no CLI override is active.
        $upload = Upload-File (Join-Path $state.fixtureRoot 'masterdoc_10000.pdf') $tenantA ([string]$case.id)
        if (-not $upload.id) { throw "masterdoc upload failed without multipart override (DEFECT-P5-1 regression?)" }
        Log "multipart yml fix verified at runtime: 2.1MB upload accepted without CLI override (doc=$($upload.id))"
        $job = Approve-Doc ([string]$upload.id) $tenantA
        Set-StateValue $state 'masterdocDocId' ([string]$upload.id)
        Set-StateValue $state 'crashDocId' ([string]$upload.id)
        Set-StateValue $state 'crashJobId' ([string]$job.id)
        Save-State $state

        $deadline = (Get-Date).AddMinutes(5)
        $killed = $false
        while ((Get-Date) -lt $deadline) {
            $j = Get-Job ([string]$job.id) $tenantA
            if ($j.status -eq 'RUNNING' -and $j.pagesProcessed -ge 4200) {
                Set-StateValue $state 'crashKilledAtPages' $j.pagesProcessed
                Save-State $state
                Stop-Server $state -Hard
                Log "HARD KILL at pagesProcessed=$($j.pagesProcessed)"
                $killed = $true
                break
            }
            if ($j.status -in @('COMPLETED','FAILED')) { throw "kill window missed: job $($j.status)" }
            Start-Sleep -Milliseconds 400
        }
        if (-not $killed) { throw 'kill window never reached' }

        Start-Server $state $staleArgs
        Log "server restarted; waiting for automatic stale reset (timeout 20s + reaper tick 5s), NO manual SQL"
        $sawPending = $false
        $autoDeadline = (Get-Date).AddMinutes(6)
        while ((Get-Date) -lt $autoDeadline) {
            $j = Get-Job ([string]$job.id) $tenantA
            if ($j.status -eq 'PENDING') { $sawPending = $true }
            Log "auto-recovery: status=$($j.status) pages=$($j.pagesProcessed)/$($j.pagesTotal) attempts=$($j.attemptCount)"
            if ($j.status -in @('COMPLETED','FAILED')) {
                $doc = Api-Get "/api/documents/$($upload.id)" $tenantA
                $resetLogLines = @(Get-ChildItem $StateDir -Filter 'server-*.out.log' | ForEach-Object {
                    Select-String -Path $_.FullName -Pattern 'stale_running_ingestion_job_reset' -SimpleMatch -ErrorAction SilentlyContinue
                }) | Where-Object { $_ }
                Save-GateResult 'p51-crash-recovery-auto' @{
                    killedAtPages = $state.crashKilledAtPages
                    sawPendingDuringRecovery = $sawPending
                    staleResetLogLines = @($resetLogLines | ForEach-Object { $_.Line })
                    finalJobStatus = $j.status
                    pagesProcessed = $j.pagesProcessed
                    pagesTotal = $j.pagesTotal
                    attemptCount = $j.attemptCount
                    documentStatus = $doc.status
                    manualSqlUsed = $false
                }
                Log "auto-recovery terminal: job=$($j.status) doc=$($doc.status) attempts=$($j.attemptCount) staleResetLogged=$(@($resetLogLines).Count -gt 0)"
                exit 0
            }
            Start-Sleep -Seconds 3
        }
        throw 'auto-recovery did not reach terminal state in time'
    }

    'shutdown' {
        Stop-Server $state
        Log "server stopped for offline SQL assertions"
    }

    'sql' {
        $h2 = Join-Path "$env:USERPROFILE\.m2\repository" 'com\h2database\h2\2.2.224\h2-2.2.224.jar'
        $dbUrl = "jdbc:h2:file:$(([string]$state.dbDir) -replace '\\','/')/evida-stress;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH"
        $queries = [ordered]@{
            duplicate_document_page_pairs = "SELECT COUNT(*) FROM (SELECT document_id, page_number, parser_version, COUNT(*) c FROM document_source_units GROUP BY document_id, page_number, parser_version HAVING COUNT(*) > 1)"
            pageunits_wrong_tenant = "SELECT COUNT(*) FROM document_source_units u JOIN documents d ON u.document_id = d.id WHERE u.tenant_id <> d.tenant_id"
            pageunits_wrong_case = "SELECT COUNT(*) FROM document_source_units u JOIN documents d ON u.document_id = d.id WHERE COALESCE(CAST(u.case_id AS VARCHAR),'') <> COALESCE(CAST(d.case_id AS VARCHAR),'')"
            completed_jobs_with_count_mismatch = "SELECT COUNT(*) FROM ingestion_jobs WHERE status = 'COMPLETED' AND (pages_total IS NULL OR pages_processed < pages_total)"
            completed_jobs_where_units_mismatch = "SELECT COUNT(*) FROM ingestion_jobs j WHERE j.status = 'COMPLETED' AND j.pages_total <> (SELECT COUNT(*) FROM document_source_units u WHERE u.document_id = j.document_id AND u.parser_version = j.parser_version)"
            source_ready_docs_with_failed_latest_job = "SELECT COUNT(*) FROM documents d WHERE d.status = 'SOURCE_READY' AND 'FAILED' = (SELECT j.status FROM ingestion_jobs j WHERE j.document_id = d.id ORDER BY j.created_at DESC LIMIT 1)"
            failed_docs_marked_source_ready = "SELECT COUNT(*) FROM documents WHERE status = 'INGESTION_FAILED' AND status = 'SOURCE_READY'"
            duplicate_active_jobs_per_document = "SELECT COUNT(*) FROM (SELECT document_id, COUNT(*) c FROM ingestion_jobs WHERE status IN ('PENDING','RUNNING') GROUP BY document_id HAVING COUNT(*) > 1)"
            documents_with_multiple_jobs_total = "SELECT COUNT(*) FROM (SELECT document_id, COUNT(*) c FROM ingestion_jobs GROUP BY document_id HAVING COUNT(*) > 1)"
            source_ready_without_completed_job = "SELECT COUNT(*) FROM documents d WHERE d.status = 'SOURCE_READY' AND NOT EXISTS (SELECT 1 FROM ingestion_jobs j WHERE j.document_id = d.id AND j.status = 'COMPLETED')"
            pageunits_for_failed_docs = "SELECT COUNT(*) FROM document_source_units u JOIN documents d ON u.document_id = d.id WHERE d.status = 'INGESTION_FAILED'"
            masterdoc_unit_count = "SELECT COUNT(*) FROM document_source_units WHERE document_id = '$($state.masterdocDocId)'"
            crashdoc_unit_count = "SELECT COUNT(*) FROM document_source_units WHERE document_id = '$($state.crashDocId)'"
            crashdoc_distinct_pages = "SELECT COUNT(DISTINCT page_number) FROM document_source_units WHERE document_id = '$($state.crashDocId)'"
            total_source_units = "SELECT COUNT(*) FROM document_source_units"
            jobs_by_status = "SELECT status, COUNT(*) FROM ingestion_jobs GROUP BY status"
        }
        $sqlOut = Join-Path $StateDir 'sql-assertions.txt'
        Remove-Item $sqlOut -ErrorAction SilentlyContinue
        foreach ($name in $queries.Keys) {
            Add-Content -Path $sqlOut -Value "== $name =="
            $sqlFile = Join-Path $StateDir 'sql-current.sql'
            ($queries[$name] + ';') | Set-Content -Path $sqlFile -Encoding ASCII
            $result = & java.exe -cp $h2 org.h2.tools.RunScript -url $dbUrl -user sa -script $sqlFile -showResults 2>&1
            Add-Content -Path $sqlOut -Value ($result | Out-String)
        }
        Remove-Item (Join-Path $StateDir 'sql-current.sql') -ErrorAction SilentlyContinue
        Get-Content $sqlOut
        Log "sql assertions written to $sqlOut"
    }

    'all' {
        & $PSCommandPath -Phase generate -StateDir $StateDir
        & $PSCommandPath -Phase serve -StateDir $StateDir
        & $PSCommandPath -Phase masterdoc-start -StateDir $StateDir
        do { & $PSCommandPath -Phase masterdoc-wait -StateDir $StateDir -WaitMinutes 30; $rc = $LASTEXITCODE } while ($rc -eq 3)
        & $PSCommandPath -Phase masterdoc-sample -StateDir $StateDir
        & $PSCommandPath -Phase crash-start -StateDir $StateDir
        & $PSCommandPath -Phase crash-kill -StateDir $StateDir -WaitMinutes 30
        & $PSCommandPath -Phase crash-reset -StateDir $StateDir
        do { & $PSCommandPath -Phase crash-wait -StateDir $StateDir -WaitMinutes 30; $rc = $LASTEXITCODE } while ($rc -eq 3)
        & $PSCommandPath -Phase bulk -StateDir $StateDir
        & $PSCommandPath -Phase tenant -StateDir $StateDir
        do { & $PSCommandPath -Phase bulk-wait -StateDir $StateDir -WaitMinutes 30; $rc = $LASTEXITCODE } while ($rc -eq 3)
        & $PSCommandPath -Phase failclosed-start -StateDir $StateDir
        do { & $PSCommandPath -Phase failclosed-wait -StateDir $StateDir -WaitMinutes 30; $rc = $LASTEXITCODE } while ($rc -eq 3)
        & $PSCommandPath -Phase shutdown -StateDir $StateDir
        & $PSCommandPath -Phase sql -StateDir $StateDir
        Log 'all phases complete'
    }

    default { throw "Unknown phase: $Phase" }
}
