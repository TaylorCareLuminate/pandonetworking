@echo off
REM ============================================================================
REM vFlok Hospital Dashboard - Easy Installer
REM ============================================================================
REM Just double-click this file to install and run!
REM ============================================================================

TITLE vFlok Hospital Dashboard - Installer

color 0B
cls

echo ================================================
echo   vFlok Hospital Dashboard - Easy Installer
echo ================================================
echo.

REM Check for Node.js
echo [1/4] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo   ERROR: Node.js not found!
    echo.
    echo   Please install Node.js from: https://nodejs.org/
    echo   Then run this installer again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo   [OK] Node.js found: %NODE_VERSION%
echo.

REM Check for database
echo [2/4] Checking database file...
if exist "vflok_hospitals.db" (
    echo   [OK] Database found
    
    REM Create database folder if needed
    if not exist "database" mkdir database
    
    REM Copy database
    copy /Y "vflok_hospitals.db" "database\vflok_hospitals.db" >nul
    echo   [OK] Database copied to database folder
) else (
    color 0C
    echo   ERROR: Database file not found!
    echo.
    echo   Please run create_database.R in R first to create vflok_hospitals.db
    echo   Then run this installer again.
    echo.
    pause
    exit /b 1
)
echo.

REM Install dependencies
echo [3/4] Installing dependencies...
echo   This may take 2-3 minutes on first install...
echo.

npm install
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo   ERROR: Failed to install dependencies!
    echo   Please check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo   [OK] Dependencies installed
echo.

REM Verify installation
echo [4/4] Verifying installation...

set MISSING=0
if not exist "main.js" (
    echo   [ERROR] main.js missing
    set MISSING=1
)
if not exist "preload.js" (
    echo   [ERROR] preload.js missing
    set MISSING=1
)
if not exist "package.json" (
    echo   [ERROR] package.json missing
    set MISSING=1
)
if not exist "renderer\index.html" (
    echo   [ERROR] renderer\index.html missing
    set MISSING=1
)
if not exist "database\vflok_hospitals.db" (
    echo   [ERROR] database\vflok_hospitals.db missing
    set MISSING=1
)

if %MISSING% EQU 1 (
    color 0C
    echo.
    echo   Some files are missing! Installation incomplete.
    echo.
    pause
    exit /b 1
)

echo   [OK] All files verified
echo.

REM Success!
color 0A
cls
echo ================================================
echo   SUCCESS! Installation Complete
echo ================================================
echo.
echo   Your vFlok Hospital Dashboard is ready!
echo.
echo   What would you like to do?
echo.
echo   1. Run the app now (test it)
echo   2. Build Windows installer (distribute to others)
echo   3. Exit (run later)
echo.
echo ================================================
echo.

choice /c 123 /n /m "Enter your choice (1, 2, or 3): "

if errorlevel 3 goto exit
if errorlevel 2 goto build
if errorlevel 1 goto run

:run
cls
echo ================================================
echo   Starting vFlok Hospital Dashboard...
echo ================================================
echo.
echo   The app will open in a new window.
echo   Press Ctrl+C here to stop it when done.
echo.
echo ================================================
echo.
npm start
goto end

:build
cls
echo ================================================
echo   Building Windows Installer...
echo ================================================
echo.
echo   This may take 5-10 minutes...
echo   The installer will be in the 'dist' folder.
echo.
echo ================================================
echo.
npm run build:win
echo.
echo ================================================
echo   Build Complete!
echo ================================================
echo.
echo   Your installer is ready in the 'dist' folder:
echo   - vFlok Hospital Dashboard-Setup-1.0.0.exe
echo.
echo   You can now distribute this file to others!
echo.
pause
goto end

:exit
cls
echo.
echo   Installation complete!
echo.
echo   To run the app later, double-click: RUN_APP.bat
echo   To build installer, double-click: BUILD_INSTALLER.bat
echo.
echo   See GETTING_STARTED.md for more information.
echo.
pause
goto end

:end
exit /b 0
