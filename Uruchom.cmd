@echo off
REM Launcher aplikacji Analizator Finansow.
REM Czyscimy ELECTRON_RUN_AS_NODE, bo gdy jest ustawiona, Electron startuje jak zwykly Node i aplikacja sie nie uruchamia.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
call npx electron .
