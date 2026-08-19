@echo off
setlocal
cd /d "%~dp0"
set "SHARE_MASTER_STORE_ROOT=%~dp0share-master-data"
set "SHARE_MASTER_SKILL_SOURCES=%USERPROFILE%\.agents\skills;%USERPROFILE%\.codex\skills"
set "PACKAGED_APP=%~dp0release\win-unpacked\Share Master.exe"
if exist "%PACKAGED_APP%" (
  start "" "%PACKAGED_APP%" --user-data-dir="%~dp0share-master-profile"
) else if exist "%~dp0release\runtime\win-unpacked\Share Master.exe" (
  start "" "%~dp0release\runtime\win-unpacked\Share Master.exe" --user-data-dir="%~dp0share-master-profile"
) else (
  call npm run build:icon >nul
  if errorlevel 1 exit /b 1
  call npm run build:renderer >nul
  if errorlevel 1 exit /b 1
  start "" "%~dp0node_modules\electron\dist\electron.exe" --user-data-dir="%~dp0share-master-profile" .
)
endlocal
