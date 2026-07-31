@echo off
REM ============================================================================
REM Fix Native Modules - Rebuild better-sqlite3
REM ============================================================================

TITLE Rebuilding Native Modules

color 0E
cls

echo ================================================
echo   Rebuilding Native Modules
echo ================================================
echo.
echo   This fixes issues with better-sqlite3
echo   and other native modules.
echo.
echo   Takes 2-3 minutes...
echo.
echo ================================================
echo.
pause

echo [1/3] Installing electron-rebuild...
npm install --save-dev electron-rebuild

echo.
echo [2/3] Rebuilding better-sqlite3 for Electron...
echo.

npx electron-rebuild -f -w better-sqlite3

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Rebuild failed. Trying alternative method...
    echo.
    
    REM Try npm rebuild
    npm rebuild better-sqlite3 --update-binary
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Still failed. Installing from scratch...
        echo.
        npm uninstall better-sqlite3
        npm install better-sqlite3 --build-from-source
    )
)

echo.
echo [3/3] Verifying installation...
echo.

node -e "try { require('better-sqlite3'); console.log('SUCCESS: better-sqlite3 loaded'); } catch(e) { console.log('ERROR:', e.message); process.exit(1); }"

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo ================================================
    echo   SUCCESS! Native modules rebuilt
    echo ================================================
    echo.
    echo   Now try running RUN_APP.bat again
    echo.
) else (
    color 0C
    echo.
    echo ================================================
    echo   ERROR: Still having issues
    echo ================================================
    echo.
    echo   Please try running UPDATE_DEPENDENCIES.bat
    echo.
)

echo.
pause
