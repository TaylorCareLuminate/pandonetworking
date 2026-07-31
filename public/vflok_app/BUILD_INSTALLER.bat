@echo off
REM ============================================================================
REM vFlok Hospital Dashboard - Build Installer
REM ============================================================================
REM Double-click this file to build the Windows installer
REM ============================================================================

TITLE vFlok Hospital Dashboard - Build Installer

cls
echo ================================================
echo   Building Windows Installer
echo ================================================
echo.
echo   This will create a distributable installer
echo   that you can send to others.
echo.
echo   This may take 5-10 minutes...
echo.
echo ================================================
echo.

npm run build:win

if %ERRORLEVEL% EQU 0 (
    color 0A
    cls
    echo ================================================
    echo   SUCCESS! Installer Built
    echo ================================================
    echo.
    echo   Your installer is ready in the 'dist' folder:
    echo.
    echo   - vFlok Hospital Dashboard-Setup-1.0.0.exe
    echo.
    echo   File size: ~80-120 MB
    echo.
    echo   You can now send this file to others!
    echo   They just need to double-click it to install.
    echo.
    echo ================================================
    echo.
    
    REM Open dist folder
    explorer dist
) else (
    color 0C
    echo.
    echo   ERROR: Build failed!
    echo   Please check the error messages above.
    echo.
)

echo.
pause
