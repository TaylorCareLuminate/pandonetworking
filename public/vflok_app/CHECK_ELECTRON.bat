@echo off
REM ============================================================================
REM Check Electron Installation
REM ============================================================================

TITLE Check Electron

cls
echo.
echo ================================================================
echo   Checking Electron Installation
echo ================================================================
echo.

echo [1] Checking if electron package exists...
if exist "node_modules\electron" (
    echo     [OK] node_modules\electron folder exists
) else (
    echo     [ERROR] node_modules\electron folder missing!
    goto end
)
echo.

echo [2] Checking for electron executables...
if exist "node_modules\.bin\electron.cmd" (
    echo     [OK] node_modules\.bin\electron.cmd exists
) else (
    echo     [MISSING] node_modules\.bin\electron.cmd
)

if exist "node_modules\electron\dist\electron.exe" (
    echo     [OK] node_modules\electron\dist\electron.exe exists
    for %%A in ("node_modules\electron\dist\electron.exe") do echo     Size: %%~zA bytes
) else (
    echo     [MISSING] node_modules\electron\dist\electron.exe
)
echo.

echo [3] Checking electron version...
if exist "node_modules\electron\package.json" (
    findstr "version" node_modules\electron\package.json | findstr -v "description"
) else (
    echo     [ERROR] package.json not found
)
echo.

echo [4] Testing npx electron...
npx electron --version
if %ERRORLEVEL% EQU 0 (
    echo     [OK] npx electron works!
) else (
    echo     [ERROR] npx electron failed
)
echo.

:end
echo ================================================================
echo   Diagnosis Complete
echo ================================================================
echo.
echo If you see [MISSING] or [ERROR] above, Electron didn't
echo install correctly. Try running CLEAN_REINSTALL.bat again.
echo.
pause
