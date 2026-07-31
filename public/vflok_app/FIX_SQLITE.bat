@echo off
REM ============================================================================
REM Fix better-sqlite3 for Electron
REM ============================================================================

TITLE Fixing better-sqlite3

color 0E
cls

echo ================================================================
echo   Fixing better-sqlite3 for Electron
echo ================================================================
echo.
echo   This will rebuild better-sqlite3 to work with Electron.
echo   Takes 2-3 minutes.
echo.
echo ================================================================
echo.
pause

echo.
echo [Step 1/4] Installing electron-rebuild...
echo.
call npm install --save-dev @electron/rebuild
echo.

echo [Step 2/4] Checking better-sqlite3 installation...
echo.
if not exist "node_modules\better-sqlite3" (
    echo Installing better-sqlite3...
    call npm install better-sqlite3@11.7.0
)
echo.

echo [Step 3/4] Rebuilding better-sqlite3 for Electron...
echo.
echo This may take a few minutes, please wait...
echo.
call npx electron-rebuild -f -w better-sqlite3

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Rebuild failed, trying alternative method...
    echo.
    call npm rebuild better-sqlite3 --update-binary
)
echo.

echo [Step 4/4] Testing if it worked...
echo.
call node -e "try { require('better-sqlite3'); console.log('[SUCCESS] better-sqlite3 module loads'); } catch(e) { console.log('[FAILED] Error:', e.message); process.exit(1); }"

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo ================================================================
    echo   SUCCESS! better-sqlite3 is now working
    echo ================================================================
    echo.
    echo   Now try running: SIMPLE_TEST.bat
    echo   The app should open!
    echo.
) else (
    color 0C
    echo.
    echo ================================================================
    echo   Rebuild had issues
    echo ================================================================
    echo.
    echo   Try: INSTALL_PREBUILT.bat for a simpler solution
    echo.
)

echo ================================================================
echo.
pause
