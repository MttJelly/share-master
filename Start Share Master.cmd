@echo off
setlocal
cd /d "%~dp0"
set "SHARE_MASTER_STORE_ROOT=%~dp0share-master-data"
set "SHARE_MASTER_SKILL_SOURCES=%USERPROFILE%\.agents\skills;%USERPROFILE%\.codex\skills"
call npm run build:renderer >nul
if errorlevel 1 exit /b 1
start "" "%~dp0node_modules\electron\dist\electron.exe" --user-data-dir="%~dp0share-master-profile" .
endlocal
