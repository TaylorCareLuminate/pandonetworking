@echo off
REM ============================================================================
REM vFlok Hospital Dashboard - Debug Mode
REM ============================================================================
REM This runs the app with detailed error messages
REM ============================================================================

TITLE vFlok Hospital Dashboard - Debug Mode

color 0B
cls

echo ================================================
echo   vFlok Hospital Dashboard - Debug Mode
echo ================================================
echo.
echo   Running with detailed error messages...
echo   This will help us see what's wrong.
echo.
echo ================================================
echo.
echo Press any key to start checking...
pause > nul
echo.

REM Set debug environment
set NODE_ENV=development
set ELECTRON_ENABLE_LOGGING=1
set DEBUG=*

REM Check database first
echo [Step 1/5] Checking database file...
echo.

if not exist "database\vflok_hospitals.db" (
    color 0C
    echo ERROR: Database file not found!
    echo.
    echo Expected location: database\vflok_hospitals.db
    echo.
    echo Please ensure:
    echo 1. You ran create_database.R in R
    echo 2. The file vflok_hospitals.db exists
    echo 3. It was copied to the database folder
    echo.
    
    if exist "vflok_hospitals.db" (
        echo Found vflok_hospitals.db in current folder!
        echo Copying to database folder...
        if not exist "database" mkdir database
        copy /Y "vflok_hospitals.db" "database\vflok_hospitals.db"
        echo.
        echo [OK] Database copied. Trying again...
        echo.
    ) else (
        echo Database not found anywhere!
        echo Please run create_database.R first.
        echo.
        echo Press any key to exit...
        pause > nul
        exit /b 1
    )
)

echo   [OK] Database found: database\vflok_hospitals.db
for %%A in ("database\vflok_hospitals.db") do echo   Size: %%~zA bytes
echo.
timeout /t 2 > nul

echo [Step 2/5] Checking renderer files...
if not exist "renderer\index.html" (
    color 0C
    echo   ERROR: renderer\index.html not found!
    echo.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo   [OK] renderer\index.html exists
echo.

if not exist "renderer\index_base.html" (
    color 0E
    echo   WARNING: renderer\index_base.html not found!
    echo   This is your dashboard file. It should be copied from vflok_dashboard.html
    echo.
)
echo.
timeout /t 2 > nul

echo [Step 3/5] Checking dependencies...
if not exist "node_modules" (
    color 0C
    echo   ERROR: Dependencies not installed!
    echo.
    echo   Please run INSTALL.bat first.
    echo.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo   [OK] node_modules folder exists
echo.
timeout /t 2 > nul

echo [Step 4/5] Checking main files...
if not exist "main.js" (
    color 0C
    echo   ERROR: main.js not found!
    echo.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo   [OK] main.js exists

if not exist "preload.js" (
    color 0C
    echo   ERROR: preload.js not found!
    echo.
    echo Press any key to exit...
    pause > nul
    exit /b 1
)
echo   [OK] preload.js exists
echo.
timeout /t 2 > nul

echo [Step 5/5] Starting app with debug output...
echo.
echo ================================================
echo   IMPORTANT: Keep this window open!
echo   Error messages will appear here.
echo.
echo   Starting in 3 seconds...
echo ================================================
echo.
timeout /t 3

npm start

set EXIT_CODE=%ERRORLEVEL%

echo.
echo.
echo ================================================
echo   App closed with exit code: %EXIT_CODE%
echo ================================================
echo.

if %EXIT_CODE% NEQ 0 (
    color 0C
    echo   ERROR: App exited with an error!
    echo   Please read the messages above.
) else (
    color 0A
    echo   App closed normally.
)

echo.
echo Press any key to close this window...
pause > nul
