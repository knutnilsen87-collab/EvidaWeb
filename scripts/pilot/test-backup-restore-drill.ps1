param(
    [string]$Container = "evida-postgres",
    [string]$Database = "evida",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\backup_restore_result.json"
}
$drillId = [guid]::NewGuid().ToString("N")
$marker = "EVIDA_BACKUP_RESTORE_MARKER_$drillId"
$backupPath = Join-Path $repoRoot ".codex-runtime\backup-drill\$drillId.evidabk"
$restoreRoot = Join-Path $repoRoot ".codex-runtime\restore-drill\$drillId"
$targetDatabase = "evida_restore_drill_$($drillId.Substring(0, 12))"
$storageMarkerDir = Join-Path $repoRoot "evida-core\services\saksrom-api\data\quarantine\backup-drill"
$storageMarkerPath = Join-Path $storageMarkerDir "$drillId.txt"
$passphrasePlain = "synthetic-drill-$drillId"
$passphrase = ConvertTo-SecureString $passphrasePlain -AsPlainText -Force
$dbMarkerCreated = $false

try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath),$storageMarkerDir | Out-Null
    Set-Content -LiteralPath $storageMarkerPath -Value $marker -Encoding utf8 -NoNewline
    $sql = @"
CREATE TABLE IF NOT EXISTS evida_backup_restore_probe (
  marker text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO evida_backup_restore_probe(marker) VALUES ('$marker')
ON CONFLICT (marker) DO NOTHING;
"@
    $sql | docker exec -i $Container psql -U evida -d $Database -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create synthetic database marker." }
    $dbMarkerCreated = $true

    & "$PSScriptRoot\backup-evida-pilot.ps1" -OutputPath $backupPath -Database $Database -Container $Container -Passphrase $passphrase
    if ($LASTEXITCODE -ne 0) { throw "Backup step failed." }

    Remove-Item -LiteralPath $storageMarkerPath -Force
    "DELETE FROM evida_backup_restore_probe WHERE marker='$marker';" |
        docker exec -i $Container psql -U evida -d $Database -v ON_ERROR_STOP=1 | Out-Null
    $dbMarkerCreated = $false

    & "$PSScriptRoot\restore-evida-pilot.ps1" `
        -InputPath $backupPath `
        -TargetDatabase $targetDatabase `
        -RestoreRoot $restoreRoot `
        -Container $Container `
        -DrillOnly `
        -KeepDrillDatabase `
        -Passphrase $passphrase
    if ($LASTEXITCODE -ne 0) { throw "Restore step failed." }

    $restoredMarker = docker exec $Container psql -U evida -d $targetDatabase -Atc "SELECT marker FROM evida_backup_restore_probe WHERE marker='$marker';"
    if ($LASTEXITCODE -ne 0 -or $restoredMarker.Trim() -ne $marker) {
        throw "Database marker was not restored."
    }
    $restoredStorageMarker = Join-Path $restoreRoot "quarantine\backup-drill\$drillId.txt"
    if (-not (Test-Path -LiteralPath $restoredStorageMarker)) {
        throw "Storage marker was not restored."
    }
    if ((Get-Content -Raw -LiteralPath $restoredStorageMarker) -ne $marker) {
        throw "Restored storage marker content did not match."
    }

    $result = [ordered]@{
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        status = "pass"
        verdict = "pass"
        gate = "DATA-BACKUP-RESTORE-001"
        encryption = "AES-256-GCM"
        backup_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
        database_dump_restored = $true
        document_storage_restored = $true
        manifest_integrity_verified = $true
        client_data_marker_restore_verified = $true
        live_database_overwritten = $false
        drill_database = $targetDatabase
        marker = $marker
        rollback_path = "Drill used an isolated temporary database and restore directory; live EVIDA data was not replaced."
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null
    $result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath $OutputJson
    Write-Host "Backup/restore drill PASS. Artifact: $OutputJson" -ForegroundColor Green
} finally {
    if ($dbMarkerCreated) {
        "DELETE FROM evida_backup_restore_probe WHERE marker='$marker';" |
            docker exec -i $Container psql -U evida -d $Database -v ON_ERROR_STOP=1 2>$null | Out-Null
    }
    docker exec $Container psql -U evida -d postgres -Atc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$targetDatabase' AND pid <> pg_backend_pid();" 2>$null | Out-Null
    docker exec $Container dropdb -U evida --if-exists $targetDatabase 2>$null | Out-Null
    Remove-Item -LiteralPath $storageMarkerPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $restoreRoot -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    $passphrasePlain = $null
    $passphrase = $null
}
