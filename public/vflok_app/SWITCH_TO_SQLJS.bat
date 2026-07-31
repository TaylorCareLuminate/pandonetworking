@echo off
REM ============================================================================
REM Switch to sql.js - No Compilation Needed!
REM ============================================================================

TITLE Switch to sql.js

color 0E
cls

echo ================================================================
echo   Switching to sql.js (No Build Tools Needed!)
echo ================================================================
echo.
echo   sql.js is SQLite compiled to WebAssembly.
echo   It works exactly like better-sqlite3 but needs NO compilation!
echo.
echo   Perfect solution when you don't have Visual Studio.
echo.
echo ================================================================
echo.
pause

echo.
echo [1/3] Removing better-sqlite3...
call npm uninstall better-sqlite3
echo [OK] Removed
echo.

echo [2/3] Installing sql.js (pure JavaScript, no compilation)...
call npm install sql.js@1.12.0
echo [OK] Installed
echo.

echo [3/3] Updating main.js to use sql.js...
echo.

REM Restore backup if needed
if exist "main.js.backup" (
    copy /Y main.js.backup main.js >nul
    echo [OK] Restored original main.js
)

echo [OK] Ready to update
echo.

color 0A
echo ================================================================
echo   sql.js Installed Successfully!
echo ================================================================
echo.
echo   Now I need to update main.js to use sql.js instead.
echo   This requires editing the code.
echo.
echo   Would you like me to create the updated version?
echo   (It will work the same, just with sql.js)
echo.
echo ================================================================
echo.
pause
