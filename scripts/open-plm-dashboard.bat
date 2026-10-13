@echo off
setlocal
title PLM Dashboard

where curl.exe >nul 2>&1
if errorlevel 1 goto :nocurl

set "FOUND="
for %%I in (192.168.100.50 10.20.6.187 100.110.194.101) do (
  if not defined FOUND (
    curl.exe -s -f -o nul --max-time 2 "http://%%I/" >nul 2>&1
    if not errorlevel 1 set "FOUND=%%I"
  )
)

if not defined FOUND goto :unreachable
start "" "http://%FOUND%/"
exit /b 0

:unreachable
echo Cannot reach the PLM dashboard server.
echo Connect to the office network or to Tailscale, then run this file again.
echo Tried: 192.168.100.50  10.20.6.187  100.110.194.101
pause
exit /b 1

:nocurl
echo curl.exe was not found. Windows 10 version 1803 or later is required.
pause
exit /b 1
