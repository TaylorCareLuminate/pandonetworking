@echo off
REM ============================================================================
REM Complete Reinstall - Start Fresh
REM ============================================================================

TITLE Complete Reinstall

color 0E
cls

echo ================================================
echo   Complete Clean Reinstall
echo ================================================
echo.
echo   This will remove everything and start fresh.
echo   Takes about 5 minutes.
echo.
echo   Your database file will NOT be deleted.
echo.
echo ================================================
echo.
echo Press any key to start, or close this window to cancel...
pause > nul

echo.
echo [1/4] Removing old installations...
echo.

if exist "node_modules" (
    echo Removing node_modules...
    rmdir /s /q "node_modules"
)

if exist "package-lock.json" (
    echo Removing package-lock.json...
    del /q "package-lock.json"
)

echo [OK] Old files removed
echo.

echo [2/4] Installing core dependencies...
echo.

npm install electron@32.2.0 --save-dev
npm install better-sqlite3@11.7.0 --save
npm install electron-updater@6.3.9 --save

echo.
echo [3/4] Installing build tools...
echo.

npm install electron-builder@25.1.8 --save-dev

echo.
echo [4/4] Rebuilding native modules...
echo.

npm install --save-dev @electron/rebuild
npx electron-rebuild

if %ERRORLEVEL% NEQ 0 (
    echo Warning: Rebuild had issues, trying alternative...
    npm rebuild better-sqlite3 --update-binary
)

color 0A
cls
echo ================================================
echo   Reinstall Complete!
echo ================================================
echo.
echo   Now try running: RUN_APP.bat
echo.
echo   If it still doesn't work, run: TEST_ELECTRON.bat
echo   to see detailed diagnostics.
echo.
echo ================================================
echo.
pause
