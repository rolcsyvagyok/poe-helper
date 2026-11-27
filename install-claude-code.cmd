@echo off
title Install Claude Code
echo Installing Claude Code (official installer from claude.ai). This takes a minute and shows no progress...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"
echo.
if exist "%USERPROFILE%\.local\bin\claude.exe" (
  echo Installed. Now sign in: follow the steps below, pick a theme, then log in with your Claude account in the browser. Type /exit when you are signed in.
  echo.
  "%USERPROFILE%\.local\bin\claude.exe"
) else (
  echo The install did not finish. See the messages above.
)
echo.
pause
