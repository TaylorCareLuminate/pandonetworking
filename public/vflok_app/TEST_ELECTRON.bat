@echo off
REM ============================================================================
REM Simple Test - Can we run Electron at all?
REM ============================================================================

TITLE Testing Electron

cls
echo ================================================
echo   Testing if Electron can run...
echo ================================================
echo.
echo Press any key to start tests...
pause > nul
echo.

echo Testing Node.js...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not working
    pause
    exit /b 1
)
echo [OK] Node.js works
echo.

echo Testing npm...
npm --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm not working
    pause
    exit /b 1
)
echo [OK] npm works
echo.

echo Testing if Electron is installed...
if not exist "node_modules\electron" (
    echo ERROR: Electron not found in node_modules
    echo.
    echo Installing Electron...
    npm install electron --save-dev
    echo.
)

echo.
echo Checking Electron version...
npx electron --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Electron won't run
    echo.
    echo Reinstalling Electron...
    npm uninstall electron
    npm install electron@latest --save-dev
)

echo.
echo [OK] Electron is installed
echo.

echo Testing better-sqlite3...
node -e "try { const db = require('better-sqlite3'); console.log('[OK] better-sqlite3 module loads'); } catch(e) { console.log('[ERROR] better-sqlite3 failed:', e.message); }"

echo.
echo ================================================
echo   Tests complete
echo ================================================
echo.
echo If you saw [ERROR] above, run FIX_MODULES.bat
echo If everything is [OK], the issue is in the app code.
echo.
pause
