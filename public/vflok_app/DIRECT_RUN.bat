@echo off
REM ============================================================================
REM Direct Electron Launch - Bypass npm
REM ============================================================================

TITLE Direct Electron Test

cls
echo.
echo ================================================================
echo   DIRECT TEST - Running Electron directly
echo ================================================================
echo.
echo This bypasses npm and runs Electron directly.
echo.
echo Press any key to start...
echo ================================================================
echo.
pause > nul

echo.
echo Checking if Electron exists...
echo.

if exist "node_modules\.bin\electron.cmd" (
    echo [OK] Found: node_modules\.bin\electron.cmd
    echo.
    echo Starting app...
    echo.
    call node_modules\.bin\electron.cmd .
) else if exist "node_modules\electron\dist\electron.exe" (
    echo [OK] Found: node_modules\electron\dist\electron.exe
    echo.
    echo Starting app...
    echo.
    call node_modules\electron\dist\electron.exe .
) else (
    echo [ERROR] Electron executable not found!
    echo.
    echo Checking what's in node_modules...
    dir node_modules\electron /s /b | findstr "electron.exe"
    echo.
    echo Trying with npx...
    npx electron .
)

set EXIT_CODE=%ERRORLEVEL%

echo.
echo.
echo ================================================================
if %EXIT_CODE% EQU 0 (
    echo   App ran successfully!
) else (
    echo   ERROR: Exit code %EXIT_CODE%
)
echo ================================================================
echo.
echo Press any key to close...
pause > nul
