param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 3310,
    [int]$TimeoutMillis = 5000,
    [string]$OutputJson = "",
    [switch]$AllowBlockedExit
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\clamav_runtime_result.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

function Write-Result([string]$Status, [string]$Reason, [bool]$TcpOk, [bool]$EicarDetected) {
    $result = [ordered]@{
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        gate = "GATE-1-MALWARE-RUNTIME"
        status = $Status
        host = $HostName
        port = $Port
        tcp_reachable = $TcpOk
        eicar_detected = $EicarDetected
        raw_signature_logged = $false
        reason = $Reason
    }
    $result | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath $OutputJson
    Write-Host "ClamAV runtime gate: $Status - $Reason"
}

function Send-ClamAvInstream([byte[]]$Payload) {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMillis)) {
        $client.Close()
        throw "clamd TCP connect timed out"
    }
    $client.EndConnect($async)
    $client.ReceiveTimeout = $TimeoutMillis
    $client.SendTimeout = $TimeoutMillis
    try {
        $stream = $client.GetStream()
        $command = [System.Text.Encoding]::ASCII.GetBytes("zINSTREAM`0")
        $stream.Write($command, 0, $command.Length)
        $lengthBytes = [System.BitConverter]::GetBytes([System.Net.IPAddress]::HostToNetworkOrder($Payload.Length))
        $stream.Write($lengthBytes, 0, $lengthBytes.Length)
        $stream.Write($Payload, 0, $Payload.Length)
        $stream.Write(@(0, 0, 0, 0), 0, 4)
        $stream.Flush()
        $buffer = New-Object byte[] 4096
        $read = $stream.Read($buffer, 0, $buffer.Length)
        return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
    } finally {
        $client.Close()
    }
}

try {
    $tcp = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
    if (-not $tcp.TcpTestSucceeded) {
        Write-Result "blocked" "clamd is not reachable; malware runtime cannot be verified" $false $false
        if ($AllowBlockedExit) { exit 0 }
        exit 2
    }

    # Construct the standard antivirus test payload at runtime and never print it.
    $parts = @("X5O!P%","@AP[4\PZX54(P^)7CC)7}`$","EICAR-STANDARD-ANTIVIRUS-TEST-FILE!","`$H+H*")
    $payload = [System.Text.Encoding]::ASCII.GetBytes(($parts -join ""))
    $response = Send-ClamAvInstream $payload
    if ($response -match "FOUND") {
        Write-Result "pass" "clamd detected the standard antivirus test payload via INSTREAM" $true $true
        exit 0
    }
    Write-Result "blocked" "clamd responded, but did not report FOUND for the standard antivirus test payload" $true $false
    if ($AllowBlockedExit) { exit 0 }
    exit 3
} catch {
    Write-Result "blocked" $_.Exception.Message $false $false
    if ($AllowBlockedExit) { exit 0 }
    exit 2
}
