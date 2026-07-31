@echo off
echo ================================================================
echo   Testing Dynamic Query Refactoring
================================================================
echo.
echo   This will test the new server-side filtering system.
echo   The app should:
echo   - Load instantly (not 5-10 seconds)
echo   - Show 20 hospitals on first page
echo   - Filter/search without freezing
echo   - Update statistics dynamically
echo.
echo ================================================================
pause

cd /d "%~dp0"
call npm start

pause
