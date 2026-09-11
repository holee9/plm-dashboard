@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0"
set "SERVER_PATH=%REPO_ROOT%proxy\local-dashboard-server.py"
if not defined PLM_DASHBOARD_PORT set "PLM_DASHBOARD_PORT=8080"
if not defined PLM_DASHBOARD_UPSTREAM call :detect_upstream
if not defined PLM_DASHBOARD_UPSTREAM set "PLM_DASHBOARD_UPSTREAM=http://100.110.194.101"
set "DASHBOARD_URL=http://127.0.0.1:%PLM_DASHBOARD_PORT%/"

powershell -NoProfile -Command "try { $health=Invoke-RestMethod -TimeoutSec 2 '%DASHBOARD_URL%__plm_health'; if ($health.service -eq 'plm-dashboard-local' -and $health.upstream -eq '%PLM_DASHBOARD_UPSTREAM%') { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo PLM Dashboard is already running: %DASHBOARD_URL%
  if not "%PLM_DASHBOARD_NO_OPEN%"=="1" start "" "%DASHBOARD_URL%"
  exit /b 0
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%DASHBOARD_URL%' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: port %PLM_DASHBOARD_PORT% is used by another service or upstream configuration.
  pause
  exit /b 1
)

py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 8))" >nul 2>&1
if not errorlevel 1 goto :run_with_py

python -c "import sys; raise SystemExit(sys.version_info < (3, 8))" >nul 2>&1
if not errorlevel 1 goto :run_with_python

echo ERROR: Python 3.8 or newer is required.
echo Install Python from https://www.python.org/downloads/windows/
pause
exit /b 1

:run_with_py
if not "%PLM_DASHBOARD_NO_OPEN%"=="1" start "" /B powershell -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process '%DASHBOARD_URL%'"
echo PLM Dashboard: %DASHBOARD_URL%
echo API upstream: %PLM_DASHBOARD_UPSTREAM%
echo Press Ctrl+C to stop.
py -3 "%SERVER_PATH%" --host 127.0.0.1 --port %PLM_DASHBOARD_PORT% --upstream "%PLM_DASHBOARD_UPSTREAM%"
exit /b %errorlevel%

:run_with_python
if not "%PLM_DASHBOARD_NO_OPEN%"=="1" start "" /B powershell -NoProfile -Command "Start-Sleep -Milliseconds 800; Start-Process '%DASHBOARD_URL%'"
echo PLM Dashboard: %DASHBOARD_URL%
echo API upstream: %PLM_DASHBOARD_UPSTREAM%
echo Press Ctrl+C to stop.
python "%SERVER_PATH%" --host 127.0.0.1 --port %PLM_DASHBOARD_PORT% --upstream "%PLM_DASHBOARD_UPSTREAM%"
exit /b %errorlevel%

:detect_upstream
ipconfig | findstr /R /C:"192\.168\.100\." >nul
if not errorlevel 1 (
  set "PLM_DASHBOARD_UPSTREAM=http://192.168.100.50"
  exit /b 0
)
ipconfig | findstr /R /C:"10\.20\.6\." >nul
if not errorlevel 1 (
  set "PLM_DASHBOARD_UPSTREAM=http://10.20.6.187"
  exit /b 0
)
exit /b 0
