# American Funds Import - Quick Start Guide

## ⚡ Quick Start (3 Steps)

### 1. Open the Import Page
Navigate to: `/execretirement/direct-record-keeper-import.html`

### 2. Select American Funds
Click the **American Funds** card in the record keeper selection area.

### 3. Upload Your File
Drag and drop (or click to browse) your `American Funds – Premier Product.xlsx` file.

---

## 📂 What File Do I Need?

**File name:** `American Funds – Premier Product.xlsx`  
**Sheet required:** `Plans`  
**File format:** Excel (.xlsx)

### Required columns in the file:
- Plan Number
- Plan Name  
- Monthly as of date (in column I/8 header row)
- Total assets

### Optional columns (recommended):
- Daily as of date (in column B/1 header row)
- PPT count (participant count)
- Part. rate (participation rate)
- Cont. rate (contribution rate)
- Cash flow
- Type (plan type)
- Client Service Manager Name/Email/Phone
- Client Relationship Manager Name/Email/Phone
- Partner Advocate Name/Email/Phone

---

## 🎯 What Happens After Upload?

### Step 1: File Preview
You'll see a preview table showing:
- Plan_ID
- Plan_Name
- Period_End_Date
- Asset_Value
- Participant_Count
- Participation_Rate
- Contribution_Rate
- Plan_Type
- Net_Cash_Flow_Period
- Status

### Step 2: Validation
Click **"Validate Data"** to check:
- ✅ All plans have a Period_End_Date
- ✅ All plans have a Plan_ID or Plan_Name
- ✅ Dates are in correct format (YYYY-MM-DD)
- ✅ Numbers are valid
- ✅ Rates are between 0% and 100%

If there are warnings, they'll be displayed but won't stop the import (unless you chose "Strict" validation).

### Step 3: Import
Click **"Import to Database"** to save to Firebase.

Your data will be saved at: `ers/plan_periods/`

Each plan gets a unique ID like: `americanfunds_136108301_20250831`

---

## 🔍 What Gets Imported?

### Financial Data
- Total assets for each plan
- Cash flow (positive or negative)
- Average assets per participant

### Participant Information
- Number of participants
- Participation rate (% of eligible employees participating)
- Average contribution rate

### Contact Information
- Client Service Manager (name, email, phone)
- Client Relationship Manager (name, email, phone)  
- Partner Advocate (name, email, phone)

### Metadata
- Source file name
- Import timestamp
- Daily and monthly "as of" dates
- Any parsing warnings

---

## ⚠️ Common Issues & Solutions

### Issue: "Could not find 'Plans' sheet"
**Solution:** Make sure your Excel file has a sheet named exactly `Plans` (case-sensitive).

### Issue: "Missing Period_End_Date"
**Solution:** The file must have a date in column I (index 8) of the first row. This is the "Monthly as of" date.

### Issue: "Participation rate outside 0-1 range"
**Cause:** The file has a rate like 125% or -5%  
**Impact:** This is logged as a warning but won't stop import  
**Action:** Review these plans manually after import

### Issue: "File size exceeds 10MB"
**Solution:** Split your file into smaller chunks (e.g., by plan type or date range)

---

## 📊 Example Data Flow

### Your Excel File (American Funds):
```
Row 0:  | Daily as of | 24/09/2025 | ... | Monthly as of | 31/08/2025 | ...
Row 1:  | Plan Number | Plan Name  | ... | PPT count     | Total assets | ...
Row 2:  | 1361083-01  | Sun Sage LLC 401(k) | ... | 73    | 605956.21 | ...
```

### After Import (Firebase):
```json
{
  "ers/plan_periods/americanfunds_136108301_20250831": {
    "Plan_ID": "1361083-01",
    "Plan_Name": "Sun Sage LLC 401(k) Plan",
    "Record_Keeper": "American Funds",
    "Period_End_Date": "2025-08-31",
    "Asset_Value": 605956.21,
    "Participant_Count": 73,
    "Status": "Active",
    "Provenance": {
      "Source_File_Name": "American Funds – Premier Product.xlsx",
      "AsOf_Daily_Date": "2025-09-24",
      "Ingested_At": "2025-10-09T14:30:00.000Z"
    }
  }
}
```

