@echo off
setlocal

cd /d "%~dp0"
set "REPO_ROOT=%~dp0..\.."
set "BACKEND_PORT=18080"
set "WEB_PORT=5173"
set "VITE_EVIDA_API_TARGET=http://127.0.0.1:%BACKEND_PORT%"
set "VITE_API_PROXY_TARGET=%VITE_EVIDA_API_TARGET%"
set "BACKEND_HEALTH=%VITE_EVIDA_API_TARGET%/actuator/health"
set "BACKEND_ENSURE_SCRIPT=%REPO_ROOT%\scripts\dev\restart-saksrom-api.ps1"

echo ========================================
echo  EVIDA Web
echo ========================================
echo Backend: %VITE_EVIDA_API_TARGET%
echo Web:     http://127.0.0.1:%WEB_PORT%
echo Tips: "Start EVIDA Web.bat restart" tvinger omstart av backend.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm ble ikke funnet. Installer Node.js LTS og prov igjen.
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installerer avhengigheter for forste gang...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install feilet.
    pause
    exit /b 1
  )
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo PowerShell ble ikke funnet. Kan ikke sjekke/starte backend automatisk.
  pause
  exit /b 1
)

if not exist "%BACKEND_ENSURE_SCRIPT%" (
  echo Backend-startscript mangler:
  echo %BACKEND_ENSURE_SCRIPT%
  pause
  exit /b 1
)

if /i "%~1"=="restart" (
  echo Tvungen omstart av backend...
  goto start_backend
)

echo Sjekker backend health pa %BACKEND_HEALTH% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%BACKEND_HEALTH%' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 goto start_backend

echo Backend kjorer allerede pa %VITE_EVIDA_API_TARGET%
echo Har du endret backend-kode? Kjor "Start EVIDA Web.bat restart" for a laste den pa nytt.
goto backend_ready

:start_backend
echo Starter saksrom-api pa port %BACKEND_PORT% - logger kommer i eget vindu...
rem restart-saksrom-api.ps1 rydder trygt bort en hengt EVIDA-backend som holder porten
rem (aldri andre prosesser), starter gjeldende kode i eget vindu, venter pa
rem /actuator/health i opptil 3 minutter og feiler hvis binaren er stale.
powershell -NoProfile -ExecutionPolicy Bypass -File "%BACKEND_ENSURE_SCRIPT%" -Port %BACKEND_PORT%
if errorlevel 1 (
  echo.
  echo Backend kunne ikke startes. Se meldingene over og backend-vinduet for detaljer.
  pause
  exit /b 1
)

:backend_ready
echo Backend er klar pa %VITE_EVIDA_API_TARGET%

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%WEB_PORT%/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo EVIDA Web kjorer allerede pa http://127.0.0.1:%WEB_PORT%
  start "" "http://127.0.0.1:%WEB_PORT%"
  pause
  exit /b 0
)

echo Starter EVIDA Web pa http://127.0.0.1:%WEB_PORT%
echo Vite proxy: %VITE_EVIDA_API_TARGET%
echo Lukk dette vinduet for a stoppe serveren.
echo.

start "" "http://127.0.0.1:%WEB_PORT%"
call npm run dev -- --port %WEB_PORT%

pause
