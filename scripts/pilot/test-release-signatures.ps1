param(
    [string[]]$ImageReferences = @(),
    [string]$CertificateIdentity = "",
    [string]$CertificateOidcIssuer = "",
    [string]$ReleaseCommit = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\signature_verification.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$cosign = Get-Command cosign -ErrorAction SilentlyContinue
$inputsComplete = $ImageReferences.Count -gt 0 `
    -and -not [string]::IsNullOrWhiteSpace($CertificateIdentity) `
    -and $CertificateOidcIssuer -match "^https://" `
    -and $ReleaseCommit -match "^[0-9a-fA-F]{40}$"

$results = @()
foreach ($image in $ImageReferences) {
    $digestPinned = $image -match "@sha256:[0-9a-fA-F]{64}$"
    $verified = $false
    $failure = $null
    if (-not $digestPinned) {
        $failure = "Image reference is not pinned to a sha256 digest."
    } elseif ($null -eq $cosign) {
        $failure = "cosign is not installed on this release runner."
    } elseif ($inputsComplete) {
        & $cosign.Source verify `
            --certificate-identity $CertificateIdentity `
            --certificate-oidc-issuer $CertificateOidcIssuer `
            $image *> $null
        $verified = $LASTEXITCODE -eq 0
        if (-not $verified) {
            $failure = "cosign verification failed."
        }
    } else {
        $failure = "Release identity or immutable commit is missing."
    }
    $results += [ordered]@{
        image = $image
        digest_pinned = $digestPinned
        trusted_signature_verified = $verified
        failure = $failure
    }
}

$pass = $inputsComplete `
    -and $null -ne $cosign `
    -and $results.Count -gt 0 `
    -and @($results | Where-Object { -not $_.trusted_signature_verified }).Count -eq 0
$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "TRUSTED-RELEASE-SIGNING"
    status = if ($pass) { "pass" } else { "blocked" }
    verdict = if ($pass) { "pass" } else { "blocked" }
    release_surface = "web and Spring Boot OCI images"
    release_commit = $ReleaseCommit
    certificate_identity = $CertificateIdentity
    certificate_oidc_issuer = $CertificateOidcIssuer
    cosign_available = $null -ne $cosign
    images = $results
    blocker = if ($pass) {
        $null
    } else {
        "Provide digest-pinned release images, the trusted signing identity/issuer, the exact release commit, and verify every signature with cosign."
    }
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Release-signature artifact: $OutputJson ($($artifact.status))"
if (-not $pass) {
    exit 2
}
