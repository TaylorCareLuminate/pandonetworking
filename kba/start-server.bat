@echo off
echo 🚀 Starting KBA Slidedecks Scanner Server...
echo.
cd /d "%~dp0"
node scan-slidedecks.js
pause 