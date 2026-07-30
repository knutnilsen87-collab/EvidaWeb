@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\pilot\start-evida-pilot.ps1"
if errorlevel 1 (
  echo.
  echo EVIDA Pilot failed to start. See the messages above.
  pause
  exit /b 1
)

echo.
echo EVIDA Pilot is running.
pause
