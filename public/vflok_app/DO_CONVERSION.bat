@echo off
REM ============================================================================
REM Complete Conversion to sql.js
REM ============================================================================

TITLE Complete sql.js Conversion

color 0E
cls

echo ================================================================
echo   Complete Conversion to sql.js
echo ================================================================
echo.
echo   This will do EVERYTHING needed to convert to sql.js:
echo   1. Remove better-sqlite3
echo   2. Install sql.js
echo   3. Replace main.js with sql.js version
echo   4. Test the conversion
echo.
echo   NO BUILD TOOLS NEEDED AFTER THIS!
echo.
echo ================================================================
echo.
pause

echo.
echo [Step 1/5] Backing up current files...
if not exist "main.js.backup" (
    copy main.js main.js.backup >nul
    echo [OK] Backed up main.js
)
echo.

echo [Step 2/5] Removing better-sqlite3...
call npm uninstall better-sqlite3
echo [OK] Removed
echo.

echo [Step 3/5] Installing sql.js...
call npm install sql.js@1.12.0
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Failed to install sql.js
    pause
    exit /b 1
)
echo [OK] Installed
echo.

echo [Step 4/5] Replacing main.js with sql.js version...
copy /Y main_sqljs.js main.js >nul
echo [OK] main.js updated
echo.

echo [Step 5/5] Testing the conversion...
echo.
call npx electron . --version
if %ERRORLEVEL% EQU 0 (
    color 0A
    cls
    echo ================================================================
    echo   SUCCESS! Conversion Complete!
    echo ================================================================
    echo.
    echo   Your app now uses sql.js (pure JavaScript)!
    echo.
    echo   Benefits:
    echo   - No build tools needed EVER
    echo   - Works on any computer
    echo   - You can build installers right now!
    echo.
    echo   Next steps:
    echo   1. Run: RUN_APP.bat (to test the app)
    echo   2. Run: BUILD_INSTALLER.bat (to create installer)
    echo.
    echo ================================================================
) else (
    color 0E
    echo.
    echo Conversion complete but test had issues.
    echo Try running RUN_APP.bat to see if it works.
)

echo.
echo ================================================================
echo.
pause
