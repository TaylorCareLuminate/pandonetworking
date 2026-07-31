@echo off
echo.
echo ========================================
echo   Starting Secure Download Server
echo ========================================
echo.

cd /d "%~dp0"

echo Checking if Node.js is available...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    goto :end
)

echo ✅ Node.js is available

echo.
echo Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

echo.
echo Starting secure download server on port 3002...
echo.
echo 🔒 This server provides secure downloads with proper headers
echo 📥 Downloads will be served with Content-Disposition headers
echo 🛡️  Files are served with security headers to prevent browser warnings
echo.
echo Press Ctrl+C to stop the server
echo.

node download-server.js

:end
echo.
pause 