# Adding GPO Column - Quick Guide

## Step 1: Update Your R Data

In R, make sure your `to.upload2` data frame has the `gpo` column:

```r
# Check if gpo column exists
"gpo" %in% names(to.upload2)

# If not, add it (example):
# to.upload2$gpo <- your_gpo_data

# Verify the data
head(to.upload2$gpo)
table(to.upload2$gpo)
```

## Step 2: Regenerate Database

```r
# Run the database creation script
source("create_database.R")
```

This will:
- ✅ Create new database with `gpo` column
- ✅ Add index on `gpo` for fast filtering
- ✅ Place database in: `C:\repos\HealthLuminateSiteFromLocal\public\vflok_app\database\vflok_hospitals.db`

## Step 3: Copy Database to App

The database should automatically be in the right location. If not:

```batch
copy vflok_hospitals.db database\vflok_hospitals.db
```

## Step 4: Test the App

```batch
TEST_FIXED_APP.bat
```

You should now see:
- ✅ GPO filter dropdown in the Basic Filters section
- ✅ GPO values: Vizient, Premier, HealthTrust, etc.
- ✅ Filter by GPO works
- ✅ GPO included in exports

## GPO Values in Your Data:

Based on your data, the most common GPOs are:
- **Vizient, Inc.** (1115 hospitals)
- **Premier, Inc.** (697 hospitals)
- **HealthTrust** (526 hospitals)
- **The Resource Group, LLC** (86 hospitals)
- **Health Enterprises Cooperative** (24 hospitals)
- **Partners Cooperative, Inc.** (21 hospitals)
- And many more...

## Notes:

- The UI already has the GPO filter dropdown added
- The backend query builder will automatically support it
- The clear filters button will reset GPO
- The dynamic query listeners will trigger on GPO changes
- Export will include GPO column

**Everything is ready - just regenerate the database with the GPO column!**
