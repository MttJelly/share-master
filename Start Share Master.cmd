@echo off
setlocal
cd /d "%~dp0"
set "SHARE_MASTER_STORE_ROOT=%~dp0share-master-data"
set "SHARE_MASTER_SKILL_SOURCES=C:\Users\PC\.agents\skills;C:\Users\PC\.codex\skills"
start "" "%~dp0node_modules\electron\dist\electron.exe" --user-data-dir="%~dp0share-master-profile" .
endlocal
