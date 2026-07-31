# How to Build and Distribute the Electron App

## Prerequisites

1. **Node.js** installed (v18 or later)
2. **Database file** created (`vflok_hospitals.db`)

## Building the App

### Windows Build

```bash
# 1. Navigate to the vflok_app directory
cd vflok_app

# 2. Install dependencies (first time only)
npm install

# 3. Ensure database is in place
copy vflok_hospitals.db database\vflok_hospitals.db

# 4. Build the Windows installer
npm run build:win
```

Output: `dist\vFlok Hospital Dashboard-Setup-1.0.0.exe`

### macOS Build

```bash
# 1. Navigate to the vflok_app directory
cd vflok_app

# 2. Install dependencies (first time only)
npm install

# 3. Ensure database is in place
cp vflok_hospitals.db database/vflok_hospitals.db

# 4. Build the macOS installer
npm run build:mac
```

Output: `dist/vFlok Hospital Dashboard-1.0.0.dmg`

## Distribution

### Method 1: Direct File Sharing

1. Locate the installer in the `dist/` folder
2. Share via:
   - Email (if file size permits)
   - Shared network drive
   - Cloud storage (Dropbox, Google Drive, OneDrive)
   - USB drive

### Method 2: Web Server (with Auto-Updates)

1. **Upload to web server**:
   ```
   https://yourdomain.com/downloads/
   ├── vFlok-Hospital-Dashboard-Setup-1.0.0.exe
   ├── latest.yml
   ├── vFlok-Hospital-Dashboard-1.0.0.dmg
   └── latest-mac.yml
   ```

2. **Update package.json** with your URL:
   ```json
   "publish": {
     "provider": "generic",
     "url": "https://yourdomain.com/downloads/"
   }
   ```

3. **Rebuild** the app

4. **Users will get automatic updates** when you release new versions

## Version Updates

When releasing a new version:

1. **Update version** in `package.json`:
   ```json
   {
     "version": "1.1.0"
   }
   ```

2. **Update database** (if needed):
   ```r
   source("create_database.R")
   copy vflok_hospitals.db database\vflok_hospitals.db
   ```

3. **Rebuild**:
   ```bash
   npm run build:win
   ```

4. **Distribute** the new installer

## File Sizes

Typical installer sizes:
- Windows: ~80-120 MB
- macOS: ~100-150 MB

Includes:
- Electron runtime
- SQLite database
- All dependencies

## Testing Before Distribution

1. **Test the installer**:
   - Install on a clean machine
   - Verify database loads
   - Test filtering and searching

2. **Check for errors**:
   - Open DevTools (Ctrl+Shift+I)
   - Look for console errors

3. **Performance test**:
   - Load all data
   - Try complex filters
   - Export to CSV

## Troubleshooting Build Issues

### Build fails with "Cannot find module"

**Fix**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Database file not found" in built app

**Fix**:
- Verify database exists in `database/` folder before building
- Check `package.json` `extraResources` configuration

### App crashes on startup

**Fix**:
- Check the logs folder:
  - Windows: `%APPDATA%\vflok-hospital-dashboard\logs\`
  - macOS: `~/Library/Logs/vflok-hospital-dashboard/`

## Icon Customization

To change the app icon:

1. **Create icons**:
   - Windows: `build/icon.ico` (256x256px)
   - macOS: `build/icon.icns` (1024x1024px)
   - General: `build/icon.png` (512x512px)

2. **Rebuild** the app

## Code Signing (Optional but Recommended)

For production distribution:

### Windows

```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "password"
}
```

### macOS

```json
"mac": {
  "identity": "Developer ID Application: Your Name"
}
```

## Support

For build issues, contact: support@vflok.com

---

**Happy Building!** 🚀
