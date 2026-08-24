@echo off
echo.
echo ========================================
echo   Regenerating Connect Analysis Data
echo ========================================
echo.

cd /d "%~dp0"

echo Scanning this folder for Connect_Analysis_YYYY-MM-DD.json files...
echo (and *_deidentified.json siblings) and pointing latest*.json at the newest usable run.
echo.
node regenerate_manifest.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Success! manifest.json / latest.json are up to date.
    echo Refresh analysis_results.html or the outcomes calculator in your browser.
) else (
    echo.
    echo Error: Failed to regenerate analysis manifests.
    echo Please check that Node.js is installed and this folder has dated Connect_Analysis_*.json files.
)

echo.
pause
