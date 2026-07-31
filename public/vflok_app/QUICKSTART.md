# Quick Start Guide - vFlok Hospital Dashboard

## 🚀 Getting Started in 5 Minutes

### Step 1: Create the Database

1. Open **R** or **RStudio**
2. Load your hospital data:
   ```r
   # Your data should be in the object: to.upload2
   # Verify it exists:
   head(to.upload2)
   nrow(to.upload2)  # Should show number of hospitals
   ```

3. Run the database creation script:
   ```r
   setwd("path/to/vflok_app")  # Navigate to vflok_app folder
   source("create_database.R")
   ```

4. Wait for completion (usually 10-30 seconds)
   - You should see: `✓ SUCCESS! Database created successfully!`
   - File created: `vflok_hospitals.db`

### Step 2: Install Dependencies

Open **PowerShell** or **Command Prompt** in the `vflok_app` folder:

```bash
npm install
```

This will download all required packages (~2-3 minutes).

### Step 3: Run the App

```bash
npm start
```

The app will open in a new window. You should see:
- Loading screen
- Dashboard with your hospital data
- Fast filtering and searching

### Step 4: Build the Installer (Optional)

To create a distributable installer:

```bash
# For Windows:
npm run build:win

# For Mac:
npm run build:mac
```

The installer will be in the `dist/` folder.

## 📤 Distributing to Others

1. **Find the installer** in `dist/`:
   - Windows: `vFlok Hospital Dashboard-Setup-1.0.0.exe`
   - Mac: `vFlok Hospital Dashboard-1.0.0.dmg`

2. **Send to users** via:
   - Email
   - Shared drive
   - Cloud storage (Dropbox, OneDrive, etc.)

3. **Users install** by:
   - Double-clicking the installer
   - Following the prompts
   - Launching from desktop/Start menu

## 🔄 Updating Data

When you have new data:

1. Load new data in R: `to.upload2`
2. Re-run: `source("create_database.R")`
3. Rebuild the app: `npm run build:win`
4. Distribute the new installer

## ❓ Common Issues

### "npm: command not found"

**Fix**: Install Node.js from https://nodejs.org/

### "cannot open file 'create_database.R'"

**Fix**: Make sure you're in the correct directory:
```r
getwd()  # Should end in "vflok_app"
setwd("C:/repos/HealthLuminateSiteFromLocal/public/vflok_app")
```

### Database creation fails

**Fix**: Check that `to.upload2` exists and has data:
```r
class(to.upload2)  # Should be "data.frame"
colnames(to.upload2)  # Should show column names
```

### App shows "Database file not found"

**Fix**: Copy database to the correct location:
```bash
copy vflok_hospitals.db database\vflok_hospitals.db
```

## 📞 Need Help?

Contact: support@vflok.com

---

**Enjoy your blazing-fast desktop dashboard!** 🚀
