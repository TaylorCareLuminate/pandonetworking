@echo off
REM ============================================================================
REM Ultimate Simple Test - Just see if npm start works
REM ============================================================================

TITLE Ultimate Simple Test

cls
echo.
echo ================================================================
echo   SIMPLE TEST - Does npm start work?
echo ================================================================
echo.
echo This will run: npm start
echo.
echo Keep this window OPEN to see errors!
echo.
echo Press any key to try starting the app...
echo ================================================================
echo.
pause > nul

echo.
echo Starting now...
echo.
echo ================================================================
echo.

call npm start

echo.
echo.
echo ================================================================
echo   npm start finished with exit code: %ERRORLEVEL%
echo ================================================================
echo.

if %ERRORLEVEL% NEQ 0 (
    echo THERE WAS AN ERROR!
    echo.
    echo Common causes:
    echo   - better-sqlite3 needs rebuilding
    echo   - Electron version mismatch
    echo   - Missing dependencies
    echo.
    echo Solutions to try:
    echo   1. Run: CLEAN_REINSTALL.bat
    echo   2. Run: FIX_MODULES.bat
    echo.
) else (
    echo App ran successfully!
)

echo.
echo This window will stay open.
echo Press any key to close it...
echo.
pause > nul
