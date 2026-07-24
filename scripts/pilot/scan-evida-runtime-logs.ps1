param(
    [string[]]$Roots,
    [string]$OutputJson = "",
    [switch]$AllowFindingsExit
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Roots -or $Roots.Count -eq 0) {
    $Roots = @(
        (Join-Path $repoRoot ".codex-runtime"),
        (Join-Path $repoRoot "logs"),
        (Join-Path $repoRoot "evida-core\services\saksrom-api\logs"),
        (Join-Path $repoRoot "apps\web\logs")
    )
}
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\runtime_sensitive_log_scan.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$markers = @(
    "EVIDA_SECRET_MARKER_CLIENT_NAME_123",
    "EVIDA_SECRET_MARKER_CASE_FACT_456",
    "EVIDA_SECRET_MARKER_PERSONAL_NUMBER_789",
    "EVIDA_SECRET_MARKER_PRIVILEGED_NOTE_ABC",
    "EICAR-STANDARD-ANTIVIRUS-TEST-FILE"
)

$files = foreach ($root in $Roots) {
    if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -lt 50MB -and $_.Extension -match '\.(log|txt|json|ndjson|out|err)$' }
    }
}

$findings = @()
foreach ($file in $files) {
    foreach ($marker in $markers) {
        $matches = Select-String -LiteralPath $file.FullName -Pattern $marker -SimpleMatch -ErrorAction SilentlyContinue
        foreach ($match in $matches) {
            $findings += [ordered]@{
                file = $file.FullName
                line = $match.LineNumber
                marker = $marker
            }
        }
    }
}

$status = if ($findings.Count -eq 0) { "pass" } else { "blocked" }
$result = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "DATA-LOG-001"
    status = $status
    roots = $Roots
    scanned_files = @($files).Count
    findings = $findings
}
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath $OutputJson

Write-Host "Runtime sensitive log scan: $status ($(@($files).Count) files, $($findings.Count) findings)"
if ($findings.Count -gt 0 -and -not $AllowFindingsExit) {
    exit 4
}
