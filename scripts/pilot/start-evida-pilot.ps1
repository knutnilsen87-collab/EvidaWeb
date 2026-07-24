param(
    [int]$BackendPort = 18080,
    [int]$WebPort = 5173,
    [string]$BuildId = "",
    [switch]$EnableMalwareScan,
    [switch]$SkipDatabaseStart
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "evida-core\services\saksrom-api"
$webDir = Join-Path $repoRoot "apps\web"
$runtimeDir = Join-Path $repoRoot ".codex-runtime\pilot"
$backendLog = Join-Path $runtimeDir "backend.out.log"
$backendErr = Join-Path $runtimeDir "backend.err.log"
$webLog = Join-Path $runtimeDir "web.out.log"
$webErr = Join-Path $runtimeDir "web.err.log"
$backendUrl = "http://127.0.0.1:$BackendPort"
$webUrl = "http://127.0.0.1:$WebPort"
$databasePort = 5432
$dockerComposeFile = Join-Path $backendDir "docker-compose.yml"
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if ([string]::IsNullOrWhiteSpace($BuildId)) {
    try {
        $BuildId = (& git -C $repoRoot rev-parse --short HEAD 2>$null).Trim()
    } catch {
        $BuildId = "local"
    }
    if ([string]::IsNullOrWhiteSpace($BuildId)) {
        $BuildId = "local"
    }
}

$env:EVIDA_OCR_ENABLED = "true"
$env:EVIDA_OCR_LANGUAGES = "nor+eng"
$env:EVIDA_TESSERACT_PATH = "C:\Program Files\Tesseract-OCR\tesseract.exe"
$env:EVIDA_TESSDATA_PATH = Join-Path $backendDir "data\tessdata"
$env:EVIDA_LOCAL_DEV_MODE = "true"
if ($EnableMalwareScan) {
    $env:EVIDA_MALWARE_SCAN_ENABLED = "true"
    $env:EVIDA_MALWARE_SCANNER_CONFIGURED = "true"
    $env:EVIDA_MALWARE_SCAN_HOST = "127.0.0.1"
    $env:EVIDA_MALWARE_SCAN_PORT = "3310"
    $env:EVIDA_MALWARE_SCAN_TIMEOUT_MILLIS = "5000"
}

function Test-HttpOk([string]$Uri, [int]$TimeoutSec = 3) {
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Wait-HttpOk([string]$Uri, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-HttpOk $Uri 3) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Test-TcpPort([string]$HostName, [int]$Port) {
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $connect = $client.BeginConnect($HostName, $Port, $null, $null)
            if (-not $connect.AsyncWaitHandle.WaitOne(1000, $false)) {
                return $false
            }
            $client.EndConnect($connect)
            return $true
        } finally {
            $client.Close()
        }
    } catch {
        return $false
    }
}

function Wait-TcpPort([string]$HostName, [int]$Port, [int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-TcpPort $HostName $Port) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Test-DockerReady {
    try {
        & docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Wait-DockerReady([int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-DockerReady) { return $true }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Ensure-Postgres {
    if (Test-TcpPort "127.0.0.1" $databasePort) {
        Write-Host "Postgres already listening on 127.0.0.1:$databasePort." -ForegroundColor Green
        return
    }

    if ($SkipDatabaseStart) {
        throw "Postgres is not listening on 127.0.0.1:$databasePort. Start it manually or rerun without -SkipDatabaseStart."
    }

    if (-not (Test-Path -LiteralPath $dockerComposeFile)) {
        throw "Postgres is not listening on 127.0.0.1:$databasePort and docker-compose.yml is missing: $dockerComposeFile"
    }

    if (-not (Test-DockerReady)) {
        if (Test-Path -LiteralPath $dockerDesktop) {
            Write-Host "Starting Docker Desktop for local Postgres..." -ForegroundColor Yellow
            Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
        }
        if (-not (Wait-DockerReady 120)) {
            throw "Docker is not ready, so EVIDA cannot start local Postgres. Start Docker Desktop and run Start EVIDA Pilot.bat again."
        }
    }

    Write-Host "Starting Postgres container..." -ForegroundColor Yellow
    Push-Location $backendDir
    try {
        & docker compose up -d postgres
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose up -d postgres failed"
        }
    } finally {
        Pop-Location
    }

    if (-not (Wait-TcpPort "127.0.0.1" $databasePort 90)) {
        throw "Postgres did not become available on 127.0.0.1:$databasePort. Check Docker Desktop and the evida-postgres container."
    }
}

Write-Host "== EVIDA Pilot ==" -ForegroundColor Cyan
Write-Host "Repo:    $repoRoot"
Write-Host "Backend: $backendUrl"
Write-Host "Web:     $webUrl"
Write-Host "Build:   $BuildId"
$malwareMode = if ($EnableMalwareScan) { "ClamAV required" } else { "dev bypass" }
Write-Host "Malware: $malwareMode"

foreach ($requiredPath in @($backendDir, $webDir, $env:EVIDA_TESSERACT_PATH, $env:EVIDA_TESSDATA_PATH)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path missing: $requiredPath"
    }
}

if ($EnableMalwareScan) {
    & (Join-Path $PSScriptRoot "test-evida-clamav-runtime.ps1") -HostName $env:EVIDA_MALWARE_SCAN_HOST -Port ([int]$env:EVIDA_MALWARE_SCAN_PORT)
}

Ensure-Postgres

if (-not (Test-HttpOk "$backendUrl/actuator/health" 2)) {
    Write-Host "Starting backend..." -ForegroundColor Yellow
    $mvn = Join-Path $backendDir "mvnw.cmd"
    Start-Process -FilePath $mvn `
        -ArgumentList @(
            "spring-boot:run",
            "-Dspring-boot.run.arguments=--server.port=$BackendPort",
            "-Dspring-boot.run.jvmArguments=-Devida.security.local-dev-mode=true",
            "-Dspring-boot.run.profiles=local"
        ) `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErr `
        -WindowStyle Hidden

    if (-not (Wait-HttpOk "$backendUrl/actuator/health" 180)) {
        throw "Backend did not become healthy. See $backendLog and $backendErr"
    }
} else {
    Write-Host "Backend already healthy." -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath (Join-Path $webDir "node_modules"))) {
    Write-Host "Installing web dependencies..." -ForegroundColor Yellow
    Push-Location $webDir
    try {
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
}

if (-not (Test-HttpOk "$webUrl/" 2)) {
    Write-Host "Starting web..." -ForegroundColor Yellow
    $webCommand = "`$env:VITE_EVIDA_API_TARGET='$backendUrl'; `$env:VITE_API_PROXY_TARGET='$backendUrl'; `$env:VITE_EVIDA_BUILD_ID='$BuildId'; cd '$webDir'; npm.cmd run dev -- --host 127.0.0.1 --port $WebPort"
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $webCommand) `
        -RedirectStandardOutput $webLog `
        -RedirectStandardError $webErr `
        -WindowStyle Hidden

    if (-not (Wait-HttpOk "$webUrl/" 90)) {
        throw "Web did not become healthy. See $webLog and $webErr"
    }
} else {
    Write-Host "Web already healthy." -ForegroundColor Green
}

& (Join-Path $PSScriptRoot "test-evida-pilot-health.ps1") -BackendPort $BackendPort -WebPort $WebPort
Start-Process $webUrl
