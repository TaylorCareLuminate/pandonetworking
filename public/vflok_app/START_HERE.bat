@echo off
TITLE vFlok Dashboard - Client Distribution Guide

color 0B
cls

echo.
echo ================================================================
echo   vFlok Hospital Dashboard - CLIENT DISTRIBUTION GUIDE
echo ================================================================
echo.
echo   Follow these steps to create the installer for your clients:
echo.
echo ================================================================
echo   STEP 1: Rebuild Database (in R)
echo ================================================================
echo.
echo   Open R or RStudio and run:
echo.
echo   head(to.upload2)  # Verify hospital data is loaded
echo   head(hs_upload)   # Verify health system data is loaded
echo.  
echo   setwd("C:/repos/HealthLuminateSiteFromLocal/public/vflok_app")
echo   source("create_database.R")
echo.
echo   Press any key AFTER running the R script...
pause > nul

echo.
echo ================================================================
echo   STEP 2: Update the App
echo ================================================================
echo.
echo   Now run: COMPLETE_UPDATE.bat
echo.
echo   This will:
echo   - Copy the new database with health systems
echo   - Update the app code
echo   - Verify everything is ready
echo.
echo   Press any key to continue...
pause > nul

echo.
echo ================================================================
echo   STEP 3: Test the App
echo ================================================================
echo.
echo   Run: RUN_APP.bat
echo.
echo   Make sure:
echo   - App opens quickly
echo   - Hospital data shows
echo   - Health system data shows  
echo   - Filtering works
echo   - No errors
echo.
echo   Press any key after testing...
pause > nul

echo.
echo ================================================================
echo   STEP 4: Build the Installer
echo ================================================================
echo.
echo   Run: BUILD_INSTALLER.bat
echo.
echo   This creates the distributable .exe file
echo   Location: dist\vFlok Hospital Dashboard-Setup-1.0.0.exe
echo   Size: ~100 MB
echo.
echo   Press any key to continue...
pause > nul

echo.
echo ================================================================
echo   STEP 5: Distribute to Clients
echo ================================================================
echo.
echo   Send clients the file:
echo   vFlok Hospital Dashboard-Setup-1.0.0.exe
echo.
echo   They:
echo   1. Double-click the .exe
echo   2. Install (click Next a few times)
echo   3. Run the app from desktop
echo   4. Done!
echo.
echo   NO PowerShell, NO build tools, NO technical setup needed!
echo.
echo ================================================================
echo   DONE!
echo ================================================================
echo.
echo   See FINAL_STEPS.md for complete details.
echo.
pause
