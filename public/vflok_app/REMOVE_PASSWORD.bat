@echo off
REM ============================================================================
REM Remove Password and Auto-Load All Data
REM ============================================================================

TITLE Removing Password and Auto-Loading Data

color 0E
cls

echo ================================================================
echo   Making Dashboard Changes
echo ================================================================
echo.
echo   This will:
echo   1. Remove password protection
echo   2. Load all data automatically on startup
echo.
echo   Your dashboard will be easier for clients to use!
echo.
echo ================================================================
echo.
pause

echo.
echo [1/3] Backing up current dashboard...
if not exist "renderer\index_base.html.backup" (
    copy "renderer\index_base.html" "renderer\index_base.html.backup" >nul
    echo [OK] Backed up index_base.html
)
echo.

echo [2/3] Applying changes with PowerShell...
echo.

powershell -ExecutionPolicy Bypass -Command "$content = Get-Content 'renderer\index_base.html' -Raw; $content = $content -replace '<!-- Password Modal -->.*?</div>\s*</div>\s*<!-- Disclaimer Modal -->', '<!-- Password Modal Removed -->$([Environment]::NewLine)$([Environment]::NewLine)  <!-- Disclaimer Modal -->'; $content = $content -replace 'window\.checkPassword\s*=\s*function\(\)\s*{[^}]*if\s*\(password\s*===\s*PAGE_PASSWORD\)[^}]*}[^}]*};', '// Password check removed'; $content = $content -replace 'function checkAuth\(\)\s*{[^}]*}', 'function checkAuth() { /* Authentication disabled */ }'; $content = $content -replace 'allDataLoaded\s*=\s*false', 'allDataLoaded = true'; $content = $content -replace '(<!-- Data Loading Mode Indicator -->.*?)(</div>)', '$1 style=\"display: none;\">$2'; $content = $content -replace '(<!-- All Data Loaded Indicator.*?display:\s*)none', '$1flex'; Set-Content 'renderer\index_base.html' $content"

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] PowerShell command failed
    echo.
    echo Trying manual approach...
    echo.
    pause
    exit /b 1
)

echo [OK] Changes applied
echo.

echo [3/3] Updating main.js to match...
copy /Y "main_sqljs.js" "main.js" >nul
echo [OK] Updated
echo.

color 0A
cls
echo ================================================================
echo   SUCCESS! Changes Applied
echo ================================================================
echo.
echo   Your dashboard now:
echo   - NO password required
echo   - Loads ALL data automatically on startup
echo   - Clients can use it immediately!
echo.
echo   Next step: Test with RUN_APP.bat
echo.
echo ================================================================
echo.
pause
