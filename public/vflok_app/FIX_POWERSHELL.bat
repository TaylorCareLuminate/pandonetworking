@echo off
REM ============================================================================
REM Fix PowerShell Execution Policy
REM ============================================================================
REM Run this as Administrator to fix the PowerShell security error

TITLE Fix PowerShell Execution Policy

color 0E
cls

echo ================================================================
echo   Fix PowerShell Execution Policy
echo ================================================================
echo.
echo   This fixes the error:
echo   "running scripts is disabled on this system"
echo.
echo   IMPORTANT: Right-click this file and choose
echo   "Run as administrator"
echo.
echo ================================================================
echo.
pause

echo.
echo Checking current execution policy...
powershell -Command "Get-ExecutionPolicy"
echo.

echo Setting execution policy to RemoteSigned...
echo This allows local scripts to run.
echo.

powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo ================================================================
    echo   SUCCESS! PowerShell is now configured
    echo ================================================================
    echo.
    echo   Now you can run:
    echo   npm install --global --production windows-build-tools
    echo.
    echo   Open PowerShell as Administrator and run that command.
    echo.
) else (
    color 0C
    echo.
    echo ================================================================
    echo   ERROR: Could not change policy
    echo ================================================================
    echo.
    echo   You may need to run this as Administrator.
    echo   Right-click this file and choose "Run as administrator"
    echo.
)

echo ================================================================
echo.
pause
