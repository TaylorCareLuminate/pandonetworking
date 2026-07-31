# Deploy Firebase Indexes for phone-calls.html fixes
# This script deploys the required Firestore indexes to fix 400 errors

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firebase Indexes Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will deploy the required Firestore indexes to fix:" -ForegroundColor Yellow
Write-Host "- 4A campaign not loading (400 errors)" -ForegroundColor Yellow
Write-Host "- Achievement pool calculations" -ForegroundColor Yellow
Write-Host "- Recent calls filtering" -ForegroundColor Yellow
Write-Host ""
Write-Host "Prerequisites:" -ForegroundColor White
Write-Host "- Firebase CLI installed (npm install -g firebase-tools)" -ForegroundColor Gray
Write-Host "- Authenticated to Firebase (firebase login)" -ForegroundColor Gray
Write-Host ""

$continue = Read-Host "Press Enter to continue or Ctrl+C to cancel"

Write-Host ""
Write-Host "Checking Firebase CLI..." -ForegroundColor Cyan
try {
    $version = firebase --version 2>&1
    Write-Host "✓ Firebase CLI found: $version" -ForegroundColor Green
} catch {
    Write-Host "✗ ERROR: Firebase CLI not found!" -ForegroundColor Red
    Write-Host "Install it with: npm install -g firebase-tools" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Deploying indexes to project 'clemail'..." -ForegroundColor Cyan
Write-Host ""

try {
    firebase deploy --only firestore:indexes --project clemail
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "SUCCESS! Indexes deployed." -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Index creation started in Firebase." -ForegroundColor White
        Write-Host "This usually takes 1-2 minutes to complete." -ForegroundColor White
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Wait 2 minutes for indexes to build" -ForegroundColor Gray
        Write-Host "2. Verify at: https://console.firebase.google.com/project/clemail/firestore/indexes" -ForegroundColor Gray
        Write-Host "3. Refresh phone-calls.html and test the 4A campaign" -ForegroundColor Gray
        Write-Host ""
        Write-Host "All indexes should show status: 'Enabled' (green)" -ForegroundColor Green
    } else {
        throw "Deployment command failed"
    }
} catch {
    Write-Host ""
    Write-Host "✗ ERROR: Deployment failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "1. Not authenticated - Run: firebase login" -ForegroundColor Gray
    Write-Host "2. Wrong project - Check firebase.json project setting" -ForegroundColor Gray
    Write-Host "3. No permissions - Verify you have Editor/Owner role" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Alternative: Use the one-click links in FIREBASE_INDEXES_DEPLOYMENT.md" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Read-Host "Press Enter to exit"







