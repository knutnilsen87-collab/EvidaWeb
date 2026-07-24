param(
    [ValidateSet("manual_required", "pass", "fail")]
    [string]$Status = "manual_required",
    [string]$Tester = "",
    [string]$EvidencePath = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\native_file_picker_upload_signoff.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

if ($Status -eq "pass" -and ([string]::IsNullOrWhiteSpace($Tester) -or [string]::IsNullOrWhiteSpace($EvidencePath))) {
    throw "Passing native file picker signoff requires -Tester and -EvidencePath."
}

$result = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "NATIVE-FILE-PICKER-UPLOAD"
    status = $Status
    tester = $Tester
    evidence_path = $EvidencePath
    acceptance = @(
        "Open EVIDA on the target Windows workstation.",
        "Click Velg filer in Dokumenter.",
        "Use the native Windows file picker to select an approved synthetic/redacted PDF or TXT.",
        "Verify the uploader shows the selected file and queues upload.",
        "Verify upload reaches quarantine and can be opened via preview/download.",
        "Verify no real client data was used."
    )
    note = "Automation can set file inputs in browser tests, but cannot sign off the native Windows picker UX."
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath $OutputJson
Write-Host "Native file picker signoff artifact: $OutputJson ($Status)"
