# Add HealthLuminate favicon to all HTML files site-wide
$rootPath = "C:\Projects\HealthLuminateSiteFromLocal"
$faviconPath = "images/HealthLuminate-Bright.png"

# Only include specific directories
$includeDirs = @(
    "$rootPath\*.html",        # Root level HTML files
    "$rootPath\crm",           # CRM directory
    "$rootPath\sandbox",       # Sandbox directory
    "$rootPath\team",          # Team directory
    "$rootPath\admin",         # Admin directory
    "$rootPath\connect",       # Connect directory
    "$rootPath\internal"       # Internal directory
)

Write-Host "Scanning for HTML files in key directories..." -ForegroundColor Cyan

# Get HTML files from specific directories only
$htmlFiles = @()
foreach ($dir in $includeDirs) {
    if ($dir -like "*.html") {
        # Root level files
        $htmlFiles += Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue
    } else {
        # Directory files (recursive)
        $htmlFiles += Get-ChildItem -Path $dir -Filter "*.html" -Recurse -File -ErrorAction SilentlyContinue
    }
}

$totalFiles = $htmlFiles.Count
$updatedCount = 0
$skippedCount = 0
$errorCount = 0
$current = 0

Write-Host "Found $totalFiles HTML files" -ForegroundColor Green
Write-Host "Starting favicon update..." -ForegroundColor Yellow
Write-Host ""

foreach ($file in $htmlFiles) {
    $current++
    
    # Show progress
    if ($current % 50 -eq 0 -or $current -eq $totalFiles) {
        Write-Host "Processing: $current / $totalFiles files (Updated: $updatedCount, Skipped: $skippedCount)" -ForegroundColor Cyan
    }
    
    try {
        # Read file content
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        
        # Skip if already has favicon
        if ($content -match 'favicon' -or $content -match 'rel="icon"') {
            $skippedCount++
            continue
        }
        
        # Skip if no head tag found
        if ($content -notmatch '</head>') {
            $skippedCount++
            continue
        }
        
        # Calculate relative path from file to images directory
        $fileDir = $file.Directory.FullName
        $relativeDepth = ($fileDir.Replace($rootPath, "").Trim('\', '/') -split '[\\/]').Count
        
        if ($fileDir -eq $rootPath) {
            # File is in root
            $relativePath = $faviconPath
        } else {
            # File is in subdirectory - go up the correct number of levels
            $upLevels = "../" * $relativeDepth
            $relativePath = $upLevels + $faviconPath
        }
        
        # Insert favicon link before closing head tag
        $faviconTag = '  <link rel="icon" type="image/png" href="' + $relativePath + '">' + "`n"
        $newContent = $content -replace '</head>', "$faviconTag</head>"
        
        # Write back to file
        Set-Content -Path $file.FullName -Value $newContent -NoNewline -ErrorAction Stop
        $updatedCount++
        
    } catch {
        Write-Host "Error processing $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "Favicon Update Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "Total files scanned: $totalFiles" -ForegroundColor White
Write-Host "Updated: $updatedCount" -ForegroundColor Green
Write-Host "Skipped: $skippedCount" -ForegroundColor Yellow
Write-Host "Errors: $errorCount" -ForegroundColor Red
Write-Host ""
Write-Host "All updated files now have the HealthLuminate logo as favicon!" -ForegroundColor Cyan
