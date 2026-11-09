@echo off
rem Brings GitHub's copy of the code up to date with this folder. GitHub's history is kept: its commits are
rem merged in with "ours", so every file stays exactly as it is here and nothing on GitHub is overwritten or deleted.
setlocal
cd /d "%~dp0"
set "LOG=%~dp0sync-log.txt"
echo PoE Helper GitHub sync %DATE% %TIME% > "%LOG%"
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%b"
echo branch %BR% >> "%LOG%"
git rm --cached -q release-log.txt sync-log.txt >nul 2>&1
git add -A >> "%LOG%" 2>&1
git commit -m "PoE Helper: local changes" >> "%LOG%" 2>&1
git fetch origin >> "%LOG%" 2>&1
echo fetch exit %ERRORLEVEL% >> "%LOG%"
git merge -s ours --allow-unrelated-histories --no-edit -m "Keep this folder's code, with GitHub's history" origin/main >> "%LOG%" 2>&1
echo merge exit %ERRORLEVEL% >> "%LOG%"
git push origin HEAD:main >> "%LOG%" 2>&1
echo push exit %ERRORLEVEL% >> "%LOG%"
git branch --set-upstream-to=origin/main >> "%LOG%" 2>&1
git log --oneline -3 >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. You can close this window.
pause
