param(
    [string]$BaseUrl = "",
    [string]$ExpectedDnsName = "",
    [int]$MinimumCertificateDays = 14,
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\live_https_edge_result.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 2500) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync($HostName, $Port)
        return $task.Wait($TimeoutMs) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

$uri = $null
$uriValid = [System.Uri]::TryCreate($BaseUrl, [System.UriKind]::Absolute, [ref]$uri) `
    -and $uri.Scheme -eq "https" `
    -and -not [string]::IsNullOrWhiteSpace($ExpectedDnsName) `
    -and $uri.DnsSafeHost -eq $ExpectedDnsName
$httpsStatus = $null
$certificate = $null
$probeError = $null

if ($uriValid) {
    try {
        $request = Invoke-WebRequest -Uri $uri -Method Get -MaximumRedirection 5 -TimeoutSec 15
        $httpsStatus = [int]$request.StatusCode

        $tcp = [System.Net.Sockets.TcpClient]::new($uri.DnsSafeHost, 443)
        try {
            $ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false)
            try {
                $ssl.AuthenticateAsClient($uri.DnsSafeHost)
                $remoteCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
                $certificate = [ordered]@{
                    subject = $remoteCertificate.Subject
                    issuer = $remoteCertificate.Issuer
                    thumbprint = $remoteCertificate.Thumbprint
                    not_before = $remoteCertificate.NotBefore.ToUniversalTime().ToString("o")
                    not_after = $remoteCertificate.NotAfter.ToUniversalTime().ToString("o")
                    days_remaining = [Math]::Floor(($remoteCertificate.NotAfter.ToUniversalTime() - (Get-Date).ToUniversalTime()).TotalDays)
                }
            } finally {
                $ssl.Dispose()
            }
        } finally {
            $tcp.Dispose()
        }
    } catch {
        $probeError = $_.Exception.Message
    }
}

$blockedPorts = @(18080, 3000, 4173, 5432, 3310)
$unexpectedOpenPorts = @()
if ($uriValid) {
    foreach ($port in $blockedPorts) {
        if (Test-TcpPort $uri.DnsSafeHost $port) {
            $unexpectedOpenPorts += $port
        }
    }
}

$pass = $uriValid `
    -and $httpsStatus -ge 200 `
    -and $httpsStatus -lt 500 `
    -and $null -ne $certificate `
    -and $certificate.days_remaining -ge $MinimumCertificateDays `
    -and $unexpectedOpenPorts.Count -eq 0
$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "LIVE-HTTPS-DOMAIN-CERT-FIREWALL"
    status = if ($pass) { "pass" } else { "blocked" }
    verdict = if ($pass) { "pass" } else { "blocked" }
    base_url = $BaseUrl
    expected_dns_name = $ExpectedDnsName
    https_status = $httpsStatus
    certificate = $certificate
    probed_non_public_ports = $blockedPorts
    unexpected_open_ports = $unexpectedOpenPorts
    probe_error = $probeError
    blocker = if ($pass) {
        $null
    } else {
        "Requires a live HTTPS endpoint with a valid hostname certificate, sufficient validity, and no directly exposed API, web-dev, database, or ClamAV ports."
    }
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Live-edge artifact: $OutputJson ($($artifact.status))"
if (-not $pass) {
    exit 2
}
