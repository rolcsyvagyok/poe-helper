@echo off
setlocal
cd /d "%~dp0"
set "LOG=%~dp0release-log.txt"
echo PoE Helper release %DATE% %TIME% > "%LOG%"
if not exist "%~dp0poe-helper-1.0.0.zip" goto unpacked
echo Unpacking 1.0.0...
powershell -NoProfile -Command "$t = Join-Path $env:TEMP 'poeh-100'; Remove-Item -Recurse -Force $t -ErrorAction SilentlyContinue; Expand-Archive -Force -LiteralPath '%~dp0poe-helper-1.0.0.zip' -DestinationPath $t" >> "%LOG%" 2>&1
robocopy "%TEMP%\poeh-100\poe-helper" "%~dp0." /E /NFL /NDL /NJH /NJS >> "%LOG%" 2>&1
echo unpack robocopy exit %ERRORLEVEL% >> "%LOG%"
del "%~dp0poe-helper-1.0.0.zip"
:unpacked
for /f "tokens=2*" %%a in ('reg query HKCU\Environment /v GH_TOKEN 2^>nul ^| find "GH_TOKEN"') do set "GH_TOKEN=%%b"
if "%GH_TOKEN%"=="" goto notoken
echo GH_TOKEN found >> "%LOG%"
echo Committing and pushing...
git add -A >> "%LOG%" 2>&1
git commit -m "PoE Helper 1.0.0" >> "%LOG%" 2>&1
git push >> "%LOG%" 2>&1
echo git push exit %ERRORLEVEL% >> "%LOG%"
echo Installing build tools, this takes a few minutes the first time...
call npm install --no-fund --no-audit >> "%LOG%" 2>&1
echo npm install exit %ERRORLEVEL% >> "%LOG%"
echo Building and uploading the release...
call npm run release >> "%LOG%" 2>&1
echo npm run release exit %ERRORLEVEL% >> "%LOG%"
goto end
:notoken
echo GH_TOKEN is not set >> "%LOG%"
echo GH_TOKEN is not set. Run setx GH_TOKEN "your token" first.
:end
echo DONE >> "%LOG%"
echo Done. You can close this window.
pause
