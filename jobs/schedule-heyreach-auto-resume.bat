@echo off
REM Batch file to schedule HeyReach Auto-Resume job
REM This launches the PowerShell script with Administrator privileges

echo.
echo ========================================================
echo    HeyReach Auto-Resume Scheduler
echo ========================================================
echo.
echo This will create a Windows scheduled task to automatically
echo resume priority HeyReach campaigns every night at 2:00 AM.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause > nul

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell not found!
    echo Please ensure PowerShell is installed.
    pause
    exit /b 1
)

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Run PowerShell script as Administrator
echo.
echo Launching PowerShell as Administrator...
echo Please approve the UAC prompt if prompted.
echo.

powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%SCRIPT_DIR%schedule-heyreach-auto-resume.ps1\"' -Verb RunAs"

echo.
echo If a new PowerShell window opened, please complete the setup there.
echo This window can be closed.
echo.
pause











