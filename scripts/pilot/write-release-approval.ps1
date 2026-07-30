param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Engineering", "Product", "SecurityPrivacy", "IT", "DataOwner", "PilotAgreementDPA")]
    [string]$Gate,
    [ValidateSet("manual_required", "pass", "fail")]
    [string]$Status = "manual_required",
    [string]$Approver = "",
    [string]$Authority = "",
    [string]$ReleaseCommit = "",
    [string]$EvidencePath = "",
    [string]$PilotAgreementReference = "",
    [string]$DpaReference = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$defaultFiles = @{
    Engineering = "engineering_approval.json"
    Product = "product_approval.json"
    SecurityPrivacy = "security_privacy_approval.json"
    IT = "braathe_approval.json"
    DataOwner = "client_data_pilot_approval.json"
    PilotAgreementDPA = "pilot_agreement_dpa_approval.json"
}
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot ("artifacts\first-user\" + $defaultFiles[$Gate])
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$commitValid = $ReleaseCommit -match "^[0-9a-fA-F]{40}$"
$agreementRefsValid = $Gate -ne "PilotAgreementDPA" `
    -or (
        -not [string]::IsNullOrWhiteSpace($PilotAgreementReference) `
        -and -not [string]::IsNullOrWhiteSpace($DpaReference)
    )
if ($Status -eq "pass" -and (
    [string]::IsNullOrWhiteSpace($Approver) `
    -or [string]::IsNullOrWhiteSpace($Authority) `
    -or [string]::IsNullOrWhiteSpace($EvidencePath) `
    -or -not $commitValid `
    -or -not $agreementRefsValid
)) {
    throw "PASS requires approver, authority, exact 40-character release commit, evidence path, and any gate-specific agreement references."
}

$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = $Gate
    status = $Status
    verdict = if ($Status -eq "pass") { "pass" } else { "blocked" }
    approved = $Status -eq "pass"
    approver = $Approver
    authority = $Authority
    release_commit = $ReleaseCommit
    evidence_path = $EvidencePath
    pilot_agreement_reference = if ($Gate -eq "PilotAgreementDPA") { $PilotAgreementReference } else { $null }
    dpa_reference = if ($Gate -eq "PilotAgreementDPA") { $DpaReference } else { $null }
    required_before_real_client_data = $true
    note = "The script records a human decision; it does not grant or impersonate approval."
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Release approval artifact: $OutputJson ($Status)"
