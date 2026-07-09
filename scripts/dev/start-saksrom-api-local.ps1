param(
    [int]$Port = 18080
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "evida-core\services\saksrom-api"
$mavenWrapper = Join-Path $backendDir "mvnw.cmd"

Write-Host "== EVIDA saksrom-api local dev start ==" -ForegroundColor Cyan
Write-Host "Backend dir: $backendDir"
Write-Host "Port: $Port"

if (-not (Test-Path -LiteralPath $mavenWrapper)) {
    Write-Host "Missing Maven wrapper: $mavenWrapper" -ForegroundColor Red
    exit 1
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $cmd = ""
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine } catch {}
        Write-Host "Port $Port is already in use by PID $procId ($($proc.ProcessName))." -ForegroundColor Red
        Write-Host "CommandLine: $cmd"
    }
    Write-Host "Refusing to kill any process automatically. Choose -Port 18081 or stop the process manually." -ForegroundColor Yellow
    exit 2
}

Write-Host "Port $Port is free. Starting backend with Spring Boot port override..." -ForegroundColor Green
Push-Location $backendDir
try {
    & .\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--server.port=$Port"
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
