@echo off
REM ============================================================================
REM Rebuild Database with Health Systems Data
REM ============================================================================

TITLE Rebuild Database

color 0E
cls

echo ================================================================
echo   Rebuild Database with Health Systems Data
echo ================================================================
echo.
echo   This will rebuild your database to include both:
echo   - Hospital data (from to.upload2)
echo   - Health system data (from hs_upload)
echo.
echo   Make sure you have both loaded in R!
echo.
echo ================================================================
echo.
echo Instructions:
echo.
echo 1. Open R or RStudio
echo.
echo 2. Load both datasets:
echo    - to.upload2 (hospital data)
echo    - hs_upload (health system data)
echo.
echo 3. Set working directory:
echo    setwd("C:/repos/HealthLuminateSiteFromLocal/public/vflok_app")
echo.
echo 4. Run the script:
echo    source("create_database.R")
echo.
echo 5. Come back here and press any key when done
echo.
echo ================================================================
echo.
pause

echo.
echo Checking if database was created...
echo.

if exist "vflok_hospitals.db" (
    color 0A
    echo [OK] Database file found!
    
    for %%A in ("vflok_hospitals.db") do set SIZE=%%~zA
    echo File size: %SIZE% bytes
    echo.
    
    echo Copying to database folder...
    if not exist "database" mkdir database
    copy /Y "vflok_hospitals.db" "database\vflok_hospitals.db" >nul
    echo [OK] Database copied
    echo.
    
    echo ================================================================
    echo   SUCCESS! Database rebuilt with health systems data
    echo ================================================================
    echo.
    echo   Now test the app: RUN_APP.bat
    echo.
) else (
    color 0C
    echo [ERROR] Database file not found!
    echo.
    echo Did you run create_database.R in R?
    echo.
)

echo ================================================================
echo.
pause
