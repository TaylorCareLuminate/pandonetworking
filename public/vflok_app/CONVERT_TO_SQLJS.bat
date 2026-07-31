@echo off
REM ============================================================================
REM Convert to sql.js - No Build Tools Needed!
REM ============================================================================

TITLE Converting to sql.js

color 0E
cls

echo ================================================================
echo   Converting to sql.js
echo ================================================================
echo.
echo   This will:
echo   1. Remove better-sqlite3
echo   2. Install sql.js (pure JavaScript)
echo   3. Update main.js to use sql.js
echo.
echo   After this, you can build installers with NO build tools!
echo.
echo ================================================================
echo.
pause

echo.
echo [Step 1/3] Removing better-sqlite3...
call npm uninstall better-sqlite3
echo [OK] Removed
echo.

echo [Step 2/3] Installing sql.js...
call npm install sql.js@1.12.0
echo [OK] Installed
echo.

echo [Step 3/3] Backing up main.js...
if not exist "main.js.backup" (
    copy main.js main.js.backup >nul
    echo [OK] Backed up original main.js
) else (
    echo [OK] Backup already exists
)
echo.

color 0A
echo ================================================================
echo   Packages Updated!
echo ================================================================
echo.
echo   sql.js is now installed.
echo   Now I'll update the code files...
echo.
echo ================================================================
echo.
pause
