# HealthLuminate Logo Setup Guide

## ✅ What's Been Done

Your **sandbox CRM pages** now use the HealthLuminate logo as the favicon:
- `sandbox/crm-sandbox.html` ✅
- `sandbox/account-detail.html` ✅

## 📁 Your Logo Files

Located in `/images/`:
- **`HealthLuminate-Bright.png`** - Recommended for favicon (currently using this)
- **`HealthLuminate Logo.jpg`** - Full logo with text
- **`Logo.png`** - Alternative logo file

## 🌐 Apply Logo Site-Wide

### Option 1: Quick Fix - Add to Individual Pages

Add this line in the `<head>` section of any HTML file:

```html
<link rel="icon" type="image/png" href="/images/HealthLuminate-Bright.png">
```

Or for pages in subdirectories like `crm/`:
```html
<link rel="icon" type="image/png" href="../images/HealthLuminate-Bright.png">
```

### Option 2: Bulk Update with PowerShell Script

Run this PowerShell script to add the favicon to all HTML files:

```powershell
# Add favicon to all HTML files in a directory
$directory = "C:\Projects\HealthLuminateSiteFromLocal"
$htmlFiles = Get-ChildItem -Path $directory -Filter "*.html" -Recurse

foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw
    
    # Check if favicon already exists
    if ($content -notmatch '<link\s+rel="icon"') {
        # Find </head> tag and insert before it
        $content = $content -replace '</head>', '  <link rel="icon" type="image/png" href="/images/HealthLuminate-Bright.png">`n</head>'
        
        # Write back to file
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "✅ Added favicon to: $($file.Name)"
    } else {
        Write-Host "⏭️  Skipped (already has favicon): $($file.Name)"
    }
}

Write-Host "`n✅ Favicon update complete!"
```

### Option 3: Create a Shared Header Component

Create `Partials/header.html`:

```html
<!-- HealthLuminate Standard Header -->
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="icon" type="image/png" href="/images/HealthLuminate-Bright.png">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <!-- Page-specific title and additional links go here -->
</head>
```

Then include it in your pages using JavaScript or a build tool.

## 🎨 Using Logo in Page Headers

### For Navigation Headers

```html
<header>
  <div class="header-container">
    <div class="logo-section">
      <img src="/images/HealthLuminate-Bright.png" alt="HealthLuminate" style="height: 40px;">
      <h1>HealthLuminate CRM</h1>
    </div>
    <!-- Rest of header -->
  </div>
</header>
```

### Current Icon-Based Header (Your Sandbox)

```html
<div class="logo-section">
  <h1><i class="fas fa-heartbeat"></i> HealthLuminate CRM</h1>
</div>
```

### Updated to Use Logo Image

```html
<div class="logo-section">
  <img src="/images/HealthLuminate-Bright.png" alt="HealthLuminate Logo" style="height: 30px; margin-right: 10px;">
  <h1>HealthLuminate CRM</h1>
</div>
```

## 📋 Pages That Need Favicon

Run this to see which pages are missing the favicon:

```powershell
Get-ChildItem -Path "C:\Projects\HealthLuminateSiteFromLocal" -Filter "*.html" -Recurse | 
  Where-Object { (Get-Content $_.FullName -Raw) -notmatch '<link\s+rel="icon"' } |
  Select-Object FullName
```

## 🚀 Recommended Approach

1. **Immediate**: Your sandbox pages are done ✅
2. **For CRM pages**: Add favicon line to `crm/header.html` if you have a shared header
3. **For main site**: Add to `index.html`, `about.html`, `contact.html`, etc.
4. **Long-term**: Use a build tool or template system to include the header site-wide

## 🔍 Verify It Works

1. Refresh your browser (Ctrl + Shift + R for hard refresh)
2. Look at the browser tab - you should see the HealthLuminate logo instead of a generic icon
3. Check browser console - should see no more 404 errors for favicon.ico

## 📝 Notes

- The favicon may take a moment to update due to browser caching
- For best results, provide multiple sizes:
  ```html
  <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png">
  ```

## 🎯 Quick Test

Open these pages in your browser and check the tab icon:
- ✅ `sandbox/crm-sandbox.html` - Should show logo
- ✅ `sandbox/account-detail.html` - Should show logo
- ❌ `index.html` - Needs favicon added
- ❌ `crm/mainpage.html` - Needs favicon added

---

**Need help implementing?** Let me know which approach you'd like to use!

