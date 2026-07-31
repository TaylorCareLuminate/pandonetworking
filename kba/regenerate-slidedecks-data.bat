@echo off
echo.
echo ========================================
echo   Regenerating Slide Decks Data
echo ========================================
echo.

cd /d "%~dp0"

echo Running Node.js script to scan slidedecks folder...
node generate-slidedecks-json.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Success! The slidedecks-data.json file has been updated.
    echo.
    echo You can now refresh the directory page in your browser.
) else (
    echo.
    echo ❌ Error: Failed to generate slidedecks data.
    echo Please check that Node.js is installed and the slidedecks folder exists.
)

echo.
pause 