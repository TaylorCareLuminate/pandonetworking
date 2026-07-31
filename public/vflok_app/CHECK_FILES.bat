@echo off
REM ============================================================================
REM Quick File Check - See what files exist
REM ============================================================================

TITLE File Check

cls
echo ================================================
echo   vFlok Hospital Dashboard - File Check
echo ================================================
echo.
echo Checking required files...
echo.

if exist "database\vflok_hospitals.db" (
    echo [OK] database\vflok_hospitals.db
    for %%A in ("database\vflok_hospitals.db") do echo     Size: %%~zA bytes
) else (
    echo [MISSING] database\vflok_hospitals.db
)

if exist "vflok_hospitals.db" (
    echo [OK] vflok_hospitals.db (in main folder)
    for %%A in ("vflok_hospitals.db") do echo     Size: %%~zA bytes
) else (
    echo [MISSING] vflok_hospitals.db
)

echo.

if exist "renderer\index.html" (
    echo [OK] renderer\index.html
) else (
    echo [MISSING] renderer\index.html
)

if exist "renderer\index_base.html" (
    echo [OK] renderer\index_base.html
    for %%A in ("renderer\index_base.html") do echo     Size: %%~zA bytes
) else (
    echo [MISSING] renderer\index_base.html
)

if exist "renderer\db-adapter.js" (
    echo [OK] renderer\db-adapter.js
) else (
    echo [MISSING] renderer\db-adapter.js
)

echo.

if exist "main.js" (
    echo [OK] main.js
) else (
    echo [MISSING] main.js
)

if exist "preload.js" (
    echo [OK] preload.js
) else (
    echo [MISSING] preload.js
)

if exist "package.json" (
    echo [OK] package.json
) else (
    echo [MISSING] package.json
)

echo.

if exist "node_modules" (
    echo [OK] node_modules folder exists
) else (
    echo [MISSING] node_modules folder
    echo     Run INSTALL.bat to install dependencies
)

echo.
echo ================================================
echo.
echo If any files show [MISSING], that's the problem!
echo.
echo Most common issues:
echo   1. renderer\index_base.html missing = Copy vflok_dashboard.html
echo   2. database\vflok_hospitals.db missing = Run create_database.R
echo   3. node_modules missing = Run INSTALL.bat
echo.
echo ================================================
echo.
pause
