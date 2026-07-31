@echo off
REM ============================================================================
REM Remove Password and Auto-Load All Data - Simple Version
REM ============================================================================

TITLE Remove Password and Auto-Load Data

color 0E
cls

echo ================================================================
echo   Remove Password and Auto-Load All Data
echo ================================================================
echo.
echo   This will modify your dashboard to:
echo   1. Remove password protection
echo   2. Load all data automatically on startup
echo.
echo   Makes it easier for clients to use!
echo.
echo ================================================================
echo.
pause

echo.
echo Checking for Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python not found. Installing changes manually...
    echo.
    goto manual
)

echo [OK] Python found
echo.
echo Running Python script to make changes...
python remove_password.py

goto end

:manual
echo ================================================================
echo   Manual Instructions
echo ================================================================
echo.
echo   Python is not installed. Please make these changes manually:
echo.
echo   1. Open: renderer\index_base.html
echo.
echo   2. Find line with: let allDataLoaded = false;
echo      Change to: let allDataLoaded = true;
echo.
echo   3. Find the "Password Modal" section (around line 2336)
echo      Delete or comment out the entire modal div
echo.
echo   4. Find function checkAuth() and replace with:
echo      function checkAuth() { loadHospitalsData(); }
echo.
echo   5. Save the file
echo.
echo ================================================================
echo.

:end
pause
