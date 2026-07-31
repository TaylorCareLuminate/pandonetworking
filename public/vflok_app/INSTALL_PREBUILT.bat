@echo off
REM ============================================================================
REM Alternative: Use prebuilt better-sqlite3
REM ============================================================================

TITLE Install Prebuilt better-sqlite3

color 0E
cls

echo ================================================================
echo   Installing Prebuilt better-sqlite3
echo ================================================================
echo.
echo   This uses a precompiled version that should work
echo   without rebuilding. Faster and more reliable!
echo.
echo ================================================================
echo.
pause

echo.
echo [1/3] Removing old better-sqlite3...
echo.
call npm uninstall better-sqlite3
echo.

echo [2/3] Installing specific working version...
echo.
call npm install better-sqlite3@11.7.0 --build-from-source=false
echo.

echo [3/3] Testing installation...
echo.
call npx electron . --version

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo ================================================================
    echo   SUCCESS! Installation complete
    echo ================================================================
    echo.
    echo   Now try running: SIMPLE_TEST.bat
    echo.
) else (
    color 0E
    echo.
    echo ================================================================
    echo   Partial success - try FIX_SQLITE.bat next
    echo ================================================================
    echo.
)

echo ================================================================
echo.
pause
