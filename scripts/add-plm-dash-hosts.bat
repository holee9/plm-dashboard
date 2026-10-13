@echo off
setlocal EnableExtensions
title PLM Dashboard - hosts setup

set "NAME=plm-dash.work"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "IP="

fltmc >nul 2>&1
if not errorlevel 1 goto :main
if /I "%~1"=="elevated" goto :noadmin

echo Requesting administrator permission. Please click Yes.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevated' -Verb RunAs"
if errorlevel 1 goto :noadmin
exit /b 0

:noadmin
echo.
echo [FAILED] Administrator permission was not granted.
echo Right-click this file and choose "Run as administrator".
pause
exit /b 1

:main
where curl.exe >nul 2>&1
if errorlevel 1 goto :menu

echo Looking for the dashboard server...
for %%A in (192.168.100.50 10.20.6.187 100.110.194.101) do if not defined IP curl.exe -s -f -o nul --max-time 2 "http://%%A/" && set "IP=%%A"
if defined IP goto :apply

echo.
echo [FAILED] Cannot reach the server at 192.168.100.50, 10.20.6.187 or 100.110.194.101.
echo Connect to the office network or to Tailscale, then run this file again.
pause
exit /b 1

:menu
echo.
echo 1. Office 2.5G   192.168.100.50
echo 2. Office wired  10.20.6.187
echo 3. Tailscale     100.110.194.101
choice /C 123 /M "Select network"
if errorlevel 3 goto :use3
if errorlevel 2 goto :use2
set "IP=192.168.100.50"
goto :apply
:use2
set "IP=10.20.6.187"
goto :apply
:use3
set "IP=100.110.194.101"
goto :apply

:apply
echo.
echo Server found: %IP%
echo Writing "%IP%  %NAME%" to %HOSTS%
copy /y "%HOSTS%" "%TEMP%\hosts.plm-dash.backup" >nul 2>&1
findstr /v /i /c:"%NAME%" "%HOSTS%" > "%TEMP%\hosts.plm-dash.new"
if errorlevel 2 goto :hostsfail
>> "%TEMP%\hosts.plm-dash.new" echo %IP%  %NAME%
copy /y "%TEMP%\hosts.plm-dash.new" "%HOSTS%" >nul
if errorlevel 1 goto :hostsfail
ipconfig /flushdns >nul 2>&1

ping -n 1 -w 1500 %NAME% 2>nul | findstr /C:"%IP%" >nul
if errorlevel 1 goto :noresolve

echo [OK] %NAME% now points to %IP%
echo Opening http://%NAME%/
start "" "http://%NAME%/"
timeout /t 3 >nul
exit /b 0

:hostsfail
echo.
echo [FAILED] Could not write the hosts file. Security software may be blocking it.
echo Opening http://%IP%/ instead.
start "" "http://%IP%/"
pause
exit /b 1

:noresolve
echo.
echo [WARNING] The hosts file was written but %NAME% still does not resolve to %IP%.
echo Opening http://%IP%/ instead.
start "" "http://%IP%/"
pause
exit /b 1
