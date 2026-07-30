# Dev-only helper: restart the local saksrom-api backend on port 18080 deterministically.
#
# - Shows what is listening on the selected port (PID, process, command line).
# - Kills it ONLY if the command line clearly identifies an EVIDA Spring Boot backend
#   (no.saksrom.api main class or a spring-boot argfile). Anything else is reported
#   and left running unless -ForceKillEvidaBackend is passed AND it is a java process.
# - Starts the current backend from evida-core/services/saksrom-api.
# - Waits for /actuator/health and probes the start-batch endpoint so a stale
#   binary (404) is caught immediately.
#
# Usage (from repo root or anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\dev\restart-saksrom-api.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\dev\restart-saksrom-api.ps1 -SkipStart   # diagnose/stop only

param(
    [switch]$ForceKillEvidaBackend,
    [switch]$SkipStart,
    [int]$Port = 18080
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "evida-core\services\saksrom-api"
$dockerComposeFile = Join-Path $backendDir "docker-compose.yml"

function Test-TcpPort([string]$HostName, [int]$TargetPort) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect($HostName, $TargetPort, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(1000)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-TcpPort([string]$HostName, [int]$TargetPort, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-TcpPort $HostName $TargetPort) {
            return $true
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

Write-Host "== EVIDA saksrom-api dev restart ==" -ForegroundColor Cyan
Write-Host "Backend dir: $backendDir"

# --- 1. Diagnose port ---
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $cmd = ""
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine } catch {}
        Write-Host ""
        Write-Host "Port $Port is owned by PID $procId ($($proc.ProcessName)), started $($proc.StartTime)"
        Write-Host "CommandLine: $cmd"

        $isEvida = ($cmd -match "no\.saksrom\.api") -or ($cmd -match "spring-boot.*argfile") -or ($cmd -match "saksrom-api")
        $isJava = $proc.ProcessName -eq "java"

        if ($isEvida) {
            Write-Host "Classified as EVIDA Spring Boot backend -> stopping (PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -Confirm:$false
        } elseif ($isJava -and $ForceKillEvidaBackend) {
            Write-Host "Java process not clearly EVIDA, but -ForceKillEvidaBackend given -> stopping (PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -Confirm:$false
        } else {
            Write-Host "NOT an EVIDA backend. Refusing to kill PID $procId." -ForegroundColor Red
            Write-Host "Stop it manually, or start EVIDA on another port:"
            Write-Host "  .\mvnw.cmd spring-boot:run `"-Dspring-boot.run.arguments=--server.port=18081`""
            Write-Host "  (and set VITE_EVIDA_API_TARGET=http://127.0.0.1:18081 for the web dev server)"
            exit 2
        }
    }
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "Port $Port is still in use after stop attempt." -ForegroundColor Red
        exit 1
    }
    Write-Host "Port $Port is now free." -ForegroundColor Green
} else {
    Write-Host "Nothing is listening on port $Port."
}

if ($SkipStart) {
    Write-Host "-SkipStart given; not starting backend."
    exit 0
}

# --- 2. Ensure the repository-owned local Postgres dependency is available ---
if (-not (Test-TcpPort "127.0.0.1" 5432)) {
    Write-Host ""
    Write-Host "Postgres is not listening on port 5432. Starting the existing Compose service..." -ForegroundColor Yellow
    if (-not (Test-Path -LiteralPath $dockerComposeFile)) {
        Write-Host "Missing Compose file: $dockerComposeFile" -ForegroundColor Red
        exit 1
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Docker was not found. Start Docker Desktop, then run this command again." -ForegroundColor Red
        exit 1
    }

    Push-Location $backendDir
    try {
        & docker compose up -d postgres
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Could not start the evida-postgres Compose service. Start Docker Desktop and try again." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }

    if (-not (Wait-TcpPort "127.0.0.1" 5432 90)) {
        Write-Host "Postgres did not become available on port 5432 within 90 seconds." -ForegroundColor Red
        exit 1
    }
    Write-Host "Postgres is accepting connections on port 5432." -ForegroundColor Green
}

# --- 3. Start current backend (new window so logs stay visible and this script returns) ---
Write-Host ""
Write-Host "Starting current backend from $backendDir ..." -ForegroundColor Cyan
$mavenCommand = "mvnw.cmd spring-boot:run `"-Dspring-boot.run.arguments=--server.port=$Port`" `"-Dspring-boot.run.jvmArguments=-Devida.security.local-dev-mode=true`" `"-Dspring-boot.run.profiles=local`""
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $mavenCommand -WorkingDirectory $backendDir

# --- 4. Wait for health ---
$healthy = $false
for ($i = 0; $i -lt 36; $i++) {
    Start-Sleep -Seconds 5
    try {
        $resp = Invoke-WebRequest "http://127.0.0.1:$Port/actuator/health" -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
}
if (-not $healthy) {
    Write-Host "Backend did not become healthy within 3 minutes. Check the backend window for startup errors." -ForegroundColor Red
    exit 1
}
Write-Host "actuator/health: 200 OK" -ForegroundColor Green

# --- 5. Verify the running binary is current (start-batch must not 404) ---
try {
    $probe = Invoke-WebRequest "http://127.0.0.1:$Port/api/documents/ingestion/start-batch" `
        -Method Post -UseBasicParsing -TimeoutSec 5 `
        -Headers @{ "X-Evida-Tenant-ID" = "00000000-0000-0000-0000-000000000101" } `
        -ContentType "application/json" -Body '{"documentIds":[]}'
    Write-Host "start-batch probe: $($probe.StatusCode) (endpoint present)" -ForegroundColor Green
} catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 404) {
        Write-Host "start-batch probe: 404 - the running backend is STALE relative to the source tree." -ForegroundColor Red
        exit 1
    }
    Write-Host "start-batch probe: HTTP $status (not 404 - endpoint mapping exists; auth/validation responses are fine)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Backend is running the current code on port $Port." -ForegroundColor Green
