param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [string]$TargetDatabase = "",
    [string]$RestoreRoot = "",
    [string]$Container = "evida-postgres",
    [switch]$DrillOnly,
    [switch]$KeepDrillDatabase,
    [switch]$ConfirmRestore,
    [securestring]$Passphrase
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ($DrillOnly) {
    if ([string]::IsNullOrWhiteSpace($TargetDatabase)) {
        $TargetDatabase = "evida_restore_drill_$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    }
    if ([string]::IsNullOrWhiteSpace($RestoreRoot)) {
        $RestoreRoot = Join-Path $repoRoot ".codex-runtime\restore-drill\$TargetDatabase"
    }
} else {
    if (-not $ConfirmRestore) {
        throw "Live restore is destructive. Pass -ConfirmRestore after stopping EVIDA and verifying the backup."
    }
    if ([string]::IsNullOrWhiteSpace($TargetDatabase) -or [string]::IsNullOrWhiteSpace($RestoreRoot)) {
        throw "Live restore requires explicit -TargetDatabase and -RestoreRoot."
    }
}
if ($null -eq $Passphrase) {
    $Passphrase = Read-Host "Backup passphrase" -AsSecureString
}

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Passphrase)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $env:EVIDA_BACKUP_PASSPHRASE = $plain
    $arguments = @(
        "exec", "--yes", "tsx", "--",
        "$PSScriptRoot\evida-backup-core.ts", "restore",
        "--repo-root", $repoRoot,
        "--input", ([System.IO.Path]::GetFullPath($InputPath)),
        "--target-database", $TargetDatabase,
        "--restore-root", ([System.IO.Path]::GetFullPath($RestoreRoot)),
        "--container", $Container
    )
    if ($DrillOnly) { $arguments += "--drill" }
    if ($KeepDrillDatabase) { $arguments += "--keep-drill-database" }
    & npm.cmd @arguments
    if ($LASTEXITCODE -ne 0) { throw "EVIDA restore failed." }
} finally {
    Remove-Item Env:EVIDA_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
    if ($null -ne $bstr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = $null
}
