# Fix H1 Colors Script - PPC Care Directory Only
Write-Host "Starting H1 color fix for ppccare directory..."

$newColor = "#2D6B83"
$htmlFiles = Get-ChildItem -Path "./ppccare" -Filter "*.html" -Recurse
$filesModified = 0

foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $originalContent = $content
    
    # Replace various patterns of h1 with white color
    $content = $content -replace "(\.\w+\s+h1\s*\{[^}]*?)color:\s*white", "`$1color: $newColor"
    $content = $content -replace "(h1\s*\{[^}]*?)color:\s*white", "`$1color: $newColor"
    $content = $content -replace "(\w+\s+h1\s*\{[^}]*?)color:\s*white", "`$1color: $newColor"
    $content = $content -replace "(\w+-\w+\s+h1\s*\{[^}]*?)color:\s*white", "`$1color: $newColor"
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8
        Write-Host "Modified: $($file.Name)"
        $filesModified++
    }
}

Write-Host "Files modified in ppccare: $filesModified"
Write-Host "New h1 color: $newColor" 