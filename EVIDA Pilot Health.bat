@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\pilot\test-evida-pilot-health.ps1"
pause
