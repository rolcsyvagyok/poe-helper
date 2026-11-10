@echo off
rem Runs Release by itself whenever a new poe-helper-update.zip lands in this folder (sent from the phone or
rem anywhere), so no one has to click it. Checks every 15 seconds and stops by itself after 5 hours.
rem It runs from a copy in the temp folder, because a release rewrites the files in this folder (a batch file
rem that changes while it runs goes wrong). What it does is written to watcher-log.txt here.
setlocal
if /i not "%~1"=="run" (
  copy /y "%~f0" "%TEMP%\poeh-release-watcher.cmd" >nul
  start "PoE Helper release watcher (stops by itself after 5 hours)" cmd /c ""%TEMP%\poeh-release-watcher.cmd" run "%~dp0.""
  exit /b
)
set "DIR=%~f2"
cd /d "%DIR%"
set "WLOG=%DIR%\watcher-log.txt"
echo %DATE% %TIME% watcher started >> "%WLOG%"
echo Watching %DIR% for poe-helper-update.zip. Close this window to stop.
set /a N=0
:loop
if exist "%DIR%\poe-helper-update.zip" (
  rem let the copy finish
  timeout /t 5 /nobreak >nul
  echo %DATE% %TIME% new update found, releasing >> "%WLOG%"
  echo %DATE% %TIME% new update found, releasing...
  cmd /c ""%DIR%\Release.cmd"" < nul
  echo %DATE% %TIME% release finished >> "%WLOG%"
  echo %DATE% %TIME% release finished, see release-log.txt
  rem Release unpacks and deletes the zip; if it is still here something went wrong, so don't release it again
  if exist "%DIR%\poe-helper-update.zip" (
    move /y "%DIR%\poe-helper-update.zip" "%DIR%\poe-helper-update.failed.zip" >nul
    echo %DATE% %TIME% the update was not unpacked, renamed to poe-helper-update.failed.zip >> "%WLOG%"
  )
)
set /a N+=1
if %N% GEQ 1200 goto done
timeout /t 15 /nobreak >nul
goto loop
:done
echo %DATE% %TIME% stopped after 5 hours >> "%WLOG%"
echo Stopped after 5 hours.
