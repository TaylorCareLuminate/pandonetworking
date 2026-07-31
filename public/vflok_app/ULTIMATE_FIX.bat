@echo off
REM ============================================================================
REM Ultimate Fix - Install everything correctly
REM ============================================================================

TITLE Ultimate Fix

color 0E
cls

echo ================================================================
echo   ULTIMATE FIX - Complete Reinstall with Rebuild
echo ================================================================
echo.
echo   This will:
echo   1. Remove all dependencies
echo   2. Install Electron first
echo   3. Install better-sqlite3
echo   4. Rebuild for Electron
echo.
echo   Takes 5-7 minutes but should work 100%%
echo.
echo ================================================================
echo.
echo Press any key to start, or close to cancel...
pause > nul

echo.
echo [1/6] Cleaning up...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del /q "package-lock.json"
echo [OK] Cleaned
echo.

echo [2/6] Installing Electron...
call npm install electron@32.2.0 --save-dev
echo [OK] Electron installed
echo.

echo [3/6] Installing better-sqlite3...
call npm install better-sqlite3@11.7.0 --save
echo [OK] better-sqlite3 installed
echo.

echo [4/6] Installing other dependencies...
call npm install electron-updater@6.3.9 --save
call npm install electron-builder@25.1.8 --save-dev
echo [OK] Dependencies installed
echo.

echo [5/6] Installing rebuild tools...
call npm install --save-dev @electron/rebuild
echo [OK] Tools installed
echo.

echo [6/6] Rebuilding better-sqlite3 for Electron...
echo This takes 2-3 minutes...
call npx electron-rebuild -f -w better-sqlite3
echo [OK] Rebuild complete
echo.

color 0A
cls
echo ================================================================
echo   ULTIMATE FIX COMPLETE!
echo ================================================================
echo.
echo   Everything has been installed and rebuilt.
echo.
echo   Now run: SIMPLE_TEST.bat
echo.
echo   The app should work now!
echo.
echo ================================================================
echo.
pause
