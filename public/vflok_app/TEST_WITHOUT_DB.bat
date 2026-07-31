@echo off
REM ============================================================================
REM Alternative: Run WITHOUT better-sqlite3 (temporary test)
REM ============================================================================

TITLE Test Without Database

color 0E
cls

echo ================================================================
echo   Test App Without Database (Temporary)
echo ================================================================
echo.
echo   This will temporarily disable the database to see
echo   if Electron itself works.
echo.
echo   If this works, we know the ONLY problem is better-sqlite3.
echo.
echo ================================================================
echo.
pause

echo.
echo Creating test version of main.js...
echo.

REM Backup original
if not exist "main.js.backup" (
    copy main.js main.js.backup >nul
    echo [OK] Backed up main.js
)

REM Create simple test main.js
(
echo const { app, BrowserWindow } = require('electron'^);
echo.
echo let mainWindow;
echo.
echo function createWindow(^) {
echo   mainWindow = new BrowserWindow({
echo     width: 800,
echo     height: 600,
echo     title: 'vFlok Test - Without Database'
echo   }^);
echo.
echo   mainWindow.loadURL('https://google.com'^);
echo }
echo.
echo app.whenReady(^).then(createWindow^);
echo.
echo app.on('window-all-closed', (^) =^> {
echo   if (process.platform !== 'darwin'^) app.quit(^);
echo }^);
) > main_test.js

echo [OK] Created test version
echo.
echo Starting test app...
echo.

call npx electron main_test.js

set EXIT_CODE=%ERRORLEVEL%

echo.
echo ================================================================
if %EXIT_CODE% EQU 0 (
    color 0A
    echo   SUCCESS! Electron works!
    echo.
    echo   The problem is ONLY better-sqlite3.
    echo   Run: PREBUILT_BINARY.bat to fix it.
) else (
    color 0C
    echo   ERROR: Even basic Electron doesn't work
    echo.
    echo   There may be a deeper issue.
)
echo ================================================================
echo.
pause
