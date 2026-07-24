param(
    [switch]$ConfirmReset,
    [switch]$CheckOnly,
    [switch]$IncludeRuntimeLogs,
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\deletion_retention_result.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$targets = @(
    (Join-Path $repoRoot "evida-core\services\saksrom-api\data\quarantine"),
    (Join-Path $repoRoot "evida-core\services\saksrom-api\data\uploads"),
    (Join-Path $repoRoot "evida-core\services\saksrom-api\data\temp")
)
if ($IncludeRuntimeLogs) {
    $targets += (Join-Path $repoRoot ".codex-runtime\pilot")
}

function Assert-UnderRepo([string]$PathToCheck) {
    $full = [System.IO.Path]::GetFullPath($PathToCheck)
    $root = [System.IO.Path]::GetFullPath($repoRoot)
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to touch path outside repo: $full"
    }
    return $full
}

$resolvedTargets = @($targets | ForEach-Object { Assert-UnderRepo $_ })
$existingTargets = @($resolvedTargets | Where-Object { Test-Path -LiteralPath $_ })
$status = "available"
$actions = @()

if ($CheckOnly -or -not $ConfirmReset) {
    $actions += "dry_run_only"
} else {
    foreach ($target in $existingTargets) {
        Remove-Item -LiteralPath $target -Recurse -Force
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        $actions += "cleared:$target"
    }
    $status = "completed"
}

$result = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "DATA-DELETE-RESET"
    status = $status
    destructive_action_required = "-ConfirmReset"
    check_only = [bool]($CheckOnly -or -not $ConfirmReset)
    include_runtime_logs = [bool]$IncludeRuntimeLogs
    targets = $resolvedTargets
    existing_targets = $existingTargets
    actions = $actions
    database_reset = "not_performed; use explicit DB backup/restore runbook before client data"
}
$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath $OutputJson

Write-Host "Pilot reset method $status. Artifact: $OutputJson"
if (-not $ConfirmReset) {
    Write-Host "Dry run only. Pass -ConfirmReset to clear controlled local pilot directories." -ForegroundColor Yellow
}