---

## 🎨 UI Walk-through

### 1. Record Keeper Selection
```
┌────────────────────────────────────────────────┐
│ Select Record Keeper Source                   │
├────────────────────────────────────────────────┤
│  [Transamerica]  [John Hancock]  [T. Rowe]   │
│  [American Funds]✓  [Voya]  [Principal]       │
│  [Empower]  [Other]                            │
└────────────────────────────────────────────────┘
```

### 2. Upload Area (appears after selection)
```
┌────────────────────────────────────────────────┐
│            📤                                   │
│  Click to upload or drag and drop your file   │
│  (CSV, XLS, or XLSX)                          │
└────────────────────────────────────────────────┘
```

### 3. File Info (appears after upload)
```
┌────────────────────────────────────────────────┐
│ 📄 American Funds – Premier Product.xlsx      │
│    2.3 MB                                      │
│    Record Keeper: American Funds               │
└────────────────────────────────────────────────┘
```

### 4. Preview Table
```
┌──────────────┬────────────────┬────────────┬────────────┐
│ Plan_ID      │ Plan_Name      │ Period_End │ Assets     │
├──────────────┼────────────────┼────────────┼────────────┤
│ 1361083-01   │ Sun Sage LLC   │ 2025-08-31 │ $605,956   │
│ 1234567-02   │ Acme Corp      │ 2025-08-31 │ $1,250,000 │
│ ...          │ ...            │ ...        │ ...        │
└──────────────┴────────────────┴────────────┴────────────┘
                    (50 plans)
```

### 5. Action Buttons
```
[🗑️ Clear]  [✅ Validate Data]  [💾 Import to Database]  [📊 View Data]
```

---

## 📈 Tips for Best Results

### Before Import:
1. ✅ Check that file is the latest version
2. ✅ Verify "Monthly as of" date is correct (column I/8)
3. ✅ Ensure no test/dummy data in file
4. ✅ Back up existing data if re-importing

### During Import:
1. ✅ Select correct record keeper (American Funds)
2. ✅ Review preview table for obvious errors
3. ✅ Choose validation level:
   - **Strict:** Reject any rows with errors
   - **Moderate:** Import with warnings (recommended)
   - **Lenient:** Import everything
4. ✅ Choose duplicate handling:
   - **Skip:** Don't import if plan+period exists
   - **Update:** Replace existing data (idempotent)
   - **Create New:** Import as separate record

### After Import:
1. ✅ Check success message for counts
2. ✅ Review any warnings
3. ✅ Click "View Imported Data" to verify
4. ✅ Spot-check a few plans manually

---

## 🔐 Security & Permissions

**Who can import?**
- Must be logged in
- Must have verified account
- Must have access to `/execretirement/` folder

**Data visibility:**
- Imported data saved to Firebase RTDB
- Access controlled by Firebase security rules
- Only authorized users can view/edit

---

## 🆘 Need Help?

### Check Console Logs
Open browser DevTools (F12) → Console tab

Look for:
- `💰 Parsing American Funds Premier Product file...`
- `✅ Parsed X records from American Funds`
- Any warning messages

### Common Warning Messages:

**"ParseWarning:Participation_Rate: rate outside 0-1 range"**
→ Participation rate is >100% or negative. Data is still imported.

**"RowDrop:MissingKey: Plan_ID and Plan_Name both empty"**
→ This row has no identifier and was skipped.

**"RowDrop:MissingPeriodEnd: Period_End_Date is required"**
→ Could not parse the "Monthly as of" date. Check column I/8 in row 0.

---

## 📞 Support

For technical issues:
1. Check implementation docs: `AMERICAN_FUNDS_PARSER_IMPLEMENTATION.md`
2. Check detailed specs: `DIRECT_RECORD_KEEPER_IMPORT_README.md`
3. Contact: [Your Support Contact]

---

**Last Updated:** October 9, 2025  
**Version:** 2.0  
**Status:** Production Ready ✅

