@echo off
set "ROOT=%~dp0"
echo Launching FLOAT Studio in VSCodium Portable...
start "" "%ROOT%tools\vscodium\VSCodium.exe" --extensionDevelopmentPath="%ROOT%extensions\float-vscodium-poc" "%ROOT%."
