@echo off
REM ============================================================================
REM Download Prebuilt Binary for better-sqlite3
REM ============================================================================

TITLE Download Prebuilt Binary

color 0E
cls

echo ================================================================
echo   Downloading Prebuilt better-sqlite3 Binary
echo ================================================================
echo.
echo   This downloads a precompiled version of better-sqlite3
echo   that's already built for Electron. No compilation needed!
echo.
echo   Much faster than building from source.
echo.
echo ================================================================
echo.
pause

echo.
echo [1/5] Removing old better-sqlite3...
if exist "node_modules\better-sqlite3" (
    rmdir /s /q "node_modules\better-sqlite3"
)
echo [OK] Cleaned
echo.

echo [2/5] Creating package directory...
mkdir "node_modules\better-sqlite3" 2>nul
echo [OK] Directory created
echo.

echo [3/5] Installing better-sqlite3 with prebuild-install...
echo.
call npm install --save better-sqlite3@11.7.0 --force --prefer-offline=false

echo.
echo [4/5] Checking Electron version...
for /f "tokens=*" %%i in ('npx electron --version') do set ELECTRON_VERSION=%%i
echo Electron version: %ELECTRON_VERSION%
echo.

echo [5/5] Downloading prebuilt binary for Electron...
echo.
cd node_modules\better-sqlite3
call npm run install
cd ..\..

color 0A
echo.
echo ================================================================
echo   Download Complete!
echo ================================================================
echo.
echo   Try running: RUN_APP.bat
echo   It should work now!
echo.
echo ================================================================
echo.
pause
