@echo off
echo ================================================================
echo   Testing Fixed App (No Firebase Hang)
================================================================
echo.
echo   This will test the app with the Firebase bypass fixes.
echo   Keep this window OPEN to see any errors!
echo.
echo ================================================================
pause

echo.
echo Starting app...
echo.

cd /d "%~dp0"
call npm start

echo.
echo ================================================================
echo   App closed.
echo   Check above for any errors.
echo ================================================================
echo.
pause
