param(
    [ValidateSet("manual_required", "pass", "fail")]
    [string]$Status = "manual_required",
    [string]$Operator = "",
    [string]$ChangeTicket = "",
    [string]$EvidencePath = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\storage_marker_run_evidence.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$markers = @(
    "EVIDA_SECRET_MARKER_CLIENT_NAME_123",
    "EVIDA_SECRET_MARKER_CASE_FACT_456",
    "EVIDA_SECRET_MARKER_PERSONAL_NUMBER_789",
    "EVIDA_SECRET_MARKER_PRIVILEGED_NOTE_ABC"
)
$ticketValid = $ChangeTicket -match "^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$"
if ($Status -eq "pass" -and (
    [string]::IsNullOrWhiteSpace($Operator) `
    -or [string]::IsNullOrWhiteSpace($EvidencePath) `
    -or -not $ticketValid
)) {
    throw "PASS requires operator, change ticket, and evidence path."
}

$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "SYNTHETIC-STORAGE-MARKER-LIFECYCLE"
    status = $Status
    verdict = if ($Status -eq "pass") { "pass" } else { "blocked" }
    synthetic_only = $true
    operator = $Operator
    change_ticket = $ChangeTicket
    evidence_path = $EvidencePath
    markers = $markers
    required_steps = @(
        "Create one approved synthetic document containing all four exact markers.",
        "Upload, quarantine, process, cite, export, restart, and delete it on the encrypted target.",
        "Capture offline raw storage or block-device images after shutdown without mounting/decrypting them.",
        "Run test-target-storage.ps1 against those exact offline files."
    )
    note = "The artifact attests the marker lifecycle only. Marker absence is decided separately by the raw-storage scanner."
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Storage-marker lifecycle artifact: $OutputJson ($Status)"
