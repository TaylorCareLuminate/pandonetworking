@echo off
REM ============================================================================
REM vFlok Hospital Dashboard - Run App
REM ============================================================================
REM Double-click this file to run the app
REM ============================================================================

TITLE vFlok Hospital Dashboard

cls
echo ================================================
echo   vFlok Hospital Dashboard
echo ================================================
echo.
echo   Starting the app...
echo   A new window will open.
echo.
echo   Press Ctrl+C here to stop the app when done.
echo.
echo ================================================
echo.

npm start

set EXIT_CODE=%ERRORLEVEL%

echo.
echo.
echo ================================================
if %EXIT_CODE% EQU 0 (
    echo   App closed normally
) else (
    color 0C
    echo   ERROR: App exited with code %EXIT_CODE%
    echo.
    echo   This usually means:
    echo   1. better-sqlite3 needs rebuilding
    echo   2. A module failed to load
    echo.
    echo   Try running: FIX_MODULES.bat
)
echo ================================================
echo.
echo Press any key to close...
pause > nul
