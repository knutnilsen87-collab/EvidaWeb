param(
    [ValidateSet("manual_required", "pass", "fail")]
    [string]$Status = "manual_required",
    [string]$Operator = "",
    [string]$ManagedDeviceId = "",
    [string]$ChangeTicket = "",
    [string]$EvidencePath = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\windows_managed_workstation_smoke.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$ticketValid = $ChangeTicket -match "^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$"
if ($Status -eq "pass" -and (
    [string]::IsNullOrWhiteSpace($Operator) `
    -or [string]::IsNullOrWhiteSpace($ManagedDeviceId) `
    -or [string]::IsNullOrWhiteSpace($EvidencePath) `
    -or -not $ticketValid
)) {
    throw "PASS requires operator, managed device ID, change ticket, and evidence path."
}

$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "MANAGED-WINDOWS-WORKSTATION-SMOKE"
    status = $Status
    verdict = if ($Status -eq "pass") { "pass" } else { "blocked" }
    operator = $Operator
    managed_device_id = $ManagedDeviceId
    change_ticket = $ChangeTicket
    evidence_path = $EvidencePath
    synthetic_only = $true
    steps = @(
        "Sign in through production OIDC with MFA on the managed device.",
        "Verify AppLocker/WDAC/Defender/Intune policy does not block the approved EVIDA release.",
        "Complete the native Windows file-picker signoff using approved synthetic data.",
        "Upload, quarantine, process, preview, cite, export, restart, and delete the synthetic case.",
        "Confirm the real-client-data gate remains blocked until all separate approvals are PASS."
    )
    note = "This artifact records human evidence. The script cannot perform or self-approve the managed-workstation smoke."
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Managed-workstation artifact: $OutputJson ($Status)"
