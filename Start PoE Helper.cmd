@echo off
rem PoE Helper: double-click this file.
rem The first time it installs what the app needs (a few minutes), then it puts
rem "PoE Helper" shortcuts on your Desktop and in the Start menu. After that, use those.
setlocal
cd /d "%~dp0"
set "APPDIR=%~dp0"
set "EXE=%~dp0node_modules\electron\dist\electron.exe"

if exist "%EXE%" goto shortcuts

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  echo Install the LTS version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo First start: installing PoE Helper. This takes a few minutes...
call npm install --no-fund --no-audit
rem npm 11 can skip Electron's own download step; run it directly if needed
if not exist "%EXE%" call node "node_modules\electron\install.js"
if not exist "%EXE%" (
  echo.
  echo Electron could not be downloaded. Check your internet connection and double-click this file again.
  pause
  exit /b 1
)

:shortcuts
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { $s = $w.CreateShortcut((Join-Path $d 'PoE Helper.lnk')); $s.TargetPath = $env:EXE; $s.Arguments = '.'; $s.WorkingDirectory = $env:APPDIR; $s.IconLocation = (Join-Path $env:APPDIR 'assets\icon.ico'); $s.Description = 'PoE Helper'; $s.Save() }" >nul 2>nul

start "" /d "%APPDIR%" "%EXE%" .
exit /b 0
