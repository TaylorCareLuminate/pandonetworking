@echo off
REM ============================================================================
REM Install Windows Build Tools
REM ============================================================================

TITLE Installing Windows Build Tools

color 0E
cls

echo ================================================================
echo   Installing Windows Build Tools
echo ================================================================
echo.
echo   This installs the tools needed to compile native modules
echo   on Windows (Python + Visual Studio Build Tools).
echo.
echo   This is a ONE-TIME install (about 3GB download).
echo   Takes 10-15 minutes.
echo.
echo   After this, all native modules will work!
echo.
echo ================================================================
echo.
echo IMPORTANT: Run this as Administrator!
echo Right-click and choose "Run as administrator"
echo.
echo ================================================================
echo.
pause

echo.
echo Installing windows-build-tools...
echo.
echo This will:
echo   - Install Python (if needed)
echo   - Install Visual Studio Build Tools
echo   - Configure everything automatically
echo.
echo The installer window may appear in the background.
echo Please wait until you see "SUCCESS" below.
echo.

npm install --global windows-build-tools

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo ================================================================
    echo   SUCCESS! Build tools installed
    echo ================================================================
    echo.
    echo   Now you can compile native modules!
    echo.
    echo   Next step: Run ULTIMATE_FIX.bat again
    echo   It will work this time!
    echo.
) else (
    color 0C
    echo.
    echo ================================================================
    echo   Installation had issues
    echo ================================================================
    echo.
    echo   Alternative: Try PREBUILT_BINARY.bat
    echo   It downloads precompiled files instead.
    echo.
)

echo ================================================================
echo.
pause
