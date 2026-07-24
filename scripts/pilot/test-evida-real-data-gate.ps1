param(
    [switch]$SkipClamAv,
    [switch]$AllowBlockedExit
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifact = Join-Path $repoRoot "artifacts\first-user\real_client_data_gate_2026-07-14.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $artifact) | Out-Null

$steps = @()
function Add-Step([string]$Name, [string]$Status, [string]$Command, [int]$ExitCode) {
    $script:steps += [ordered]@{
        name = $Name
        status = $Status
        command = $Command
        exit_code = $ExitCode
    }
}

if ($SkipClamAv) {
    Add-Step "clamav_runtime" "skipped" "test-evida-clamav-runtime.ps1" 0
} else {
    & (Join-Path $PSScriptRoot "test-evida-clamav-runtime.ps1") -AllowBlockedExit
    $clamExit = $LASTEXITCODE
    $clamArtifact = Join-Path $repoRoot "artifacts\first-user\clamav_runtime_result.json"
    $clamStatus = "blocked"
    if (Test-Path -LiteralPath $clamArtifact) {
        try {
            $clamStatus = (Get-Content -Raw -LiteralPath $clamArtifact | ConvertFrom-Json).status
        } catch {
            $clamStatus = "blocked"
        }
    }
    Add-Step "clamav_runtime" $clamStatus "test-evida-clamav-runtime.ps1" $clamExit
}

& (Join-Path $PSScriptRoot "scan-evida-runtime-logs.ps1") -AllowFindingsExit
$logExit = $LASTEXITCODE
$logStatus = if ($logExit -eq 0) { "pass" } else { "blocked" }
Add-Step "runtime_log_scan" $logStatus "scan-evida-runtime-logs.ps1" $logExit

& (Join-Path $PSScriptRoot "reset-evida-pilot-data.ps1") -CheckOnly
$resetExit = $LASTEXITCODE
$resetStatus = if ($resetExit -eq 0) { "available" } else { "blocked" }
Add-Step "reset_method" $resetStatus "reset-evida-pilot-data.ps1 -CheckOnly" $resetExit

$blocked = @($steps | Where-Object { $_.status -match "blocked|skipped" })
$result = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "EVIDA-REAL-CLIENT-DATA-GATE"
    status = if ($blocked.Count -eq 0) { "pass" } else { "blocked" }
    real_client_data_allowed = $false
    reason = if ($blocked.Count -eq 0) { "Local script gates passed, but manual approvals and managed workstation release gates still decide final approval." } else { "One or more required runtime gates are blocked or skipped." }
    steps = $steps
}
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath $artifact
Write-Host "Real data gate artifact: $artifact"
Write-Host "Real data gate status: $($result.status)"

if ($blocked.Count -gt 0 -and -not $AllowBlockedExit) {
    exit 5
}
