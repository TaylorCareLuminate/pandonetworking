@echo off
REM Deploy Firebase Indexes for phone-calls.html fixes
REM This script deploys the required Firestore indexes to fix 400 errors

echo ========================================
echo Firebase Indexes Deployment
echo ========================================
echo.
echo This will deploy the required Firestore indexes to fix:
echo - 4A campaign not loading (400 errors)
echo - Achievement pool calculations
echo - Recent calls filtering
echo.
echo Prerequisites:
echo - Firebase CLI installed (npm install -g firebase-tools)
echo - Authenticated to Firebase (firebase login)
echo.

pause

echo.
echo Checking Firebase CLI...
firebase --version
if errorlevel 1 (
    echo.
    echo ERROR: Firebase CLI not found!
    echo Install it with: npm install -g firebase-tools
    echo.
    pause
    exit /b 1
)

echo.
echo Deploying indexes...
firebase deploy --only firestore:indexes --project clemail

if errorlevel 1 (
    echo.
    echo ERROR: Deployment failed!
    echo.
    echo Possible issues:
    echo 1. Not authenticated - Run: firebase login
    echo 2. Wrong project - Check firebase.json project setting
    echo 3. No permissions - Verify you have Editor/Owner role
    echo.
    echo Alternative: Use the one-click links in FIREBASE_INDEXES_DEPLOYMENT.md
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Indexes deployed.
echo ========================================
echo.
echo Index creation started in Firebase.
echo This usually takes 1-2 minutes to complete.
echo.
echo Next steps:
echo 1. Wait 2 minutes for indexes to build
echo 2. Verify at: https://console.firebase.google.com/project/clemail/firestore/indexes
echo 3. Refresh phone-calls.html and test the 4A campaign
echo.
echo All indexes should show status: "Enabled" (green)
echo.
pause







