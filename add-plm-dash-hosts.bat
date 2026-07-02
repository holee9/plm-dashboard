@echo off
setlocal EnableExtensions

set "HOST_NAME=plm-dash.work"
set "HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts"
set "TARGET_IP="
set "NETWORK_LABEL="

if /I "%~1"=="help" goto :usage
if /I "%~1"=="-h" goto :usage
if /I "%~1"=="/?" goto :usage

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)

call :set_ip_from_arg "%~1"
if errorlevel 2 exit /b 2

if not defined TARGET_IP call :detect_ip
if not defined TARGET_IP goto :choose_network
goto :update_hosts

:choose_network
echo Could not auto-detect the current network.
echo.
echo 1. Office 2.5G  ^(192.168.100.x^) - 192.168.100.50
echo 2. Office wired ^(10.20.6.x^)     - 10.20.6.187
echo 3. Tailscale remote              - 100.110.194.101
echo.
choice /C 123 /M "Select network"
if errorlevel 3 goto :use_tailscale
if errorlevel 2 goto :use_wired
if errorlevel 1 goto :use_office25g
goto :choose_network

:use_office25g
set "TARGET_IP=192.168.100.50"
set "NETWORK_LABEL=Office 2.5G"
goto :update_hosts

:use_wired
set "TARGET_IP=10.20.6.187"
set "NETWORK_LABEL=Office wired"
goto :update_hosts

:use_tailscale
set "TARGET_IP=100.110.194.101"
set "NETWORK_LABEL=Tailscale"
goto :update_hosts

:update_hosts
echo.
echo Updating %HOSTS_FILE%
echo %HOST_NAME% -^> %TARGET_IP% [%NETWORK_LABEL%]
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $hostsPath=Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'; $backupPath=Join-Path $env:TEMP 'hosts.plm-dash.backup'; $hostName='%HOST_NAME%'; $targetIp='%TARGET_IP%'; $pattern='(^|\s)'+[regex]::Escape($hostName)+'(\s|$)'; $lines=if(Test-Path -LiteralPath $hostsPath){Copy-Item -LiteralPath $hostsPath -Destination $backupPath -Force; Get-Content -LiteralPath $hostsPath}else{@()}; $updated=@($lines | Where-Object { $_ -notmatch $pattern }); $updated += ('{0}  {1}' -f $targetIp,$hostName); Set-Content -LiteralPath $hostsPath -Value $updated -Encoding ASCII"
if errorlevel 1 (
  echo Failed to update hosts file.
  pause
  exit /b 1
)

ipconfig /flushdns >nul 2>&1

echo Done.
echo Backup: %TEMP%\hosts.plm-dash.backup
echo.
findstr /I /L /C:"%HOST_NAME%" "%HOSTS_FILE%"
echo.
echo Open http://%HOST_NAME%/ in your browser.
pause
exit /b 0

:set_ip_from_arg
set "PROFILE=%~1"
if not defined PROFILE exit /b 0

if /I "%PROFILE%"=="office25g" (
  set "TARGET_IP=192.168.100.50"
  set "NETWORK_LABEL=Office 2.5G"
  exit /b 0
)
if /I "%PROFILE%"=="office-25g" (
  set "TARGET_IP=192.168.100.50"
  set "NETWORK_LABEL=Office 2.5G"
  exit /b 0
)
if /I "%PROFILE%"=="wired" (
  set "TARGET_IP=10.20.6.187"
  set "NETWORK_LABEL=Office wired"
  exit /b 0
)
if /I "%PROFILE%"=="office-wired" (
  set "TARGET_IP=10.20.6.187"
  set "NETWORK_LABEL=Office wired"
  exit /b 0
)
if /I "%PROFILE%"=="tailscale" (
  set "TARGET_IP=100.110.194.101"
  set "NETWORK_LABEL=Tailscale"
  exit /b 0
)

echo Unknown profile: %PROFILE%
call :usage
exit /b 2

:detect_ip
ipconfig | findstr /R /C:"192\.168\.100\." >nul
if not errorlevel 1 (
  set "TARGET_IP=192.168.100.50"
  set "NETWORK_LABEL=Office 2.5G"
  exit /b 0
)

ipconfig | findstr /R /C:"10\.20\.6\." >nul
if not errorlevel 1 (
  set "TARGET_IP=10.20.6.187"
  set "NETWORK_LABEL=Office wired"
  exit /b 0
)

ipconfig | findstr /I /C:"Tailscale" >nul
if not errorlevel 1 (
  set "TARGET_IP=100.110.194.101"
  set "NETWORK_LABEL=Tailscale"
  exit /b 0
)

exit /b 0

:usage
echo Usage:
echo   add-plm-dash-hosts.bat [office25g ^| wired ^| tailscale]
echo.
echo No argument: auto-detect network, then prompt if needed.
echo office25g : map %HOST_NAME% to 192.168.100.50
echo wired     : map %HOST_NAME% to 10.20.6.187
echo tailscale : map %HOST_NAME% to 100.110.194.101
exit /b 0
