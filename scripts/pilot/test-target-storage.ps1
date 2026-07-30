param(
    [string]$DocumentDataDirectory = "",
    [string]$PostgresDataDirectory = "",
    [string]$AttestedBy = "",
    [string]$ChangeTicket = "",
    [string[]]$OfflineRawStorageFiles = @(),
    [string]$MarkerRunEvidencePath = "",
    [string]$EncryptionOutputJson = "",
    [string]$RawInspectionOutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($EncryptionOutputJson)) {
    $EncryptionOutputJson = Join-Path $repoRoot "artifacts\first-user\encryption_verification.json"
}
if ([string]::IsNullOrWhiteSpace($RawInspectionOutputJson)) {
    $RawInspectionOutputJson = Join-Path $repoRoot "artifacts\first-user\raw_storage_inspection.json"
}

$markers = @(
    "EVIDA_SECRET_MARKER_CLIENT_NAME_123",
    "EVIDA_SECRET_MARKER_CASE_FACT_456",
    "EVIDA_SECRET_MARKER_PERSONAL_NUMBER_789",
    "EVIDA_SECRET_MARKER_PRIVILEGED_NOTE_ABC"
)

function Write-JsonArtifact([string]$Path, [object]$Value) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $json = (($Value | ConvertTo-Json -Depth 10) -replace "`r`n", "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Get-VolumeEvidence([string]$DataPath) {
    if ([string]::IsNullOrWhiteSpace($DataPath) -or -not (Test-Path -LiteralPath $DataPath)) {
        return [ordered]@{
            path = $DataPath
            status = "blocked"
            blocker = "Data directory is missing or was not supplied."
        }
    }

    $resolved = (Resolve-Path -LiteralPath $DataPath).Path
    $root = [System.IO.Path]::GetPathRoot($resolved)
    try {
        $volume = Get-BitLockerVolume -MountPoint $root -ErrorAction Stop
        $verified = $volume.ProtectionStatus -eq "On" `
            -and $volume.VolumeStatus -eq "FullyEncrypted" `
            -and [int]$volume.EncryptionPercentage -eq 100
        return [ordered]@{
            path = $resolved
            volume = $root
            protection_status = [string]$volume.ProtectionStatus
            volume_status = [string]$volume.VolumeStatus
            encryption_percentage = [int]$volume.EncryptionPercentage
            status = if ($verified) { "pass" } else { "blocked" }
            blocker = if ($verified) { $null } else { "BitLocker is not fully encrypted with protection enabled." }
        }
    } catch {
        return [ordered]@{
            path = $resolved
            volume = $root
            status = "blocked"
            blocker = "BitLocker evidence could not be read on this target. Run elevated on the managed workstation."
        }
    }
}

function Test-BytePattern([string]$FilePath, [byte[]]$Pattern) {
    $stream = [System.IO.File]::Open(
        $FilePath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
    )
    try {
        $buffer = New-Object byte[] (1024 * 1024)
        $overlap = New-Object byte[] ([Math]::Max(0, $Pattern.Length - 1))
        $overlapLength = 0
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $combined = New-Object byte[] ($overlapLength + $read)
            if ($overlapLength -gt 0) {
                [Array]::Copy($overlap, 0, $combined, 0, $overlapLength)
            }
            [Array]::Copy($buffer, 0, $combined, $overlapLength, $read)
            for ($index = 0; $index -le $combined.Length - $Pattern.Length; $index++) {
                $match = $true
                for ($patternIndex = 0; $patternIndex -lt $Pattern.Length; $patternIndex++) {
                    if ($combined[$index + $patternIndex] -ne $Pattern[$patternIndex]) {
                        $match = $false
                        break
                    }
                }
                if ($match) {
                    return $true
                }
            }
            $overlapLength = [Math]::Min($overlap.Length, $combined.Length)
            if ($overlapLength -gt 0) {
                [Array]::Copy($combined, $combined.Length - $overlapLength, $overlap, 0, $overlapLength)
            }
        }
        return $false
    } finally {
        $stream.Dispose()
    }
}

