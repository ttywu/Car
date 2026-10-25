@echo off
rem Starts a local server and opens Beyond Power Control as a desktop app window.
cd /d "%~dp0"
start "" /min python -m http.server 8123
timeout /t 2 /nobreak >nul
start "" msedge --app=http://localhost:8123/
