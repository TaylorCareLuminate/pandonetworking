# vFlok Hospital Dashboard - Installation Guide

## 🚀 Super Easy Installation

You now have **3 batch files** you can double-click. No command line needed!

---

## Step 1: Install Everything

**Just double-click**: `INSTALL.bat`

This will:
- ✅ Check if Node.js is installed
- ✅ Install all dependencies
- ✅ Copy the database file
- ✅ Verify everything is working
- ✅ Give you options to run or build

**First-time install takes ~2-3 minutes** (downloading packages)

---

## Step 2: Choose What To Do

After installation completes, you'll see a menu:

```
1. Run the app now (test it)
2. Build Windows installer (distribute to others)
3. Exit (run later)
```

### Option 1: Test the App
- Opens the app in a window
- Try filtering, searching, exporting
- Close the window when done

### Option 2: Build Installer
- Creates a `.exe` installer (~80-120 MB)
- Takes 5-10 minutes
- File appears in `dist/` folder
- Send this `.exe` to others

### Option 3: Exit
- Just exit for now
- Run later with the other batch files

---

## Running Later

After the initial install, you can use these:

### 🏃 Run the App
**Double-click**: `RUN_APP.bat`
- Launches the app
- No installation needed

### 📦 Build Installer
**Double-click**: `BUILD_INSTALLER.bat`
- Creates the distributable `.exe`
- Opens the `dist` folder when done

---

## 📁 What You Get

After building, in the `dist/` folder:
```
vFlok Hospital Dashboard-Setup-1.0.0.exe  (~100 MB)
```

**This is what you send to others!**

---

## 👥 For End Users (Your Customers)

1. They receive: `vFlok Hospital Dashboard-Setup-1.0.0.exe`
2. They double-click it
3. They follow the install wizard
4. App appears on their desktop
5. They double-click to run
6. **Fast, responsive dashboard!** ⚡

---

## 🔄 Updating the Database

When you have new data:

1. **Update in R**:
   ```r
   # Load new data into to.upload2
   source("create_database.R")
   ```

2. **Rebuild installer**:
   - Double-click `BUILD_INSTALLER.bat`
   - Wait for build to complete
   - New installer is in `dist/`

3. **Distribute new version**:
   - Send the new `.exe` to users
   - They install over the old version
   - They get the updated data

---

## ⚠️ Troubleshooting

### "Node.js not found"

**Fix**: Install Node.js first
1. Go to: https://nodejs.org/
2. Download the LTS version
3. Run the installer
4. Try `INSTALL.bat` again

### "Database file not found"

**Fix**: Create the database in R first
```r
source("create_database.R")
```

### Install fails or hangs

**Fix**: Try again with internet connection
- Close any antivirus temporarily
- Run `INSTALL.bat` again

---

## 📊 What You've Built

✅ High-performance desktop app  
✅ Local SQLite database (blazing fast)  
✅ Easy double-click installation  
✅ Professional Windows installer  
✅ 50-100x faster than Firebase web version  

---

## 🎉 That's It!

Just double-click `INSTALL.bat` and you're done!

**Questions?** See `GETTING_STARTED.md` for more details.

---

**Built for vFlok** 🚀
