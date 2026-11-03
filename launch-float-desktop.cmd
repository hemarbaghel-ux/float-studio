@echo off
setlocal
set "ROOT=%~dp0"
echo ============================================================
echo   FLOAT Studio - Native Code-OSS Desktop IDE Monorepo
echo   Physical Scale: 2.76M tracked LOC ^| 8,688 source files
echo ============================================================
echo Launching FLOAT Studio Native Desktop IDE...
set "VSCODE_DEV=1"
set "NODE_ENV=development"
set "ELECTRON_ENABLE_LOGGING=1"
cd /d "%ROOT%desktop"
start "" "%ROOT%desktop\.build\electron\FLOAT.exe" . "%ROOT%." %*
endlocal
