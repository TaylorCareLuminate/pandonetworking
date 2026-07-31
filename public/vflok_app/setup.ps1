# ============================================================================
# vFlok Hospital Dashboard - Installation Script
# ============================================================================
# Run this script after setting up the database
# ============================================================================

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  vFlok Hospital Dashboard - Setup Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check for database file
Write-Host ""
Write-Host "[2/5] Checking database file..." -ForegroundColor Yellow
if (Test-Path "vflok_hospitals.db") {
    $dbSize = (Get-Item "vflok_hospitals.db").Length / 1MB
    Write-Host "  ✓ Database found: $([math]::Round($dbSize, 2)) MB" -ForegroundColor Green
    
    # Copy to database folder
    if (!(Test-Path "database")) {
        New-Item -ItemType Directory -Path "database" | Out-Null
    }
    Copy-Item "vflok_hospitals.db" "database\vflok_hospitals.db" -Force
    Write-Host "  ✓ Database copied to database folder" -ForegroundColor Green
} else {
    Write-Host "  ✗ Database file not found!" -ForegroundColor Red
    Write-Host "  Please create the database using create_database.R first" -ForegroundColor Yellow
    Write-Host "  See QUICKSTART.md for instructions" -ForegroundColor Yellow
    exit 1
}

# Install npm dependencies
Write-Host ""
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
Write-Host "  This may take 2-3 minutes..." -ForegroundColor Gray

$installProcess = Start-Process -FilePath "npm" -ArgumentList "install" -NoNewWindow -Wait -PassThru

if ($installProcess.ExitCode -eq 0) {
    Write-Host "  ✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Verify required files
Write-Host ""
Write-Host "[4/5] Verifying installation..." -ForegroundColor Yellow

$requiredFiles = @(
    "main.js",
    "preload.js",
    "package.json",
    "renderer\index.html",
    "renderer\index_base.html",
    "renderer\db-adapter.js",
    "database\vflok_hospitals.db"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (missing)" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "  Some required files are missing!" -ForegroundColor Red
    exit 1
}

# Success!
Write-Host ""
Write-Host "[5/5] Setup complete!" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  ✓ Installation Successful!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To run the app in development mode:" -ForegroundColor White
Write-Host "    npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "  To build the Windows installer:" -ForegroundColor White
Write-Host "    npm run build:win" -ForegroundColor Yellow
Write-Host ""
Write-Host "  The installer will be in the 'dist' folder" -ForegroundColor Gray
Write-Host ""
Write-Host "For more information, see:" -ForegroundColor White
Write-Host "  - QUICKSTART.md (Quick start guide)" -ForegroundColor Gray
Write-Host "  - README.md (Full documentation)" -ForegroundColor Gray
Write-Host "  - BUILD_GUIDE.md (Distribution guide)" -ForegroundColor Gray
Write-Host ""
