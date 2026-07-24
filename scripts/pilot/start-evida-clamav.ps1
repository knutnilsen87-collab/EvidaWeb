param(
    [string]$ContainerName = "evida-clamav",
    [int]$Port = 3310,
    [switch]$Pull
)

$ErrorActionPreference = "Stop"

function Test-Port([int]$PortToCheck) {
    try {
        $connection = Test-NetConnection -ComputerName 127.0.0.1 -Port $PortToCheck -WarningAction SilentlyContinue
        return [bool]$connection.TcpTestSucceeded
    } catch {
        return $false
    }
}

if (Test-Port $Port) {
    Write-Host "ClamAV already reachable on 127.0.0.1:$Port." -ForegroundColor Green
    exit 0
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    throw "Docker is not available. Start a local clamd service on 127.0.0.1:$Port or install Docker before running the real-data malware gate."
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& docker info *> $null
$ErrorActionPreference = $previousErrorActionPreference
if ($LASTEXITCODE -ne 0) {
    throw "Docker is installed, but the Docker daemon is not running. Start Docker Desktop or a local clamd service before running the real-data malware gate."
}

if ($Pull) {
    & docker pull clamav/clamav:stable
    if ($LASTEXITCODE -ne 0) { throw "docker pull clamav/clamav:stable failed" }
}

$existing = (& docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}" 2>$null)
if ($existing -eq $ContainerName) {
    & docker start $ContainerName | Out-Null
} else {
    & docker run -d --name $ContainerName -p "${Port}:3310" clamav/clamav:stable | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw "Could not start ClamAV container $ContainerName" }

$deadline = (Get-Date).AddMinutes(5)
do {
    if (Test-Port $Port) {
        Write-Host "ClamAV reachable on 127.0.0.1:$Port." -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

throw "ClamAV container started, but clamd did not become reachable on 127.0.0.1:$Port within 5 minutes."
