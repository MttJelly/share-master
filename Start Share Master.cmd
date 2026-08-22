@echo off
setlocal
cd /d "%~dp0"
set "SHARE_MASTER_STORE_ROOT=%~dp0share-master-data"
set "SHARE_MASTER_SKILL_SOURCES=%USERPROFILE%\.agents\skills;%USERPROFILE%\.codex\skills"
set "PACKAGED_DIR=%~dp0release\runtime\win-unpacked"
if not exist "%PACKAGED_DIR%\resources\app.asar" set "PACKAGED_DIR=%~dp0release\win-unpacked"
set "PACKAGED_APP=%PACKAGED_DIR%\Synclattice.exe"
if exist "%PACKAGED_APP%" if exist "%PACKAGED_DIR%\resources\app.asar" if exist "%PACKAGED_DIR%\resources.pak" (
  start "" "%PACKAGED_APP%" --user-data-dir="%~dp0share-master-profile"
) else (
  rem Ignore stale Share Master builds; run the current Synclattice source instead.
  call npm run build:icon >nul
  if errorlevel 1 exit /b 1
  call npm run build:renderer >nul
  if errorlevel 1 exit /b 1
  start "" "%~dp0node_modules\electron\dist\electron.exe" --user-data-dir="%~dp0share-master-profile" .
)
endlocal
