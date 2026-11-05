@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0release-log.txt"
echo PoE Helper release %DATE% %TIME% > "%LOG%"
if exist "%~dp0poe-helper-1.0.0.zip" ren "%~dp0poe-helper-1.0.0.zip" poe-helper-update.zip
if not exist "%~dp0poe-helper-update.zip" goto unpacked
echo Unpacking the new version...
powershell -NoProfile -Command "$t = Join-Path $env:TEMP 'poeh-100'; Remove-Item -Recurse -Force $t -ErrorAction SilentlyContinue; Expand-Archive -Force -LiteralPath '%~dp0poe-helper-update.zip' -DestinationPath $t" >> "%LOG%" 2>&1
robocopy "%TEMP%\poeh-100\poe-helper" "%~dp0." /E /NFL /NDL /NJH /NJS >> "%LOG%" 2>&1
echo unpack robocopy exit %ERRORLEVEL% >> "%LOG%"
del "%~dp0poe-helper-update.zip"
:unpacked
for /f "tokens=2*" %%a in ('reg query HKCU\Environment /v GH_TOKEN 2^>nul ^| find "GH_TOKEN"') do set "GH_TOKEN=%%b"
if "%GH_TOKEN%"=="" goto notoken
echo GH_TOKEN found >> "%LOG%"
echo Committing and pushing...
git rm --cached -q release-log.txt >nul 2>&1
git add -A >> "%LOG%" 2>&1
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VER=%%v"
git commit -m "PoE Helper %VER%" >> "%LOG%" 2>&1
git push >> "%LOG%" 2>&1
echo git push exit %ERRORLEVEL% >> "%LOG%"
rem GitHub only publishes a release for an existing tag, so make v<version> first
git rev-parse -q --verify "refs/tags/v%VER%" >nul 2>&1 || git tag "v%VER%" >> "%LOG%" 2>&1
git push origin "v%VER%" >> "%LOG%" 2>&1
echo tag v%VER% push exit %ERRORLEVEL% >> "%LOG%"
echo Installing build tools, this takes a few minutes the first time...
call npm install --no-fund --no-audit >> "%LOG%" 2>&1
echo npm install exit %ERRORLEVEL% >> "%LOG%"
node scripts/release-notes.js >> "%LOG%" 2>&1
echo Creating the GitHub release first, so all files land in one release... 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\gh-release.ps1" -Mode create >> "%LOG%" 2>&1
echo Building and uploading the release...
call npm run release >> "%LOG%" 2>&1
echo npm run release exit %ERRORLEVEL% >> "%LOG%"
echo Checking that the release has every file the updater needs...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\gh-release.ps1" -Mode fix >> "%LOG%" 2>&1
echo release check exit %ERRORLEVEL% >> "%LOG%"
goto end
:notoken
echo GH_TOKEN is not set >> "%LOG%"
echo GH_TOKEN is not set. Run setx GH_TOKEN "your token" first.
:end
echo DONE >> "%LOG%"
echo Done. You can close this window.
pause