$documentVolume = Get-VolumeEvidence $DocumentDataDirectory
$postgresVolume = Get-VolumeEvidence $PostgresDataDirectory
$attestationPresent = -not [string]::IsNullOrWhiteSpace($AttestedBy) `
    -and $ChangeTicket -match "^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$"
$encryptionPass = $documentVolume.status -eq "pass" `
    -and $postgresVolume.status -eq "pass" `
    -and $attestationPresent

$encryptionArtifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "TARGET-STORAGE-ENCRYPTION"
    status = if ($encryptionPass) { "pass" } else { "blocked" }
    verdict = if ($encryptionPass) { "pass" } else { "blocked" }
    target_only = $true
    attested_by = $AttestedBy
    change_ticket = $ChangeTicket
    document_volume = $documentVolume
    postgres_volume = $postgresVolume
    blocker = if ($encryptionPass) {
        $null
    } else {
        "Both target data directories must be on fully encrypted, protected BitLocker volumes and tied to an operator and change ticket."
    }
}
Write-JsonArtifact $EncryptionOutputJson $encryptionArtifact

$markerEvidence = $null
if (-not [string]::IsNullOrWhiteSpace($MarkerRunEvidencePath) -and (Test-Path -LiteralPath $MarkerRunEvidencePath)) {
    try {
        $markerEvidence = Get-Content -Raw -LiteralPath $MarkerRunEvidencePath | ConvertFrom-Json
    } catch {
        $markerEvidence = $null
    }
}
$markerRunPass = $null -ne $markerEvidence `
    -and $markerEvidence.status -eq "pass" `
    -and $markerEvidence.synthetic_only -eq $true `
    -and @($markerEvidence.markers).Count -eq $markers.Count `
    -and ($markers | Where-Object { $_ -notin @($markerEvidence.markers) }).Count -eq 0

$files = @()
$invalidPaths = @()
foreach ($candidate in $OfflineRawStorageFiles) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $files += (Resolve-Path -LiteralPath $candidate).Path
    } else {
        $invalidPaths += $candidate
    }
}

$findings = @()
$scanErrors = @()
if ($encryptionPass -and $markerRunPass -and $files.Count -gt 0 -and $invalidPaths.Count -eq 0) {
    foreach ($file in $files) {
        try {
            foreach ($marker in $markers) {
                $utf8Found = Test-BytePattern $file ([System.Text.Encoding]::UTF8.GetBytes($marker))
                $utf16Found = Test-BytePattern $file ([System.Text.Encoding]::Unicode.GetBytes($marker))
                if ($utf8Found -or $utf16Found) {
                    $findings += [ordered]@{
                        file_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
                        marker_id = $marker
                        encoding = if ($utf8Found) { "utf8" } else { "utf16le" }
                    }
                }
            }
        } catch {
            $scanErrors += [ordered]@{
                file = $file
                error = $_.Exception.GetType().Name
            }
        }
    }
}

$rawPass = $encryptionPass `
    -and $markerRunPass `
    -and $files.Count -gt 0 `
    -and $invalidPaths.Count -eq 0 `
    -and $scanErrors.Count -eq 0 `
    -and $findings.Count -eq 0
$rawArtifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "RAW-STORAGE-MARKER-INSPECTION"
    status = if ($rawPass) { "pass" } else { "blocked" }
    verdict = if ($rawPass) { "pass" } else { "blocked" }
    synthetic_only = $true
    encryption_gate_passed = $encryptionPass
    marker_run_evidence = $MarkerRunEvidencePath
    marker_run_verified = $markerRunPass
    offline_raw_storage_files_inspected = $files.Count
    invalid_paths = $invalidPaths
    scan_errors = $scanErrors
    marker_findings = $findings
    required_markers = $markers
    blocker = if ($rawPass) {
        $null
    } else {
        "Requires PASS encryption evidence, a completed synthetic marker lifecycle, explicit offline raw-storage files, and zero plaintext marker findings."
    }
}
Write-JsonArtifact $RawInspectionOutputJson $rawArtifact

Write-Host "Encryption artifact: $EncryptionOutputJson ($($encryptionArtifact.status))"
Write-Host "Raw-storage artifact: $RawInspectionOutputJson ($($rawArtifact.status))"
if (-not $encryptionPass -or -not $rawPass) {
    exit 2
}
