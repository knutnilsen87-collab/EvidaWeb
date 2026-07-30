@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\pilot\stop-evida-pilot.ps1"
pause
