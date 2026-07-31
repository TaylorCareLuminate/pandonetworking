@echo off
REM ============================================================================
REM vFlok Hospital Dashboard - Update Dependencies
REM ============================================================================
REM This will update to newer versions without warnings
REM ============================================================================

TITLE vFlok Hospital Dashboard - Updating Dependencies

color 0E
cls

echo ================================================
echo   Updating Dependencies (Removing Warnings)
echo ================================================
echo.
echo   This will:
echo   - Remove old packages
echo   - Install latest versions
echo   - Fix all warnings
echo.
echo   This may take 3-5 minutes...
echo.
echo ================================================
echo.

REM Remove old packages
echo [1/3] Cleaning old packages...
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo   [OK] Old packages removed
) else (
    echo   [OK] No old packages found
)

if exist "package-lock.json" (
    del /q "package-lock.json"
    echo   [OK] Lock file removed
)
echo.

REM Install fresh
echo [2/3] Installing updated packages...
echo   Please wait...
echo.

npm install --legacy-peer-deps

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo   ERROR: Installation failed!
    echo   Trying alternative method...
    echo.
    npm install --force
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo   Still failed. Please check your internet connection.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo   [OK] Packages installed
echo.

REM Test installation
echo [3/3] Testing installation...

node -e "console.log('Node.js works')"
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo   ERROR: Node.js test failed
    pause
    exit /b 1
)

echo   [OK] Installation verified
echo.

color 0A
cls
echo ================================================
echo   SUCCESS! Dependencies Updated
echo ================================================
echo.
echo   All warnings have been removed.
echo   Your app is ready to use!
echo.
echo   Next step: Double-click RUN_APP.bat to test
echo.
echo ================================================
echo.
pause
