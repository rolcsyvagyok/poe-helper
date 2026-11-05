@echo off
cd /d "%~dp0"
echo Adding the missing update files to the GitHub release...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\gh-release.ps1" -Mode fix > "%~dp0fix-release-log.txt" 2>&1
type "%~dp0fix-release-log.txt"
echo.
echo Done. You can close this window.
pause
