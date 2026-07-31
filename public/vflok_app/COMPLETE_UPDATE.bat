@echo off
REM ============================================================================
REM Complete Update - Rebuild Everything
REM ============================================================================

TITLE Complete Update

color 0E
cls

echo ================================================================
echo   Complete Update - Add Health Systems Data
echo ================================================================
echo.
echo   This will:
echo   1. Guide you to rebuild database in R (with health systems)
echo   2. Copy new database to app
echo   3. Update main.js with health system support
echo   4. Test the updated app
echo.
echo ================================================================
echo.
pause

echo.
echo STEP 1: Rebuild Database in R
echo ================================================================
echo.
echo Open R or RStudio and run these commands:
echo.
echo   # Make sure both datasets are loaded:
echo   head(to.upload2)  # Hospital data
echo   head(hs_upload)   # Health system data
echo.
echo   # Set working directory:
echo   setwd("C:/repos/HealthLuminateSiteFromLocal/public/vflok_app")
echo.
echo   # Run the database script:
echo   source("create_database.R")
echo.
echo   # You should see messages about both tables being created
echo.
echo ================================================================
echo.
echo Press any key AFTER you've run the R script...
pause > nul

echo.
echo STEP 2: Checking if database was created...
echo.

if not exist "vflok_hospitals.db" (
    color 0C
    echo [ERROR] Database not found!
    echo.
    echo Please make sure the R script completed successfully.
    echo.
    pause
    exit /b 1
)

echo [OK] Database found!
for %%A in ("vflok_hospitals.db") do set SIZE=%%~zA
echo File size: %SIZE% bytes
echo.

echo STEP 3: Copying database to app...
if not exist "database" mkdir database
copy /Y "vflok_hospitals.db" "database\vflok_hospitals.db" >nul
echo [OK] Database copied
echo.

echo STEP 4: Updating main.js with health system support...
copy /Y "main_sqljs.js" "main.js" >nul
echo [OK] main.js updated
echo.

color 0A
cls
echo ================================================================
echo   SUCCESS! Everything Updated!
echo ================================================================
echo.
echo   Your database now includes:
echo   - Hospital data
echo   - Health system data
echo.
echo   The app has been updated to support both!
echo.
echo   Next step: Run RUN_APP.bat to test
echo.
echo ================================================================
echo.
pause
