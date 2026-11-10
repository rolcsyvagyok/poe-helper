@echo off
rem Runs Release by itself whenever a new poe-helper-update.zip lands in this folder (sent from the phone or
rem anywhere), so no one has to click it. Checks every 15 seconds and stops by itself after 5 hours.
setlocal
cd /d "%~dp0"
title PoE Helper release watcher (stops by itself after 5 hours)
echo Watching for poe-helper-update.zip. Close this window to stop.
set /a N=0
:loop
if exist "%~dp0poe-helper-update.zip" (
  rem let the copy finish
  timeout /t 5 /nobreak >nul
  echo %DATE% %TIME% new update found, releasing...
  cmd /c "%~dp0Release.cmd" < nul
  echo %DATE% %TIME% release finished, see release-log.txt
  rem Release unpacks and deletes the zip; if it is still here something went wrong, so don't release it again
  if exist "%~dp0poe-helper-update.zip" move /y "%~dp0poe-helper-update.zip" "%~dp0poe-helper-update.failed.zip" >nul
)
set /a N+=1
if %N% GEQ 1200 goto done
timeout /t 15 /nobreak >nul
goto loop
:done
echo Stopped after 5 hours.
