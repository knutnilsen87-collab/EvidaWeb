param(
    [string]$OutputPath = "",
    [string]$Database = "evida",
    [string]$Container = "evida-postgres",
    [securestring]$Passphrase
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
    $OutputPath = Join-Path $repoRoot ".codex-runtime\backups\evida-$timestamp.evidabk"
}
if ($null -eq $Passphrase) {
    $Passphrase = Read-Host "Backup passphrase (minimum 16 characters)" -AsSecureString
}

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Passphrase)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ($plain.Length -lt 16) { throw "Backup passphrase must contain at least 16 characters." }
    $env:EVIDA_BACKUP_PASSPHRASE = $plain
    & npm.cmd exec --yes tsx -- "$PSScriptRoot\evida-backup-core.ts" backup `
        --repo-root $repoRoot `
        --output ([System.IO.Path]::GetFullPath($OutputPath)) `
        --database $Database `
        --container $Container
    if ($LASTEXITCODE -ne 0) { throw "Encrypted EVIDA backup failed." }
} finally {
    Remove-Item Env:EVIDA_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
    if ($null -ne $bstr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plain = $null
}
