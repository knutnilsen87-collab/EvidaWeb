param(
    [int[]]$Ports = @(18080, 5173)
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $pidValue = $listener.OwningProcess
        $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
        $commandLine = ""
        try {
            $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue").CommandLine
        } catch {}

        $isEvida = $commandLine -like "*$repoRoot*" `
            -or $commandLine -like "*saksrom-api*" `
            -or $commandLine -like "*apps\web*" `
            -or $commandLine -like "*no.saksrom.api.SaksromApiApplication*"
        if ($isEvida) {
            Write-Host "Stopping PID $pidValue on port $port ($($process.ProcessName))" -ForegroundColor Yellow
            Stop-Process -Id $pidValue -Force
        } else {
            Write-Host "Skipping non-EVIDA process on port $port PID $pidValue" -ForegroundColor DarkYellow
            Write-Host "CommandLine: $commandLine"
        }
    }
}

Write-Host "EVIDA Pilot stop completed." -ForegroundColor Green
