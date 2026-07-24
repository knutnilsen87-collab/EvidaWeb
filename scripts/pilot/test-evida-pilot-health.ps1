param(
    [int]$BackendPort = 18080,
    [int]$WebPort = 5173
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "evida-core\services\saksrom-api"
$tesseract = "C:\Program Files\Tesseract-OCR\tesseract.exe"
$tessdata = Join-Path $backendDir "data\tessdata"
$backendUrl = "http://127.0.0.1:$BackendPort"
$webUrl = "http://127.0.0.1:$WebPort"

function Assert-Ok([string]$Name, [scriptblock]$Check) {
    try {
        $result = & $Check
        if ($result) {
            Write-Host "[PASS] $Name" -ForegroundColor Green
            return
        }
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
    throw "[FAIL] $Name"
}

Write-Host "== EVIDA Pilot Health ==" -ForegroundColor Cyan

Assert-Ok "Tesseract executable" { Test-Path -LiteralPath $tesseract }
Assert-Ok "Norwegian tessdata" { Test-Path -LiteralPath (Join-Path $tessdata "nor.traineddata") }
Assert-Ok "English tessdata" { Test-Path -LiteralPath (Join-Path $tessdata "eng.traineddata") }
Assert-Ok "Backend actuator health" {
    $health = Invoke-RestMethod -Uri "$backendUrl/actuator/health" -TimeoutSec 10
    $health.status -eq "UP"
}
Assert-Ok "Frontend dev server" {
    $response = Invoke-WebRequest -Uri "$webUrl/" -UseBasicParsing -TimeoutSec 10
    $response.StatusCode -eq 200
}
Assert-Ok "Frontend API proxy to backend" {
    $response = Invoke-WebRequest -Uri "$webUrl/api/v1/cases" -Headers @{"X-Evida-Tenant-ID"="00000000-0000-0000-0000-000000000101"} -UseBasicParsing -TimeoutSec 10
    $response.StatusCode -eq 200
}

Write-Host "Pilot health green for synthetic/redacted local evaluation." -ForegroundColor Green
