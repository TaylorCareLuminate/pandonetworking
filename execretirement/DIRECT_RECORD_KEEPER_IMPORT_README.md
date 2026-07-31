# Direct Record Keeper Import System

## Overview

This system ingests plan/period data from multiple record keeper sources (CSV, XLS, XLSX) and normalizes them into a unified `PlanPeriod` schema for storage in Firebase RTDB.

**Key Principles:**
- **Idempotent imports**: `Record_Keeper + Plan_ID + Period_End_Date` uniquely identifies a record
- **Flexible parsing**: Handle missing fields gracefully with `null` values
- **Format normalization**: Dates as `YYYY-MM-DD`, rates as decimals (0–1), currencies as floats
- **Provenance tracking**: Every record tracks its source file, sheet, and ingestion time
- **Warning collection**: Non-fatal parsing issues are logged but don't block import

---

## Standardized Output Schema

Every import **must** emit this structure:

```json
{
  "PlanPeriod": {
    "Plan_ID": "string",
    "Plan_Name": "string",
    "Record_Keeper": "string",
    "Period_End_Date": "YYYY-MM-DD",

    "Contract_Date": "YYYY-MM-DD|null",
    "YE_Date": "YYYY-MM-DD|null",

    "Asset_Value": 0.0,
    "Recurring_Assets": 0.0|null,
    "Transfer_Assets": 0.0|null,

    "Earned_to_Date": 0.0|null,
    "Paid_to_Date": 0.0|null,
    "Owe_This_Period": 0.0|null,
    "Waived_to_Date": 0.0|null,

    "Compensation_Type": "string|null",
    "Status": "Active|Discontinued|Transferred|Unknown",

    "Plan_Type": "string|null",
    "Owning_Group": 0|null,
    "Participant_Count": 0|null,
    "Average_Assets_Per_Participant": 0.0|null,
    "Net_Cash_Flow_Period": 0.0|null,

    "Participation_Rate": 0.0|null,
    "Contribution_Rate": 0.0|null,

    "Contacts": {
      "Client_Service_Manager": {
        "Name": "string|null",
        "Email": "string|null",
        "Phone": "string|null"
      },
      "Client_Relationship_Manager": {
        "Name": "string|null",
        "Email": "string|null",
        "Phone": "string|null"
      },
      "Partner_Advocate": {
        "Name": "string|null",
        "Email": "string|null",
        "Phone": "string|null"
      }
    },

    "CompensationDetail": [
      {
        "Type": "string",
        "SubType": "string|null",
        "Earned": 0.0|null,
        "Paid": 0.0|null,
        "Owe": 0.0|null,
        "Waived": 0.0|null,
        "Notes": "string|null"
      }
    ],

    "Provenance": {
      "Source_File_Name": "string",
      "Source_Sheet_Name": "string|null",
      "AsOf_Daily_Date": "YYYY-MM-DD|null",
      "Ingested_At": "ISO-8601 timestamp"
    },

    "Parsing": {
      "Warnings": ["string"],
      "Raw_Field_Map": { "source_column": "target_field" }
    }
  }
}
```

---

## Universal Parsing Rules

### 🗓️ Date Normalization

**Target format:** `YYYY-MM-DD`

**Parsing logic:**
1. Try `DD/MM/YYYY` (e.g., `31/12/2024`)
2. Try `MM/DD/YYYY` (e.g., `12/31/2024`)
3. Try `YYYY-MM-DD` (already formatted)
4. Try Excel serial dates (e.g., `45321`)
5. If all fail → set `null` and add warning: `"ParseWarning:Date: could not parse '{value}'"`

**Critical dates:**
- `Period_End_Date`: **REQUIRED**. Missing → drop entire row + log error
- `Contract_Date`, `YE_Date`: Optional → `null` if missing

### 📊 Percentage → Decimal Conversion

Fields: `Participation_Rate`, `Contribution_Rate`

**Logic:**
```javascript
function normalizeRate(value) {
  const num = parseFloat(value.replace('%', '').trim());
  if (isNaN(num)) return null;
  
  // If already a decimal (0–1), keep as-is
  if (num <= 1) return num;
  
  // If percentage format (>1), divide by 100
  return num / 100;
}
```

**Examples:**
- `77.1` → `0.771`
- `11.11%` → `0.1111`
- `0.85` → `0.85`

### 💰 Currency Normalization

Fields: All `_Value`, `_Assets`, `_to_Date`, `_This_Period` fields

**Logic:**
```javascript
function normalizeCurrency(value) {
  if (typeof value === 'number') return value;
  const cleaned = value.replace(/[$,\s]/g, '');
  return parseFloat(cleaned) || 0;
}
```

**Examples:**
- `$1,234,567.89` → `1234567.89`
- `(500.00)` → `-500.00` (handle accounting negatives)

### 🔢 Integer Fields

`Participant_Count`, `Owning_Group` → **integers only**

Round if source is accidentally decimal (rare).

### 📝 Text Fields

`Plan_Name`, `Plan_ID`, `Compensation_Type`, `Status`, `Plan_Type` → Trim whitespace, preserve case

### ⚠️ Missing Fields

- Use `null` for any field the source doesn't provide
- When writing to Firebase RTDB, **omit null fields** to reduce payload size
- Exception: Keep `Status: "Active"` as default if not explicitly provided

### 📞 Contact Parsing

If a record keeper provides contact info:
- Parse into `Name`, `Email`, `Phone` structure
- Handle formats like `"John Smith (john.smith@example.com) 555-1234"`
- If role is completely missing, omit that contact object

---

## Record Keeper Specifications

### 🎯 Implementation Status

| Record Keeper | Status | File Type | Complexity | Special Features |
|--------------|--------|-----------|------------|------------------|
| American Funds | ✅ **Implemented** | XLSX | Medium | Header extraction, date parsing |
| Transamerica | ✅ **Implemented** | CSV + XLS | High | Dual-file merge, MEP aggregation |
| John Hancock | 📝 **Documented** | CSV + XLSX | High | Multi-row aggregation, program-based |
| Principal Financial | 📝 **Documented** | XLS (legacy) | Very High | Column aliasing, pivot melting, multi-tab |

---

### 1️⃣ Transamerica

**File format:** CSV + XLS (two-file system)  
**File 1:** `ERP TPA SFI Sept 2025.csv` (monthly payment statement)  
**File 2:** `Transamerica Master from 2023 to 2024.xls` (historical data)  
**Key characteristics:**
- **Dual-file import**: CSV provides current period, XLS provides historical context
- Basis point fee structure (asset-based and deposit-based)
- MEP (Multiple Employer Plan) aggregation support (e.g., TEXO)
- Merge on `Plan_ID` (Contract ID = Plan Number)

---

#### 📁 FILE 1: ERP TPA SFI Sept 2025.csv

**Type:** CSV (comma-delimited, UTF-8)  
**Purpose:** Current period fee statement

##### Source Columns

| Source Column | Description | Type |
|--------------|-------------|------|
| `Contract ID` | Plan/contract number | string |
| `Holder Name` | Plan sponsor name | string |
| `Asset Basis Point` | Asset-based basis points charged | number |
| `Asset Value` | Assets subject to BPS fee | currency |
| `Asset Based Fee` | Dollar value of asset-based payment | currency |
| `Deposit Basis Point` | Deposit-based basis points | number |
| `Deposit Amount` | Deposit dollars for period | currency |
| `Deposit Based Fee` | Dollar value of deposit-based payment | currency |
| `Total Fee` | Sum of all fees this period | currency |
| `Ints Allowance` | Internal allowance (rarely populated) | string |
| `Company` | Internal indicator (e.g., "NAV") | string |
| `TPA ID` | Third-party administrator ID | string |
| `TPA Name` | Third-party administrator name | string |
| `Balance Date` | Period end date | date (MM/DD/YYYY) |
| `inclusive` | Audit flag | string |
| `trans_type` | Transaction type flag | string |

##### Field Mapping to Common Dataset

| Target Field | Source | Transform |
|--------------|--------|-----------|
| `Plan_ID` | `Contract ID` | Trim |
| `Plan_Name` | `Holder Name` | Strip "Trustee(s) for", "Fiduciary(ies) of" |
| `Record_Keeper` | Literal | **"Transamerica"** |
| `Period_End_Date` | `Balance Date` | Parse MM/DD/YYYY → YYYY-MM-DD |
| `Asset_Value` | `Asset Value` | Currency → float |
| `Net_Cash_Flow_Period` | `Deposit Amount` | Currency → float |
| `Compensation_Type` | Derived | "Asset-Based Fee" if Asset Fee > 0, else "Deposit-Based Fee" |
| `Status` | Default | **"Active"** |
| `Plan_Type` | Default | **"401K"** (unless noted otherwise) |

##### Supplemental Fields (CSV-specific)

Store in `Supplemental` object:
```json
"Supplemental": {
  "Asset_Basis_Points": 15,
  "Deposit_Basis_Points": 20,
  "Asset_Based_Fee": 1502.00,
  "Deposit_Based_Fee": 0.00,
  "Total_Fee": 1502.00,
  "TPA_Name": "Executive Retirement Plans, LLC",
  "TPA_ID": "ERP001",
  "High_BPS": true,  // true if total BPS > 50
  "BPS_Received": 35  // Asset_BPS + Deposit_BPS
}
```

##### Plan Name Cleaning

Remove common prefixes:
- "Trustee(s) for the "
- "Fiduciary(ies) of the "
- "Trustees of "
- "Trustee for "

Example: `"Trustee(s) for the Acme Corp 401(k) Plan"` → `"Acme Corp 401(k) Plan"`

---

#### 📁 FILE 2: Transamerica Master from 2023 to 2024.xls

**Type:** Excel workbook (.xls) with multiple sheets  
**Purpose:** Historical fee data and plan effective dates

##### Sheet 1: "Transaction fees"

| Column | Description | Target Field |
|--------|-------------|--------------|
| `Plan Number` | Contract/plan ID | `Plan_ID` |
| `Plan Name` | Employer name | `Plan_Name` |
| `Effective Date` | Plan start date | `Contract_Date` |
| `Transaction Fee` | Per-transaction fee amount | `Supplemental.Per_Transaction_Fee` |

**Parsing:**
- Parse `Effective Date` → YYYY-MM-DD
- Keep one row per plan (latest if duplicates)
- Store `Transaction Fee` as supplemental field

##### Sheet 2: "Total Fees"

| Column | Description | Target Field |
|--------|-------------|--------------|
| `Plan Number` | Contract/plan ID | `Plan_ID` |
| `Plan Name` | Employer name | `Plan_Name` |
| `Service Fee Income` | Cumulative fees received | `Paid_to_Date`, `Earned_to_Date` |
| `Period` | Month/quarter label | Parse for date |
| `Assets` (if present) | Asset value | `Asset_Value` (if not in CSV) |

**Parsing:**
- Convert `Service Fee Income` to numeric
- If multiple periods, keep **latest** per plan
- Use for historical cumulative totals

---

#### 🔀 Merge Logic (CSV + XLS)

**Merge key:** `Plan_ID` (CSV's "Contract ID" = XLS's "Plan Number")

**Priority rules:**
1. **Current metrics** (from CSV):
   - `Asset_Value`
   - `Total_Fee` (current period)
   - `Period_End_Date`
   - `Net_Cash_Flow_Period`

2. **Historical context** (from XLS):
   - `Contract_Date` (Effective Date)
   - `Paid_to_Date` / `Earned_to_Date` (Service Fee Income cumulative)
   - `Per_Transaction_Fee`

3. **Plan_Name conflicts:**
   - Prefer **longer** name
   - Or prefer CSV (more recent)

**Example merge:**
```javascript
function mergeTransamericaData(csvRecord, xlsRecord) {
  return {
    // Core fields from CSV (current)
    Plan_ID: csvRecord.Plan_ID,
    Plan_Name: csvRecord.Plan_Name.length > xlsRecord.Plan_Name.length 
      ? csvRecord.Plan_Name 
      : xlsRecord.Plan_Name,
    Record_Keeper: "Transamerica",
    Period_End_Date: csvRecord.Period_End_Date,  // From CSV
    
    // Historical from XLS
    Contract_Date: xlsRecord.Contract_Date,      // From XLS
    
    // Financial - CSV current period
    Asset_Value: csvRecord.Asset_Value,
    Net_Cash_Flow_Period: csvRecord.Net_Cash_Flow_Period,
    
    // Historical cumulative from XLS
    Earned_to_Date: xlsRecord.Earned_to_Date,
    Paid_to_Date: xlsRecord.Paid_to_Date,
    
    // Supplemental - combined
    Supplemental: {
      ...csvRecord.Supplemental,
      Per_Transaction_Fee: xlsRecord.Per_Transaction_Fee
    },
    
    // Provenance tracks both sources
    Provenance: {
      Source_File_Name: csvRecord.fileName,
      Historical_File_Name: xlsRecord.fileName,
      Tabs_Used: ["Transaction fees", "Total Fees"],
      Ingested_At: new Date().toISOString()
    }
  };
}
```

---

#### 🏢 MEP Handling (Multiple Employer Plans)

**Detect MEP:** If `Plan_Name` contains "TEXO" or other master MEP identifier

**Structure:**
1. **Parent record:** Aggregated totals
   - Plan_ID: `TEXO-MASTER`
   - Asset_Value: Sum of all child assets
   - Total_Fee: Sum of all child fees
   - `Is_MEP`: true
   - `MEP_Participants_Count`: Number of child contracts

2. **Child records:** Individual adopting employers
   - Plan_ID: `TEXO-<sub-id>` (e.g., `TEXO-001`, `TEXO-002`)
   - Keep individual data
   - Link to parent: `MEP_Parent_ID`: `"TEXO-MASTER"`

**Example MEP structure:**
```json
{
  "Plan_ID": "TEXO-MASTER",
  "Plan_Name": "TEXO Multiple Employer Plan",
  "Is_MEP": true,
  "MEP_Participants_Count": 15,
  "Asset_Value": 45000000.00,  // Sum of all children
  "Total_Fee": 22500.00,        // Sum of all children
  "Children": [
    {
      "Plan_ID": "TEXO-001",
      "Plan_Name": "ABC Construction",
      "Asset_Value": 3000000.00,
      "MEP_Parent_ID": "TEXO-MASTER"
    },
    {
      "Plan_ID": "TEXO-002",
      "Plan_Name": "XYZ Manufacturing",
      "Asset_Value": 2500000.00,
      "MEP_Parent_ID": "TEXO-MASTER"
    }
    // ... 13 more children
  ]
}
```

---

#### 📊 Complete Example Output

**CSV Input:**
```csv
Contract ID,Holder Name,Balance Date,Asset Value,Asset Basis Point,Asset Based Fee,Deposit Basis Point,Deposit Amount,Deposit Based Fee,Total Fee,TPA Name
514240-000,Lakewood Family Medicine 401(k) Plan,9/15/2025,$12016022.38,15,$1502.00,20,$0.00,$0.00,$1502.00,Executive Retirement Plans LLC
```

**XLS Input (Transaction fees sheet):**
```
Plan Number: 514240-000
Effective Date: 3/1/2021
Transaction Fee: $35.00
```

**XLS Input (Total Fees sheet):**
```
Plan Number: 514240-000
Service Fee Income: $75000.00
Period: 2025-Q3
```

**Merged Output (Common Dataset):**
```json
{
  "Plan_ID": "514240-000",
  "Plan_Name": "Lakewood Family Medicine 401(k) Plan",
  "Record_Keeper": "Transamerica",
  "Contract_Date": "2021-03-01",
  "YE_Date": null,
  
  "Asset_Value": 12016022.38,
  "Recurring_Assets": null,
  "Transfer_Assets": null,
  "Earned_to_Date": 75000.00,
  "Paid_to_Date": 75000.00,
  "Owe_This_Period": null,
  "Waived_to_Date": null,
  
  "Compensation_Type": "Asset-Based Fee",
  "Status": "Active",
  "Period_End_Date": "2025-09-15",
  
  "Plan_Type": "401K",
  "Participant_Count": null,
  "Average_Assets_Per_Participant": null,
  "Net_Cash_Flow_Period": 0.00,
  "Participation_Rate": null,
  "Contribution_Rate": null,
  
  "CompensationDetail": [
    {
      "Type": "Asset-Based Fee",
      "SubType": "15 BPS",
      "Earned": 1502.00,
      "Notes": null
    },
    {
      "Type": "Deposit-Based Fee",
      "SubType": "20 BPS",
      "Earned": 0.00,
      "Notes": null
    }
  ],
  
  "Supplemental": {
    "Asset_Basis_Points": 15,
    "Deposit_Basis_Points": 20,
    "Asset_Based_Fee": 1502.00,
    "Deposit_Based_Fee": 0.00,
    "Total_Fee": 1502.00,
    "Per_Transaction_Fee": 35.00,
    "BPS_Received": 35,
    "High_BPS": false,
    "TPA_Name": "Executive Retirement Plans LLC",
    "TPA_ID": null
  },
  
  "Provenance": {
    "Source_File_Name": "ERP TPA SFI Sept 2025.csv",
    "Historical_File_Name": "Transamerica Master from 2023 to 2024.xls",
    "Tabs_Used": ["Transaction fees", "Total Fees"],
    "Report_Type": "Monthly Payment Summary",
    "Ingested_At": "2025-10-09T14:30:00.000Z"
  },
  
  "Parsing": {
    "Warnings": [],
    "Raw_Field_Map": {
      "Contract ID": "Plan_ID",
      "Holder Name": "Plan_Name",
      "Balance Date": "Period_End_Date",
      "Asset Value": "Asset_Value",
      "Total Fee": "Supplemental.Total_Fee",
      "Plan Number": "Plan_ID",
      "Effective Date": "Contract_Date",
      "Service Fee Income": "Paid_to_Date"
    }
  }
}
```

---

#### 🔧 Parsing Implementation

```javascript
async function parseTransamericaFiles(csvFile, xlsFile) {
  // Step 1: Parse CSV (current period)
  const csvData = await parseTransamericaCSV(csvFile);
  
  // Step 2: Parse XLS (historical)
  const xlsData = xlsFile ? await parseTransamericaXLS(xlsFile) : {};
  
  // Step 3: Merge by Plan_ID
  const merged = mergeTransamericaData(csvData, xlsData);
  
  // Step 4: Handle MEPs
  const withMEPs = aggregateMEPs(merged);
  
  return withMEPs;
}

function parseTransamericaCSV(file) {
  // Read CSV
  const rows = parseCSV(file);
  
  return rows.map(row => {
    // Clean Plan Name
    let planName = row['Holder Name'];
    planName = planName.replace(/Trustee\(s\) for the /gi, '');
    planName = planName.replace(/Fiduciary\(ies\) of the /gi, '');
    planName = planName.replace(/Trustees of /gi, '');
    
    // Calculate derived fields
    const assetBPS = parseFloat(row['Asset Basis Point']) || 0;
    const depositBPS = parseFloat(row['Deposit Basis Point']) || 0;
    const bpsReceived = assetBPS + depositBPS;
    const highBPS = bpsReceived > 50;
    
    // Determine compensation type
    const assetFee = parseCurrency(row['Asset Based Fee']);
    const depositFee = parseCurrency(row['Deposit Based Fee']);
    const compensationType = assetFee > 0 ? "Asset-Based Fee" : "Deposit-Based Fee";
    
    return {
      Plan_ID: row['Contract ID'],
      Plan_Name: planName.trim(),
      Record_Keeper: "Transamerica",
      Period_End_Date: parseDate(row['Balance Date']),
      
      Asset_Value: parseCurrency(row['Asset Value']),
      Net_Cash_Flow_Period: parseCurrency(row['Deposit Amount']),
      
      Compensation_Type: compensationType,
      Status: "Active",
      Plan_Type: "401K",
      
      CompensationDetail: [
        {
          Type: "Asset-Based Fee",
          SubType: `${assetBPS} BPS`,
          Earned: assetFee
        },
        {
          Type: "Deposit-Based Fee",
          SubType: `${depositBPS} BPS`,
          Earned: depositFee
        }
      ],
      
      Supplemental: {
        Asset_Basis_Points: assetBPS,
        Deposit_Basis_Points: depositBPS,
        Asset_Based_Fee: assetFee,
        Deposit_Based_Fee: depositFee,
        Total_Fee: parseCurrency(row['Total Fee']),
        BPS_Received: bpsReceived,
        High_BPS: highBPS,
        TPA_Name: row['TPA Name'],
        TPA_ID: row['TPA ID']
      }
    };
  });
}

function aggregateMEPs(records) {
  // Find MEP patterns (e.g., TEXO)
  const mepGroups = {};
  const regular = [];
  
  records.forEach(record => {
    const mepMatch = record.Plan_Name.match(/TEXO|MEP|Multiple Employer/i);
    
    if (mepMatch) {
      const mepKey = 'TEXO-MASTER'; // Or derive from match
      if (!mepGroups[mepKey]) {
        mepGroups[mepKey] = {
          parent: null,
          children: []
        };
      }
      mepGroups[mepKey].children.push(record);
    } else {
      regular.push(record);
    }
  });
  
  // Create parent records
  const mepRecords = Object.entries(mepGroups).map(([key, group]) => {
    const parent = {
      Plan_ID: key,
      Plan_Name: group.children[0].Plan_Name + " (MEP Master)",
      Is_MEP: true,
      MEP_Participants_Count: group.children.length,
      Asset_Value: group.children.reduce((sum, c) => sum + c.Asset_Value, 0),
      Children: group.children.map(c => ({ ...c, MEP_Parent_ID: key }))
    };
    return parent;
  });
  
  return [...regular, ...mepRecords];
}
```

---

#### ⚠️ Special Considerations

**1. Missing XLS file:**
- Import CSV only
- Set historical fields to `null`
- Add warning: `"Missing historical data file"`

**2. Basis Points > 100:**
- Log warning: `"High basis points detected: {value} BPS"`
- Flag with `High_BPS: true`

**3. Negative fees:**
- Can occur (refunds/adjustments)
- Allow negative values
- Log informational note

**4. MEP detection:**
- Check for keywords: TEXO, MEP, "Multiple Employer"
- Or flag manually if pattern unclear
- Provide toggle to disable auto-aggregation

**5. Date parsing:**
- CSV uses MM/DD/YYYY
- XLS may use Excel serial dates or formatted dates
- Try both formats with fallback

---

#### 🧪 Testing Checklist

**CSV Parsing:**
- [ ] Parse all 15 columns correctly
- [ ] Strip plan name prefixes (Trustee, Fiduciary)
- [ ] Calculate BPS_Received (Asset + Deposit)
- [ ] Flag High_BPS when > 50
- [ ] Determine compensation type (asset vs deposit)
- [ ] Parse Balance Date (MM/DD/YYYY → YYYY-MM-DD)

**XLS Parsing:**
- [ ] Read "Transaction fees" sheet
- [ ] Read "Total Fees" sheet
- [ ] Parse Effective Date
- [ ] Extract Service Fee Income
- [ ] Handle multiple periods (keep latest)

**Merge Logic:**
- [ ] Match on Plan_ID
- [ ] Prefer CSV for current metrics
- [ ] Use XLS for Contract_Date
- [ ] Use XLS for Paid_to_Date cumulative
- [ ] Handle name conflicts (keep longer)
- [ ] Merge supplemental fields

**MEP Aggregation:**
- [ ] Detect TEXO pattern
- [ ] Create parent record
- [ ] Sum child assets
- [ ] Sum child fees
- [ ] Link children to parent
- [ ] Set MEP flags

---

**Summary:** Transamerica requires a **two-file merge** approach with special MEP handling. CSV provides current period snapshot, XLS adds historical context and effective dates.

---

### 2️⃣ John Hancock

**File format:** CSV + XLSX (dual-file system)  
**File 1:** `John Hancock 1.csv` (master export of all incentive rows)  
**File 2:** `John Hancock 2.xlsx` (detail tabs for specific programs)  
**Key characteristics:**
- **Multi-row per plan**: Each plan has multiple rows (one per incentive program)
- **Program-based compensation**: IA (Installation Allowance) and EA (Efficiency Allowance)
- **SubType variants**: Pre-2015 vs Post-2015, Year-specific (2024, 2025)
- **Aggregation required**: Rollup multiple rows per plan into single PlanPeriod
- **Status inference**: Discontinued/Transferred based on program type

---

#### 📁 FILE 1: John Hancock 1.csv

**Type:** CSV (comma-delimited)  
**Purpose:** Master export with all incentive programs for the reporting period

##### Source Columns (30+)

| Column | Description | Type |
|--------|-------------|------|
| `Incentive_Desc` | Program identifier (e.g., "2024 Installation Allowance") | string |
| `Plan_Number` | Plan ID | string |
| `Plan_Name` | Sponsor name | string |
| `NY` | New York flag | string |
| `Transferred_In` | Transfer flag | string |
| `TPA_Firm_Number` | TPA identifier | string |
| `Plan_YE` | Plan year-end (MM/DD or full date) | string/date |
| `Contract_Eff_Date` | Contract effective date | date |
| `Actual_Recurring` | Recurring assets for IA programs | currency |
| `Actual_Transfer` | Transfer assets for IA programs | currency |
| `Actual_Credits` | Credits applied | currency |
| `Number_Of_Months` | Months active | integer |
| `Current_Asset_Value` | Asset value (EA programs) | currency |
| `Waive_To_Date` | Cumulative waived amount | currency |
| `Earned_To_Date` | Cumulative earned | currency |
| `Previously_Paid` | Previous payments | currency |
| `Carried_Fwd_to_Date` | Carryforward amount | currency |
| `Owe_This_Period` | Amount owed this period | currency |
| `Pay_This_Period` | Amount paid this period | currency |
| `Paid_To_Date` | Cumulative paid | currency |
| `Paid_For_Calendar_Yr` | Paid in calendar year | currency |
| `Paid_In_Plan_Yr` | Paid in plan year | currency |

##### Program Types (Incentive_Desc values)

| Program Name | Type | SubType | Notes |
|--------------|------|---------|-------|
| `2024 Installation Allowance` | Installation Allowance | 2024 | Year-specific IA |
| `2025 Installation Allowance` | Installation Allowance | 2025 | Year-specific IA |
| `Pre-2015 Efficiency Allowance` | Efficiency Allowance | Pre-2015 | EA subtype |
| `Post-January 1st 2015 Efficiency Allowance` | Efficiency Allowance | Post-2015 | EA subtype |
| `IA Discontinued Contracts` | IA Discontinued | null | Sets Status="Discontinued" |
| `EA Discontinued Contracts` | EA Discontinued | null | Sets Status="Discontinued" |
| `EA Transferred Out Plans` | EA Transferred Out | null | Sets Status="Transferred" |

##### Key Parsing Rules

1. **One row = one plan × one incentive program**
2. **Multiple rows per plan must be aggregated**
3. **Period_End_Date**: External parameter (from report header, e.g., "2025-08-31")
4. **Required fields**: Plan_Number AND Plan_Name (drop rows missing both)

---

#### 📁 FILE 2: John Hancock 2.xlsx

**Type:** Excel workbook (.xlsx) with multiple sheets  
**Purpose:** Detail tabs for specific incentive programs

##### Sheet Names (typical)

- `2024 Installation Allowance Details`
- `2025 Installation Allowance Details`
- `Pre-2015 Efficiency Allowance Details`
- `Post-January 1st 2015 Efficiency Allowance Details`
- `IA Discontinued Contracts Details`
- `EA Discontinued Contracts Details`

##### Columns (per sheet - IA example)

| Column | Description |
|--------|-------------|
| `Plan_Number` | Plan ID |
| `Plan_Name` | Sponsor name |
| `TPA_Firm_Number` | TPA identifier |
| `Plan_YE` | Plan year-end |
| `Contract_Eff_Date` | Contract effective date |
| `Actual_Recurring` | Recurring assets |
| `Actual_Transfer` | Transfer assets |
| `Earned_To_Date` | Cumulative earned |
| `Waived_To_Date` | Cumulative waived |
| `Waive_Type` | Waiver type/reason |
| `Previously_Paid` | Previous payments |
| `Carried_Fwd_to_Date` | Carryforward |
| `Owe_This_Period` | Owed this period |
| `Pay_This_Period` | Paid this period |
| `Paid_To_Date` | Cumulative paid |
| `Paid_For_Calendar_Yr` | Calendar year paid |
| `Paid_In_Plan_Yr` | Plan year paid |

##### Parsing Strategy

- Parse **each sheet** as a separate program
- Sheet name → `Incentive_Desc` (maps to Type/SubType)
- If file 2 conflicts with file 1 for same plan+program:
  - **Prefer file 2** (detail tab is more authoritative)
  - Otherwise **merge/sum** amounts

---

#### 🔀 Aggregation & Rollup Logic

**Key:** `(Record_Keeper, Plan_ID, Period_End_Date)`

**For each plan:**
1. **Collect all rows** (from CSV + XLSX sheets)
2. **Group by incentive program** (Type + SubType)
3. **Sum financial fields** across programs:
   - `Earned_to_Date` = sum of all program Earned_To_Date
   - `Paid_to_Date` = sum of all program Paid_To_Date
   - `Owe_This_Period` = sum of all program Owe_This_Period
   - `Waived_to_Date` = sum of all program Waive_To_Date

4. **Asset fields** (prefer specific programs):
   - `Asset_Value`: Use **EA row's** `Current_Asset_Value` (EA is asset-based)
   - `Recurring_Assets`: Sum **IA rows'** `Actual_Recurring`
   - `Transfer_Assets`: Sum **IA rows'** `Actual_Transfer`

5. **Status inference**:
   - Default: `"Active"`
   - If any "IA Discontinued" or "EA Discontinued" row exists → `"Discontinued"`
   - If only "EA Transferred Out" rows exist → `"Transferred"`

6. **Build CompensationDetail array**:
   - One entry per unique `(Type, SubType)` combination
   - Include: Earned, Paid, Owe, Waived
   - Notes: Include Previously_Paid, Carried_Fwd_to_Date, Actual_Credits, Number_Of_Months

---

#### 📊 Field Mapping to Common Dataset

| Target Field | Source | Notes |
|--------------|--------|-------|
| `Plan_ID` | `Plan_Number` | Primary key |
| `Plan_Name` | `Plan_Name` | Trim |
| `Record_Keeper` | Literal | **"John Hancock"** |
| `Period_End_Date` | **External parameter** | e.g., "2025-08-31" from report header |
| `Contract_Date` | `Contract_Eff_Date` | Parse to YYYY-MM-DD |
| `YE_Date` | `Plan_YE` | Parse if full date; else MM/DD string |
| `Asset_Value` | `Current_Asset_Value` (EA rows) | Prefer EA program row |
| `Recurring_Assets` | Sum IA `Actual_Recurring` | Across all IA rows |
| `Transfer_Assets` | Sum IA `Actual_Transfer` | Across all IA rows |
| `Earned_to_Date` | Sum all `Earned_To_Date` | Across all programs |
| `Paid_to_Date` | Sum all `Paid_To_Date` | Across all programs |
| `Owe_This_Period` | Sum all `Owe_This_Period` | Across all programs |
| `Waived_to_Date` | Sum all `Waive_To_Date` | Across all programs |
| `Compensation_Type` | null | Use CompensationDetail instead |
| `Status` | Derived | See status inference rules |
| `Plan_Type` | null | Not provided in these files |
| `Participant_Count` | null | Not provided |

**Fields NOT provided by John Hancock:**
- `Participant_Count`
- `Average_Assets_Per_Participant`
- `Net_Cash_Flow_Period`
- `Participation_Rate`
- `Contribution_Rate`
- `Contacts` (no contact info in these files)

---

#### 💰 CompensationDetail Structure

Each program becomes an entry:

```json
"CompensationDetail": [
  {
    "Type": "Installation Allowance",
    "SubType": "2024",
    "Earned": 737.20,
    "Paid": 737.20,
    "Owe": 0.00,
    "Waived": 0.00,
    "Notes": "Previously_Paid=737.20; Carried_Fwd_to_Date=0.00; Actual_Recurring=28886; Actual_Transfer=224170"
  },
  {
    "Type": "Installation Allowance",
    "SubType": "2025",
    "Earned": 0.00,
    "Paid": 0.00,
    "Owe": 0.00,
    "Waived": 0.00,
    "Notes": "New program"
  },
  {
    "Type": "Efficiency Allowance",
    "SubType": "Post-2015",
    "Earned": 101.56,
    "Paid": 87.28,
    "Owe": 14.28,
    "Waived": 0.00,
    "Notes": "Current_Asset_Value=342740; Number_Of_Months=12"
  }
]
```

---

#### 📊 Complete Example Output

**CSV Input (multiple rows for one plan):**
```csv
Incentive_Desc,Plan_Number,Plan_Name,Contract_Eff_Date,Plan_YE,Actual_Recurring,Actual_Transfer,Earned_To_Date,Paid_To_Date,Owe_This_Period
2024 Installation Allowance,0164802,BLOUGH INC,2024-01-26,12/31,28886,224170,737.20,737.20,0.00
Post-January 1st 2015 Efficiency Allowance,0164802,BLOUGH INC,2024-01-26,12/31,,,101.56,87.28,14.28
```

**XLSX Input (2024 IA Details sheet):**
```
Plan_Number,Plan_Name,Actual_Recurring,Actual_Transfer,Earned_To_Date
0164802,BLOUGH INC,28886,224170,737.20
```

**Merged Output (Common Dataset):**
```json
{
  "Plan_ID": "0164802",
  "Plan_Name": "BLOUGH INC",
  "Record_Keeper": "John Hancock",
  "Period_End_Date": "2025-08-31",
  
  "Contract_Date": "2024-01-26",
  "YE_Date": "12/31",
  
  "Asset_Value": 342740.00,       // From EA row
  "Recurring_Assets": 28886.00,   // From IA row
  "Transfer_Assets": 224170.00,   // From IA row
  
  "Earned_to_Date": 838.76,       // 737.20 + 101.56
  "Paid_to_Date": 824.48,         // 737.20 + 87.28
  "Owe_This_Period": 14.28,       // 0.00 + 14.28
  "Waived_to_Date": 0.00,
  
  "Compensation_Type": null,
  "Status": "Active",
  
  "CompensationDetail": [
    {
      "Type": "Installation Allowance",
      "SubType": "2024",
      "Earned": 737.20,
      "Paid": 737.20,
      "Owe": 0.00,
      "Waived": 0.00,
      "Notes": "Actual_Recurring=28886; Actual_Transfer=224170"
    },
    {
      "Type": "Efficiency Allowance",
      "SubType": "Post-2015",
      "Earned": 101.56,
      "Paid": 87.28,
      "Owe": 14.28,
      "Waived": 0.00,
      "Notes": "Current_Asset_Value=342740"
    }
  ],
  
  "Provenance": {
    "Source_File_Name": ["John Hancock 1.csv", "John Hancock 2.xlsx"],
    "Report_Header_Period": "2025-08-31",
    "Ingested_At": "2025-10-09T15:00:00.000Z"
  },
  
  "Parsing": {
    "Warnings": [],
    "Raw_Field_Map": {
      "Actual_Recurring": "Recurring_Assets",
      "Actual_Transfer": "Transfer_Assets",
      "Current_Asset_Value": "Asset_Value",
      "Earned_To_Date": "Earned_to_Date",
      "Paid_To_Date": "Paid_to_Date"
    }
  }
}
```

---

#### 📝 Example 2: Discontinued Plan

```json
{
  "Plan_ID": "0131930",
  "Plan_Name": "SHARON RICHENS MD",
  "Record_Keeper": "John Hancock",
  "Period_End_Date": "2025-08-31",
  
  "Status": "Discontinued",
  
  "Earned_to_Date": 590.67,
  "Paid_to_Date": 590.67,
  "Owe_This_Period": 0.00,
  
  "CompensationDetail": [
    {
      "Type": "EA Discontinued",
      "SubType": null,
      "Earned": 590.67,
      "Paid": 590.67,
      "Owe": 0.00,
      "Waived": 0.00,
      "Notes": "Discontinued contract"
    }
  ],
  
  "Provenance": {
    "Source_File_Name": ["John Hancock 1.csv"]
  }
}
```

---

#### 🔧 Parsing Implementation

```javascript
async function parseJohnHancockFiles(csvFile, xlsxFile, reportingPeriod) {
  // Step 1: Parse CSV (all incentive rows)
  const csvRows = await parseJohnHancockCSV(csvFile);
  
  // Step 2: Parse XLSX (detail tabs)
  const xlsxRows = xlsxFile ? await parseJohnHancockXLSX(xlsxFile) : [];
  
  // Step 3: Combine & normalize all rows
  const allRows = [...csvRows, ...xlsxRows].map(row => ({
    ...row,
    Period_End_Date: reportingPeriod || row.Period_End_Date
  }));
  
  // Step 4: Group by Plan_ID
  const byPlan = groupByPlan(allRows);
  
  // Step 5: Aggregate each plan
  const planPeriods = Object.values(byPlan).map(planRows => 
    aggregateJohnHancockPlan(planRows, reportingPeriod)
  );
  
  return planPeriods;
}

function aggregateJohnHancockPlan(rows, reportingPeriod) {
  // Group rows by program type
  const programs = {};
  
  rows.forEach(row => {
    const { programType, programSubType } = parseIncentiveDesc(row.Incentive_Desc);
    const key = `${programType}|${programSubType || ''}`;
    
    if (!programs[key]) {
      programs[key] = {
        Type: programType,
        SubType: programSubType,
        rows: []
      };
    }
    programs[key].rows.push(row);
  });
  
  // Build compensation detail
  const compensationDetail = Object.values(programs).map(prog => ({
    Type: prog.Type,
    SubType: prog.SubType,
    Earned: sumField(prog.rows, 'Earned_To_Date'),
    Paid: sumField(prog.rows, 'Paid_To_Date'),
    Owe: sumField(prog.rows, 'Owe_This_Period'),
    Waived: sumField(prog.rows, 'Waive_To_Date'),
    Notes: buildNotes(prog.rows[0])
  }));
  
  // Determine status
  const hasDiscontinued = rows.some(r => 
    r.Incentive_Desc.includes('Discontinued')
  );
  const hasTransferred = rows.some(r => 
    r.Incentive_Desc.includes('Transferred Out')
  );
  const status = hasDiscontinued ? 'Discontinued' 
    : hasTransferred ? 'Transferred' 
    : 'Active';
  
  // Get first row for plan-level fields
  const firstRow = rows[0];
  
  // Get EA row for asset value
  const eaRow = rows.find(r => 
    r.Incentive_Desc.includes('Efficiency Allowance')
  );
  
  // Get IA rows for recurring/transfer assets
  const iaRows = rows.filter(r => 
    r.Incentive_Desc.includes('Installation Allowance') &&
    !r.Incentive_Desc.includes('Discontinued')
  );
  
  return {
    Plan_ID: firstRow.Plan_Number,
    Plan_Name: firstRow.Plan_Name,
    Record_Keeper: "John Hancock",
    Period_End_Date: reportingPeriod,
    Contract_Date: parseDate(firstRow.Contract_Eff_Date),
    YE_Date: firstRow.Plan_YE,
    
    Asset_Value: eaRow ? eaRow.Current_Asset_Value : null,
    Recurring_Assets: sumField(iaRows, 'Actual_Recurring'),
    Transfer_Assets: sumField(iaRows, 'Actual_Transfer'),
    
    Earned_to_Date: sumField(rows, 'Earned_To_Date'),
    Paid_to_Date: sumField(rows, 'Paid_To_Date'),
    Owe_This_Period: sumField(rows, 'Owe_This_Period'),
    Waived_to_Date: sumField(rows, 'Waive_To_Date'),
    
    Status: status,
    CompensationDetail: compensationDetail
  };
}

function parseIncentiveDesc(desc) {
  // "2024 Installation Allowance" → { type: "Installation Allowance", subType: "2024" }
  // "Pre-2015 Efficiency Allowance" → { type: "Efficiency Allowance", subType: "Pre-2015" }
  
  if (desc.includes('Installation Allowance')) {
    const yearMatch = desc.match(/(\d{4})/);
    return {
      programType: 'Installation Allowance',
      programSubType: yearMatch ? yearMatch[1] : null
    };
  }
  
  if (desc.includes('Efficiency Allowance')) {
    if (desc.includes('Pre-2015')) {
      return { programType: 'Efficiency Allowance', programSubType: 'Pre-2015' };
    } else if (desc.includes('Post') || desc.includes('2015')) {
      return { programType: 'Efficiency Allowance', programSubType: 'Post-2015' };
    }
    return { programType: 'Efficiency Allowance', programSubType: null };
  }
  
  if (desc.includes('IA Discontinued')) {
    return { programType: 'IA Discontinued', programSubType: null };
  }
  
  if (desc.includes('EA Discontinued')) {
    return { programType: 'EA Discontinued', programSubType: null };
  }
  
  if (desc.includes('Transferred Out')) {
    return { programType: 'EA Transferred Out', programSubType: null };
  }
  
  return { programType: desc, programSubType: null };
}
```

---

#### ⚠️ Special Considerations

**1. Reporting Period Parameter**
- **Required**: Must be passed externally (e.g., from PDF statement header)
- Format: `"2025-08-31"` (ISO date)
- Not present in CSV/XLSX files themselves

**2. Multiple Rows Per Plan**
- Each plan typically has 2-4 rows (different programs)
- **Must aggregate** before creating PlanPeriod
- Don't create duplicate records

**3. Program Type Detection**
- Use `Incentive_Desc` (CSV) or sheet name (XLSX)
- Parse year from description: "2024 Installation Allowance" → SubType: "2024"
- Pre-2015 vs Post-2015 EA → different SubTypes

**4. Asset Value Priority**
- **EA rows** have `Current_Asset_Value` → use for `Asset_Value`
- **IA rows** have `Actual_Recurring` + `Actual_Transfer`
- If plan has both EA and IA, use EA for asset value

**5. Status Inference**
- Check for "Discontinued" or "Transferred Out" in program names
- Set status accordingly
- Default: "Active"

**6. File Precedence**
- If both CSV and XLSX have same plan+program:
  - **Prefer XLSX** (detail tab is more authoritative)
  - Or merge if different fields

**7. Plan_YE Format**
- May be just "12/31" (month/day only)
- May be full date "12/31/2024"
- Store as-is or convert to date if full year present

---

#### 🧪 Testing Checklist

**CSV Parsing:**
- [ ] Parse all 30+ columns
- [ ] Detect Incentive_Desc program types
- [ ] Handle multiple rows per plan
- [ ] Parse Contract_Eff_Date
- [ ] Parse numeric fields (Earned, Paid, etc.)

**XLSX Parsing:**
- [ ] Read multiple sheets
- [ ] Map sheet name to program type
- [ ] Handle same columns as CSV
- [ ] Prefer XLSX over CSV for same plan+program

**Aggregation:**
- [ ] Group rows by Plan_Number
- [ ] Sum financial fields across programs
- [ ] Build CompensationDetail array (one per program)
- [ ] Calculate Recurring_Assets from IA rows
- [ ] Get Asset_Value from EA rows
- [ ] Infer Status from program types

**Edge Cases:**
- [ ] Plan with only IA (no EA)
- [ ] Plan with only EA (no IA)
- [ ] Discontinued plan
- [ ] Transferred plan
- [ ] Missing reporting period (error)
- [ ] Conflicting CSV vs XLSX data

---

**Summary:** John Hancock requires **multi-row aggregation** with program-based CompensationDetail. CSV provides all programs, XLSX provides detail tabs. Must sum across programs and infer status from program types.

---

### 3️⃣ Principal Financial

**File format:** XLS (legacy Excel)  
**Typical filename:** `Principals.xls`  
**Key characteristics:**
- **Legacy .xls format** (may require conversion to .xlsx or .csv)
- **Multiple possible tab names** (fuzzy matching required)
- **Extensive column aliases** (20+ variations per field)
- **Pivoted layouts** (month columns across top - needs melting)
- **Multi-tab merging** (combine Service Fees + Plan Listing)
- **MEP support** (optional parent/child aggregation)

---

#### 📁 File Structure

**Common tab names** (use fuzzy matching):
- `Service Fee Summary` (or "Service Fees", "Total Fees", "Comp Summary")
- `Plan Listing` (or "Plan Summary", "Contracts")
- `Payment Detail` (or "Monthly Payments", "TPA SFI")
- `Transaction Fees` (if per-transaction charges exist)
- `Adjustments/Credits`

**Note:** If only one tab exists, it often combines plan master + current-period fees.

---

#### 🗂️ Column Alias Dictionary

Principal uses many variations for the same field. **Normalize headers** (trim, collapse spaces) then match using aliases:

| Target Field | Principal Aliases (case-insensitive) |
|--------------|-------------------------------------|
| `Plan_ID` | Contract ID, Contract, Plan Number, Plan #, Contract_Number |
| `Plan_Name` | Plan Name, Contract Name, Holder Name, Group Name |
| `Period_End_Date` | Balance Date, As Of, As-of Date, Statement Date, Period End Date, Report Date |
| `Contract_Date` | Effective Date, Contract Effective Date, Start Date |
| `YE_Date` | Plan YE, Year End, Plan Year End |
| `Asset_Value` | Asset Value, Assets, Current Asset Value, Period Assets, Avg Assets |
| `Asset_Basis_Points` | Asset Basis Point, Asset BPS, Service Fee %, Service Fee (bps), Asset Fee BPS |
| `Asset_Based_Fee` | Asset Based Fee, Asset Fee, Service Fee - Asset, Asset-Based Comp |
| `Deposit_Amount` | Deposit Amount, Deposits, Payroll, Contributions |
| `Deposit_Basis_Points` | Deposit Basis Point, Deposit BPS, Fee % on Deposits |
| `Deposit_Based_Fee` | Deposit Based Fee, Deposit Fee, Service Fee - Deposit |
| `Total_Fee` | Total Fee, Total Service Fee, Service Fee Income, Total Compensation |
| `Credits` | Credits, Adjustments, Waive Amount |
| `TPA_Name` | TPA Name, Third Party Administrator |
| `TPA_ID` | TPA ID, TPA Number |
| `Status` | Discontinued, Terminated, Transferred, Moved |

---

#### 📊 Parsing Steps

**Step 1: Handle Legacy .xls Format**
```javascript
// Try to read .xls directly
try {
  workbook = XLSX.read(fileBuffer, { type: 'buffer' });
} catch (error) {
  // If fails, may need xlrd engine or conversion
  // Option 1: Prompt user to save as .xlsx
  // Option 2: Server-side conversion (if available)
  throw new Error('Please convert .xls to .xlsx format');
}
```

**Step 2: Normalize Headers**
```javascript
function normalizePrincipalHeader(header) {
  return String(header)
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .toLowerCase();
}

// Apply alias dictionary
function mapPrincipalColumn(normalizedHeader) {
  const aliases = {
    'plan_id': ['contract id', 'contract', 'plan number', 'plan #', 'contract_number'],
    'plan_name': ['plan name', 'contract name', 'holder name', 'group name'],
    'asset_value': ['asset value', 'assets', 'current asset value', 'period assets', 'avg assets'],
    // ... full alias dictionary
  };
  
  for (const [target, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(normalizedHeader)) {
      return target;
    }
  }
  return null; // Unknown column
}
```

**Step 3: Detect Pivoted Month Columns**
```javascript
function detectPivotColumns(headers) {
  // Regex patterns for month columns
  const monthPatterns = [
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]?\d{2,4}$/i,
    /^\d{4}[-/]\d{2}$/,
    /^(January|February|...|December)\s+\d{4}$/i
  ];
  
  const pivotColumns = [];
  headers.forEach((header, idx) => {
    if (monthPatterns.some(pattern => pattern.test(header))) {
      pivotColumns.push({ index: idx, monthLabel: header });
    }
  });
  
  return pivotColumns.length > 0 ? pivotColumns : null;
}
```

**Step 4: Melt Pivoted Data**
```javascript
function meltPrincipalPivot(rawData, headers, pivotColumns) {
  // If pivoted: rows are metrics, columns are months
  // Melt to: Plan_ID, Plan_Name, Metric, Period_End_Date, Value
  
  const melted = [];
  
  rawData.forEach(row => {
    const planId = row[findColumn(headers, 'Plan_ID')];
    const planName = row[findColumn(headers, 'Plan_Name')];
    const metric = row[findColumn(headers, 'Metric')] || 'Unknown';
    
    pivotColumns.forEach(col => {
      const value = row[col.index];
      const periodEndDate = parseMonthLabel(col.monthLabel);
      
      melted.push({
        Plan_ID: planId,
        Plan_Name: planName,
        Metric: metric,
        Period_End_Date: periodEndDate,
        Value: parseCurrency(value)
      });
    });
  });
  
  return melted;
}

function parseMonthLabel(label) {
  // "Aug-2025" → "2025-08-31"
  // "2025/08" → "2025-08-31"
  // "August 2025" → "2025-08-31"
  
  // Parse month and year, return last day of month
  // ... implementation
}
```

**Step 5: Extract Period_End_Date**
Priority order:
1. Column with Period_End_Date alias
2. Parsed from pivot month labels
3. Report header date (single value for all rows)
4. External `reporting_period` parameter

**Step 6: Apply Field Mapping**
```javascript
function mapPrincipalToCom monDataset(row, sheetName, fileName) {
  return {
    Plan_ID: row['plan_id'],
    Plan_Name: cleanPlanName(row['plan_name']),
    Record_Keeper: "Principal",
    Period_End_Date: row['period_end_date'],
    Contract_Date: parseDate(row['contract_date']),
    YE_Date: parseYearEnd(row['ye_date'], row['period_end_date']),
    
    Asset_Value: row['asset_value'],
    Recurring_Assets: null, // Not provided
    Transfer_Assets: null,  // Not provided
    
    Earned_to_Date: row['service_fee_income'], // If cumulative
    Paid_to_Date: row['service_fee_income'],
    Owe_This_Period: row['owed'] || null,
    Waived_to_Date: row['credits'] || null,
    
    Status: determineStatus(row['status_flag']),
    
    CompensationDetail: buildPrincipalCompensationDetail(row),
    
    Supplemental: {
      Asset_Basis_Points: row['asset_basis_points'],
      Deposit_Basis_Points: row['deposit_basis_points'],
      Asset_Based_Fee: row['asset_based_fee'],
      Deposit_Based_Fee: row['deposit_based_fee'],
      Total_Fee: row['total_fee'],
      Credits: row['credits'],
      TPA_Name: row['tpa_name'],
      TPA_ID: row['tpa_id']
    },
    
    Provenance: {
      Source_File_Name: fileName,
      Source_Sheet_Name: sheetName,
      Ingested_At: new Date().toISOString()
    }
  };
}
```

---

#### 💰 CompensationDetail Structure

**Option 1: Asset + Deposit Split** (if both provided)
```json
"CompensationDetail": [
  {
    "Type": "Asset-Based Fee",
    "SubType": null,
    "Earned": 1875.00,
    "Paid": 1875.00,
    "Owe": null,
    "Waived": null,
    "Notes": "Asset_Basis_Points=10; Asset_Value=18750000"
  },
  {
    "Type": "Deposit-Based Fee",
    "SubType": null,
    "Earned": 320.00,
    "Paid": 320.00,
    "Owe": null,
    "Waived": null,
    "Notes": "Deposit_Basis_Points=20; Deposit_Amount=160000"
  }
]
```

**Option 2: Total Fee Only** (if no split provided)
```json
"CompensationDetail": [
  {
    "Type": "Total Service Fee",
    "SubType": null,
    "Earned": 2195.00,
    "Paid": 2195.00,
    "Owe": null,
    "Waived": null,
    "Notes": "Period total compensation"
  }
]
```

---

#### 🔀 Multi-Tab Merging

**Merge key:** `(Plan_ID, Period_End_Date)`

**Common scenarios:**

1. **Service Fee Summary + Plan Listing**
   - Service Fee Summary: Current period fees
   - Plan Listing: Plan master data (Contract_Date, YE_Date)
   - Merge: Combine into single PlanPeriod

2. **Current Period + Cumulative**
   - One tab has current month dollars
   - Another has cumulative "Service Fee Income"
   - Store:
     - Current month → `CompensationDetail`
     - Cumulative → `Paid_to_Date` / `Earned_to_Date`

**Merge logic:**
```javascript
function mergePrincipalTabs(tabs) {
  const merged = {};
  
  tabs.forEach(tab => {
    tab.rows.forEach(row => {
      const key = `${row.Plan_ID}_${row.Period_End_Date}`;
      
      if (!merged[key]) {
        merged[key] = { ...row };
      } else {
        // Merge: prefer non-null values
        Object.keys(row).forEach(field => {
          if (row[field] !== null && merged[key][field] === null) {
            merged[key][field] = row[field];
          }
        });
      }
    });
  });
  
  return Object.values(merged);
}
```

---

#### 🏢 MEP Handling

If Principal export includes MEP structure (master plan + adopting employers):

**Child records:** Keep each adopting employer as normal PlanPeriod

**Parent roll-up:** Aggregate across children
```json
{
  "Plan_ID": "PRINCIPAL-MEP-MASTER",
  "Plan_Name": "Principal MEP (Master)",
  "Is_MEP": true,
  "MEP_Participants_Count": 12,
  "Asset_Value": 45000000,  // Sum of children
  "Total_Fee": 22500,        // Sum of children
  "Children": [ /* child records */ ]
}
```

**Detection:**
- Check for "MEP" in Plan_Name
- Or identify by parent/child relationship columns
- If ambiguous, default to showing all as individual plans

---

#### 📊 Complete Example Output

**XLS Input (Service Fee Summary sheet):**
```
Contract ID | Plan Name | As Of | Asset Value | Asset BPS | Asset Based Fee | Deposit BPS | Deposit Amount | Deposit Based Fee | Total Fee
123456-000 | Example Mfg 401k | 9/30/2025 | $18,750,000 | 10 | $1,875.00 | 20 | $160,000 | $320.00 | $2,195.00
```

**Normalized Output (Common Dataset):**
```json
{
  "Plan_ID": "123456-000",
  "Plan_Name": "Example Manufacturing, Inc. 401(k) Plan",
  "Record_Keeper": "Principal",
  "Period_End_Date": "2025-09-30",
  
  "Contract_Date": "2019-05-01",
  "YE_Date": "12-31",
  
  "Asset_Value": 18750000.00,
  "Recurring_Assets": null,
  "Transfer_Assets": null,
  
  "Earned_to_Date": 54000.00,  // If cumulative column exists
  "Paid_to_Date": 54000.00,
  "Owe_This_Period": null,
  "Waived_to_Date": null,
  
  "Compensation_Type": null,
  "Status": "Active",
  
  "CompensationDetail": [
    {
      "Type": "Asset-Based Fee",
      "SubType": null,
      "Earned": 1875.00,
      "Paid": 1875.00,
      "Owe": null,
      "Waived": null,
      "Notes": "Asset_Basis_Points=10; Asset_Value=18750000"
    },
    {
      "Type": "Deposit-Based Fee",
      "SubType": null,
      "Earned": 320.00,
      "Paid": 320.00,
      "Owe": null,
      "Waived": null,
      "Notes": "Deposit_Basis_Points=20; Deposit_Amount=160000"
    }
  ],
  
  "Supplemental": {
    "Asset_Basis_Points": 10.0,
    "Deposit_Basis_Points": 20.0,
    "Asset_Based_Fee": 1875.00,
    "Deposit_Based_Fee": 320.00,
    "Total_Fee": 2195.00,
    "Credits": 0.00,
    "TPA_Name": "Executive Retirement Plans, LLC",
    "TPA_ID": "508420"
  },
  
  "Provenance": {
    "Source_File_Name": "Principals.xls",
    "Source_Sheet_Name": "Service Fee Summary",
    "Ingested_At": "2025-10-09T16:00:00.000Z"
  },
  
  "Parsing": {
    "Warnings": [],
    "Raw_Field_Map": {
      "Contract ID": "Plan_ID",
      "As Of": "Period_End_Date",
      "Asset Value": "Asset_Value",
      "Asset Based Fee": "Asset_Based_Fee"
    }
  }
}
```

---

#### ⚠️ Special Considerations

**1. Legacy .xls Format**
- May require special handling or conversion
- Browser-based XLSX library may not support .xls
- **Solution:** Prompt user to save as .xlsx, or use server-side conversion

**2. Column Name Variations**
- **20+ aliases per field** (see dictionary above)
- **Must normalize:** Trim, collapse spaces, lowercase
- **Fuzzy matching:** Use contains/includes for partial matches

**3. Pivoted Month Layouts**
- **Detection:** Look for month-like headers (regex patterns)
- **Melting:** Convert wide format (months as columns) to long format
- **Date parsing:** "Aug-2025" → "2025-08-31" (last day of month)

**4. Multi-Tab Data**
- **Service Fee Summary:** Current period fees
- **Plan Listing:** Master data (dates, TPA info)
- **Merge by:** (Plan_ID, Period_End_Date)
- **Conflict resolution:** Prefer non-null values

**5. Period_End_Date Extraction**
Priority order:
1. Per-row column (Balance Date, As Of, etc.)
2. Pivot month labels (melt first)
3. Single report header date (apply to all rows)
4. External parameter (user input)

**6. YE_Date Format**
- May be "12/31" (month/day only) or "12-31"
- If no year, use `Period_End_Date` year
- Convert to full ISO date if possible, else store as string

**7. Status Inference**
- Check for status columns: Discontinued, Terminated, Transferred
- Map to standard: "Active", "Discontinued", "Transferred"
- Default: "Active" if no status column

**8. Cumulative vs Period Values**
- **Service Fee Income** (cumulative) → `Earned_to_Date`, `Paid_to_Date`
- **Period fees** → `CompensationDetail`
- Both can coexist in different tabs

---

#### 🧪 Testing Checklist

**File Handling:**
- [ ] Read .xls format (or prompt for .xlsx conversion)
- [ ] Handle multiple sheets
- [ ] Normalize sheet names (fuzzy matching)

**Column Mapping:**
- [ ] Apply alias dictionary (20+ aliases per field)
- [ ] Normalize headers (trim, collapse spaces, lowercase)
- [ ] Handle missing columns gracefully

**Pivot Detection:**
- [ ] Detect month columns (3 regex patterns)
- [ ] Melt pivoted data to long format
- [ ] Parse month labels to ISO dates

**Data Normalization:**
- [ ] Parse currency (strip $, commas)
- [ ] Parse dates (multiple formats)
- [ ] Parse YE_Date (handle MM/DD only)
- [ ] Clean Plan_Name (trustee prefixes)

**Multi-Tab Merging:**
- [ ] Merge by (Plan_ID, Period_End_Date)
- [ ] Prefer non-null values
- [ ] Combine current + cumulative data

**CompensationDetail:**
- [ ] Build Asset + Deposit entries (if split)
- [ ] Or single Total Fee entry (if not split)
- [ ] Include basis points in Notes

**MEP Aggregation:**
- [ ] Detect MEP patterns
- [ ] Create parent record
- [ ] Sum child assets and fees
- [ ] Link children to parent

**Edge Cases:**
- [ ] Single-tab file (master + fees combined)
- [ ] Missing Period_End_Date (use parameter)
- [ ] Only Total Fee (no asset/deposit split)
- [ ] Pivoted layout (wide format)
- [ ] Status flags (discontinued/transferred)

---

**Summary:** Principal requires **extensive column aliasing**, **pivot detection**, and **multi-tab merging**. Legacy .xls format may need conversion. Support both split (Asset+Deposit) and total fee structures.

---

### 4️⃣ T. Rowe Price

**File format:** XLS (legacy Excel)  
**Typical filename:** `TRP_Investment_Summary_YYYYMMDD.xls`  
**Key characteristics:**
- Focus on investment/asset data
- Limited compensation detail (usually rollup only)
- May have multiple header rows to skip

#### Field Mapping

| Source Column | Target Field | Notes |
|--------------|--------------|-------|
| `Account Number` | `Plan_ID` | |
| `Account Name` | `Plan_Name` | |
| `Report Date` | `Period_End_Date` | **REQUIRED** |
| `Market Value` | `Asset_Value` | |
| `Net Cash Flow` | `Net_Cash_Flow_Period` | Can be negative |
| `Participants` | `Participant_Count` | |
| `Average Balance` | `Average_Assets_Per_Participant` | Or calculate if not provided |
| `Fee Amount` | `Earned_to_Date` | If provided |
| `Account Status` | `Status` | Map to standard values |

#### Row Skip Logic:
Skip first 3 rows if they contain:
- Company logo/header
- "Report generated on..."
- Empty rows

Start parsing when you encounter a row with `"Account Number"` header.

#### Parsing Logic:
```javascript
function parseTRowePriceRow(row) {
  const avgAssets = row['Average Balance'] 
    ? parseCurrency(row['Average Balance'])
    : (parseCurrency(row['Market Value']) / (parseInt(row['Participants']) || 1));
    
  return {
    Plan_ID: row['Account Number'],
    Plan_Name: row['Account Name'],
    Record_Keeper: "T. Rowe Price",
    Period_End_Date: parseDate(row['Report Date']),
    Asset_Value: parseCurrency(row['Market Value']),
    Net_Cash_Flow_Period: parseCurrency(row['Net Cash Flow']),
    Participant_Count: parseInt(row['Participants']),
    Average_Assets_Per_Participant: avgAssets,
    Earned_to_Date: parseCurrency(row['Fee Amount']),
    Status: normalizeStatus(row['Account Status']) || "Active",
    CompensationDetail: [] // No detail provided
  };
}
```

---

### 4️⃣ Principal Financial

**File format:** CSV  
**Typical filename:** `Principal_Plan_Data_YYYY_QQ.csv`  
**Key characteristics:**
- Clean, well-structured format
- Includes participation and contribution rates
- Contact info in separate columns

#### Field Mapping

| Source Column | Target Field | Notes |
|--------------|--------------|-------|
| `Plan ID` | `Plan_ID` | |
| `Plan Name` | `Plan_Name` | |
| `Quarter End Date` | `Period_End_Date` | **REQUIRED** |
| `Total Plan Assets` | `Asset_Value` | |
| `New Contributions` | `Recurring_Assets` | |
| `Rollovers` | `Transfer_Assets` | |
| `Participant Count` | `Participant_Count` | |
| `Participation Rate` | `Participation_Rate` | **Convert to decimal** |
| `Average Contribution Rate` | `Contribution_Rate` | **Convert to decimal** |
| `Plan Type` | `Plan_Type` | |
| `Compensation Earned` | `Earned_to_Date` | |
| `Compensation Paid` | `Paid_to_Date` | |
| `Service Rep` | `Contacts.Client_Service_Manager.Name` | |
| `Service Rep Email` | `Contacts.Client_Service_Manager.Email` | |
| `Service Rep Phone` | `Contacts.Client_Service_Manager.Phone` | |

#### Rate Handling:
Principal typically provides rates as percentages (e.g., `77.1` for 77.1%)

```javascript
function normalizePrincipalRate(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  // Principal uses percentage format
  return num > 1 ? num / 100 : num;
}
```

---

### 5️⃣ Empower (formerly MassMutual)

**File format:** XLSX  
**Typical filename:** `Empower_Partner_Report_MMYYYY.xlsx`  
**Sheet name:** `"Plan Summary"` or `"Detail"`  
**Key characteristics:**
- Merged cell headers (skip carefully)
- Multiple tabs: Summary, Detail, Contacts
- May need to cross-reference Plan ID across sheets

#### Field Mapping

| Source Column | Target Field | Notes |
|--------------|--------------|-------|
| `Contract #` | `Plan_ID` | |
| `Plan Name` | `Plan_Name` | |
| `As of Date` | `Period_End_Date` | **REQUIRED** |
| `Plan Assets` | `Asset_Value` | |
| `Total Compensation` | `Earned_to_Date` | |
| `YTD Paid` | `Paid_to_Date` | |
| `Outstanding` | `Owe_This_Period` | |
| `Plan Status` | `Status` | |
| `# Participants` | `Participant_Count` | |

#### Contact Sheet Cross-Reference:
If `"Contacts"` sheet exists:
1. Read all rows keyed by `Contract #`
2. Match to main data by Plan_ID
3. Populate Contacts object

```javascript
async function parseEmpowerWorkbook(workbook) {
  const dataSheet = workbook.sheet("Plan Summary");
  const contactSheet = workbook.sheet("Contacts"); // if exists
  
  const contactMap = {};
  if (contactSheet) {
    contactSheet.rows.forEach(row => {
      contactMap[row['Contract #']] = {
        CSM: { Name: row['CSM Name'], Email: row['CSM Email'] },
        CRM: { Name: row['CRM Name'], Email: row['CRM Email'] }
      };
    });
  }
  
  return dataSheet.rows.map(row => ({
    Plan_ID: row['Contract #'],
    Plan_Name: row['Plan Name'],
    Record_Keeper: "Empower",
    Period_End_Date: parseDate(row['As of Date']),
    Asset_Value: parseCurrency(row['Plan Assets']),
    Earned_to_Date: parseCurrency(row['Total Compensation']),
    Paid_to_Date: parseCurrency(row['YTD Paid']),
    Owe_This_Period: parseCurrency(row['Outstanding']),
    Participant_Count: parseInt(row['# Participants']),
    Status: normalizeStatus(row['Plan Status']),
    Contacts: contactMap[row['Contract #']] || {}
  }));
}
```

---

### 6️⃣ Voya

**File format:** CSV  
**Typical filename:** `Voya_Quarterly_Report_QQ_YYYY.csv`  
**Key characteristics:**
- Simple flat structure
- Limited compensation detail
- Includes contract effective dates

#### Field Mapping

| Source Column | Target Field | Notes |
|--------------|--------------|-------|
| `Policy Number` | `Plan_ID` | |
| `Employer Name` | `Plan_Name` | |
| `Valuation Date` | `Period_End_Date` | **REQUIRED** |
| `Effective Date` | `Contract_Date` | |
| `Total Account Value` | `Asset_Value` | |
| `Participant Count` | `Participant_Count` | |
| `Revenue Earned` | `Earned_to_Date` | |
| `Status Code` | `Status` | Map: A=Active, D=Discontinued, T=Transferred |

#### Status Mapping:
```javascript
function normalizeVoyaStatus(code) {
  const map = {
    'A': 'Active',
    'D': 'Discontinued',
    'T': 'Transferred',
    'P': 'Active', // Pending = treat as Active
    'S': 'Discontinued' // Suspended
  };
  return map[code] || 'Unknown';
}
```

---

### 7️⃣ American Funds

**File format:** XLSX  
**Typical filename:** `American Funds – Premier Product.xlsx`  
**Sheet name:** `"Plans"` (single sheet)  
**Key characteristics:**
- **Complex header structure**: Report dates encoded in raw column names
- **Must capture dates BEFORE setting headers**
- Row 0 contains actual column headers
- Daily and Monthly as-of dates in columns 1 and 8

#### File Structure

**Raw column name encoding (before header row):**
- Column index 0: `"Daily as of"` (label)
- Column index 1: **Daily As-Of Date** (e.g., `"24/09/2025"`)
- Column index 7: `"Monthly as of"` (label)
- Column index 8: **Monthly As-Of Date** (e.g., `"31/08/2025"`)

**Row 0 (true headers):**
```
Plan Number, Plan Name, Owning group, Type, PPT count, Total assets, 
Avg assets/PPT, Cash flow, LIS, Part. rate, Cont. rate,
Client Service Manager Name, Client Service Manager Email Address, 
Client Service Manager Phone Number, Client Relationship Manager Name, 
Client Relationship Manager Email Address, Client Relationship Manager Phone Number,
Partner Advocate Name, Partner Advocate Email Address, Partner Advocate Phone Number
```

#### Parsing Steps (Execute in Order)

**Step 1: Capture Report Dates**
```javascript
async function parseAmericanFundsFile(file) {
  // Read workbook WITHOUT header interpretation
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const worksheet = workbook.Sheets['Plans'];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Capture dates from raw column names (row 0 in Excel = rawData[0])
  const dailyAsOfDateRaw = rawData[0][1];    // Column B (index 1)
  const monthlyAsOfDateRaw = rawData[0][8];  // Column I (index 8)
  
  console.log('📅 Raw dates from column headers:');
  console.log('  Daily:', dailyAsOfDateRaw);
  console.log('  Monthly:', monthlyAsOfDateRaw);
  
  // Parse to ISO dates
  const dailyAsOfDate = parseAmericanFundsDate(dailyAsOfDateRaw);
  const monthlyAsOfDate = parseAmericanFundsDate(monthlyAsOfDateRaw);
  
  // ... continue parsing
}

function parseAmericanFundsDate(dateStr) {
  if (!dateStr) return null;
  
  // Try DD/MM/YYYY format first (American Funds typical)
  const ddmmMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmMatch) {
    const [_, day, month, year] = ddmmMatch;
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  }
  
  // Try MM/DD/YYYY as fallback
  const mmddMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mmddMatch) {
    const [_, month, day, year] = mmddMatch;
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  console.warn(`⚠️ Could not parse American Funds date: ${dateStr}`);
  return null;
}
```

**Step 2: Set Headers & Extract Body**
```javascript
  // Row 1 (index 1 in rawData) contains true headers
  const headers = rawData[1];
  
  // Normalize header names
  const cleanHeaders = headers.map(h => 
    String(h).trim().replace(/\s+/g, ' ')
  );
  
  // Rows 2+ contain data
  const dataRows = rawData.slice(2).map(row => {
    const obj = {};
    cleanHeaders.forEach((header, idx) => {
      obj[header] = row[idx];
    });
    return obj;
  });
  
  console.log(`📊 Parsed ${dataRows.length} plan rows from American Funds file`);
```

**Step 3: Normalize Numeric Fields**
```javascript
  const normalizedRows = dataRows.map((row, rowIndex) => {
    // Skip totally empty rows
    if (!row['Plan Number'] && !row['Plan Name']) {
      console.log(`⏭️ Skipping empty row ${rowIndex + 3}`);
      return null;
    }
    
    return {
      // Identity
      planNumber: String(row['Plan Number'] || '').trim(),
      planName: String(row['Plan Name'] || '').trim(),
      
      // Demographics
      owningGroup: parseIntOrNull(row['Owning group']),
      type: String(row['Type'] || '').trim(),
      pptCount: parseIntOrNull(row['PPT count']),
      
      // Financial (remove commas, $, spaces)
      totalAssets: parseAmericanFundsCurrency(row['Total assets']),
      avgAssetsPerPpt: parseAmericanFundsCurrency(row['Avg assets/PPT']),
      cashFlow: parseAmericanFundsCurrency(row['Cash flow']),
      lisScore: parseAmericanFundsCurrency(row['LIS']),
      
      // Rates (convert to 0-1 decimals)
      participationRate: parseAmericanFundsRate(row['Part. rate']),
      contributionRate: parseAmericanFundsRate(row['Cont. rate']),
      
      // Contacts
      csmName: String(row['Client Service Manager Name'] || '').trim(),
      csmEmail: String(row['Client Service Manager Email Address'] || '').trim(),
      csmPhone: String(row['Client Service Manager Phone Number'] || '').trim(),
      
      crmName: String(row['Client Relationship Manager Name'] || '').trim(),
      crmEmail: String(row['Client Relationship Manager Email Address'] || '').trim(),
      crmPhone: String(row['Client Relationship Manager Phone Number'] || '').trim(),
      
      partnerAdvocateName: String(row['Partner Advocate Name'] || '').trim(),
      partnerAdvocateEmail: String(row['Partner Advocate Email Address'] || '').trim(),
      partnerAdvocatePhone: String(row['Partner Advocate Phone Number'] || '').trim(),
      
      // Report metadata
      dailyAsOfDate: dailyAsOfDate,
      monthlyAsOfDate: monthlyAsOfDate
    };
  }).filter(row => row !== null);
```

**Step 4: Helper Functions**
```javascript
function parseAmericanFundsCurrency(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  
  // Remove $, commas, spaces, %
  const cleaned = String(value).replace(/[$,\s%]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseAmericanFundsRate(value) {
  const num = parseAmericanFundsCurrency(value);
  if (num === null) return null;
  
  // If > 1, assume it's a percentage (e.g., 77.1 means 77.1%)
  if (num > 1) return num / 100;
  
  // Already a decimal (0-1)
  return num;
}

function parseIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseInt(String(value).replace(/[,\s]/g, ''));
  return isNaN(num) ? null : num;
}
```

#### Field Mapping to Common Dataset

| Source Column | Target Field | Type | Notes |
|--------------|--------------|------|-------|
| `Plan Number` | `Plan_ID` | string | Keep hyphens (e.g., "1361083-01") |
| `Plan Name` | `Plan_Name` | string | Trim whitespace |
| *Literal* | `Record_Keeper` | string | **"American Funds"** |
| Monthly As-Of Date | `Period_End_Date` | date | **REQUIRED** - From column 8 raw name |
| Daily As-Of Date | `Provenance.AsOf_Daily_Date` | date | From column 1 raw name |
| `Total assets` | `Asset_Value` | number | As of Monthly date |
| `Type` | `Plan_Type` | string | e.g., "401K" |
| `Owning group` | `Owning_Group` | integer | Often 0 |
| `PPT count` | `Participant_Count` | integer | |
| `Avg assets/PPT` | `Average_Assets_Per_Participant` | number | |
| `Cash flow` | `Net_Cash_Flow_Period` | number | For the Monthly period |
| `LIS` | (supplemental) | number | LIS Score - keep if needed |
| `Part. rate` | `Participation_Rate` | number | **Convert to 0-1 decimal** |
| `Cont. rate` | `Contribution_Rate` | number | **Convert to 0-1 decimal** |
| CSM Name/Email/Phone | `Contacts.Client_Service_Manager` | object | Full trio |
| CRM Name/Email/Phone | `Contacts.Client_Relationship_Manager` | object | Full trio |
| Partner Advocate Name/Email/Phone | `Contacts.Partner_Advocate` | object | Full trio |

**Fields NOT provided by American Funds (set to null):**
- `Contract_Date`
- `YE_Date`
- `Recurring_Assets`
- `Transfer_Assets`
- `Earned_to_Date`, `Paid_to_Date`, `Owe_This_Period`, `Waived_to_Date` (no compensation data)
- `Compensation_Type`

**Default values:**
- `Status`: `"Active"` (unless you add logic to infer otherwise)

#### Complete Mapping Function

```javascript
function mapAmericanFundsToCommonDataset(normalizedRow, fileName) {
  const warnings = [];
  
  // Validate required fields
  if (!normalizedRow.planNumber && !normalizedRow.planName) {
    warnings.push('RowDrop:MissingKey: Plan_ID and Plan_Name both empty');
    return null;
  }
  
  if (!normalizedRow.monthlyAsOfDate) {
    warnings.push('RowDrop:MissingPeriodEnd: Period_End_Date is required');
    return null;
  }
  
  // Build contacts object
  const contacts = {};
  
  if (normalizedRow.csmName || normalizedRow.csmEmail || normalizedRow.csmPhone) {
    contacts.Client_Service_Manager = {
      Name: normalizedRow.csmName || null,
      Email: normalizedRow.csmEmail || null,
      Phone: normalizedRow.csmPhone || null
    };
  }
  
  if (normalizedRow.crmName || normalizedRow.crmEmail || normalizedRow.crmPhone) {
    contacts.Client_Relationship_Manager = {
      Name: normalizedRow.crmName || null,
      Email: normalizedRow.crmEmail || null,
      Phone: normalizedRow.crmPhone || null
    };
  }
  
  if (normalizedRow.partnerAdvocateName || normalizedRow.partnerAdvocateEmail || normalizedRow.partnerAdvocatePhone) {
    contacts.Partner_Advocate = {
      Name: normalizedRow.partnerAdvocateName || null,
      Email: normalizedRow.partnerAdvocateEmail || null,
      Phone: normalizedRow.partnerAdvocatePhone || null
    };
  }
  
  // Validate rates are in 0-1 range
  if (normalizedRow.participationRate !== null && 
      (normalizedRow.participationRate < 0 || normalizedRow.participationRate > 1)) {
    warnings.push(`ParseWarning:Participation_Rate: rate outside 0-1 range (${normalizedRow.participationRate})`);
  }
  
  if (normalizedRow.contributionRate !== null && 
      (normalizedRow.contributionRate < 0 || normalizedRow.contributionRate > 1)) {
    warnings.push(`ParseWarning:Contribution_Rate: rate outside 0-1 range (${normalizedRow.contributionRate})`);
  }
  
  return {
    // Core identity
    Plan_ID: normalizedRow.planNumber,
    Plan_Name: normalizedRow.planName,
    Record_Keeper: "American Funds",
    Period_End_Date: normalizedRow.monthlyAsOfDate, // Anchors this snapshot
    
    // Dates (not provided)
    Contract_Date: null,
    YE_Date: null,
    
    // Assets
    Asset_Value: normalizedRow.totalAssets,
    Recurring_Assets: null, // Not provided
    Transfer_Assets: null,  // Not provided
    
    // Compensation (not provided by this report)
    Earned_to_Date: null,
    Paid_to_Date: null,
    Owe_This_Period: null,
    Waived_to_Date: null,
    Compensation_Type: null,
    
    // Status
    Status: "Active", // Default; override if you add status logic
    
    // Plan details
    Plan_Type: normalizedRow.type,
    Owning_Group: normalizedRow.owningGroup,
    Participant_Count: normalizedRow.pptCount,
    Average_Assets_Per_Participant: normalizedRow.avgAssetsPerPpt,
    Net_Cash_Flow_Period: normalizedRow.cashFlow,
    
    // Rates
    Participation_Rate: normalizedRow.participationRate,
    Contribution_Rate: normalizedRow.contributionRate,
    
    // Contacts
    Contacts: Object.keys(contacts).length > 0 ? contacts : null,
    
    // No compensation detail for American Funds
    CompensationDetail: [],
    
    // Provenance
    Provenance: {
      Source_File_Name: fileName,
      Source_Sheet_Name: "Plans",
      AsOf_Daily_Date: normalizedRow.dailyAsOfDate, // Auxiliary date
      Ingested_At: new Date().toISOString()
    },
    
    // Parsing metadata
    Parsing: {
      Warnings: warnings,
      Raw_Field_Map: {
        'Plan Number': 'Plan_ID',
        'Plan Name': 'Plan_Name',
        'Total assets': 'Asset_Value',
        'PPT count': 'Participant_Count',
        'Part. rate': 'Participation_Rate',
        'Cont. rate': 'Contribution_Rate',
        'Monthly as of (col 8)': 'Period_End_Date',
        'Daily as of (col 1)': 'Provenance.AsOf_Daily_Date'
      }
    }
  };
}
```

#### Example Mapping

**Source row (after normalization):**
```javascript
{
  planNumber: "1361083-01",
  planName: "Sun Sage LLC 401(k) Plan",
  type: "401K",
  pptCount: 73,
  totalAssets: 605956.21,
  avgAssetsPerPpt: 8300.77,
  cashFlow: 64544.57,
  lisScore: 77.1,
  participationRate: 0.1111,  // Converted from 11.11
  contributionRate: null,      // Blank in source
  monthlyAsOfDate: "2025-08-31",
  dailyAsOfDate: "2025-09-24"
}
```

**Target output (Common Dataset):**
```json
{
  "Plan_ID": "1361083-01",
  "Plan_Name": "Sun Sage LLC 401(k) Plan",
  "Record_Keeper": "American Funds",
  "Period_End_Date": "2025-08-31",
  
  "Asset_Value": 605956.21,
  "Plan_Type": "401K",
  "Participant_Count": 73,
  "Average_Assets_Per_Participant": 8300.77,
  "Net_Cash_Flow_Period": 64544.57,
  
  "Participation_Rate": 0.1111,
  "Contribution_Rate": null,
  
  "Status": "Active",
  
  "Provenance": {
    "Source_File_Name": "American Funds – Premier Product.xlsx",
    "Source_Sheet_Name": "Plans",
    "AsOf_Daily_Date": "2025-09-24",
    "Ingested_At": "2025-10-09T14:30:00.000Z"
  }
}
```

#### Validation Rules

**Required fields:**
- `Plan_ID` (Plan Number) **OR** `Plan_Name` must exist → else drop row
- `Period_End_Date` (Monthly As-Of Date) **MUST** exist → else drop entire file

**Duplicate handling:**
If multiple rows share same `Plan_ID` within same `Period_End_Date`:
- Keep **last occurrence** (last row wins)
- Log warning: `Dedup:PlanID: Duplicate plan {Plan_ID} at period {Period_End_Date}`

**Numeric validation:**
- `PPT count` must be integer (round if decimal appears)
- Rates must be 0–1 after conversion
- Currency fields strip `$`, `,`, spaces before parsing

**Date validation:**
- Try DD/MM/YYYY first, then MM/DD/YYYY
- If both fail → log `ParseWarning:ReportDate` and drop file (dates are critical)

#### Critical Implementation Notes

⚠️ **Header Capture Timing**: You MUST capture the Daily and Monthly dates from raw column names (indices 1 and 8) **BEFORE** you set row 0 as headers. Once you overwrite the column names with the header row, those date values are lost.

⚠️ **Date Format**: American Funds typically uses DD/MM/YYYY (e.g., 24/09/2025 = September 24, 2025). Don't assume MM/DD/YYYY.

⚠️ **Participation Rate**: Value like `11.11` in the file means 11.11% → store as `0.1111`. Value like `77.1` means 77.1% → store as `0.771`.

⚠️ **LIS Score**: This is a supplemental metric. If you need it, add a `LIS_Score` field to your extended schema. Otherwise it can be omitted from the common dataset.

⚠️ **No Compensation Data**: American Funds Premier Product report does NOT include compensation/fee information. All compensation fields will be `null`.

---

## Implementation Checklist

### File Upload Handler
- [ ] Accept `.csv`, `.xls`, `.xlsx` files
- [ ] Detect file type via extension
- [ ] Use appropriate parser:
  - CSV: Native `Papa Parse` or manual split
  - XLS/XLSX: Use `xlsx` npm package (`XLSX.read()`)

### Record Keeper Detection
- [ ] User selects RK before upload (current UI pattern)
- [ ] OR auto-detect from filename patterns
- [ ] OR detect from file headers (e.g., "John Hancock" in cell A1)

### Parsing Pipeline
```javascript
async function processFile(file, recordKeeper) {
  // 1. Parse file into raw rows
  const rawData = await parseFile(file);
  
  // 2. Detect/skip header rows
  const dataRows = detectDataRows(rawData, recordKeeper);
  
  // 3. Apply record-keeper-specific mapping
  const mappedData = dataRows.map(row => 
    mapRecordKeeperRow(row, recordKeeper, file.name)
  );
  
  // 4. Validate and collect warnings
  const validated = mappedData.map(record => 
    validatePlanPeriod(record)
  );
  
  // 5. Check for duplicates (idempotency)
  const deduplicated = await checkDuplicates(validated);
  
  // 6. Write to Firebase
  await batchWriteToFirebase(deduplicated);
  
  return {
    imported: deduplicated.length,
    warnings: validated.flatMap(v => v.Parsing.Warnings)
  };
}
```

### Validation Function
```javascript
function validatePlanPeriod(record) {
  const warnings = [];
  
  // CRITICAL: Period_End_Date must exist
  if (!record.Period_End_Date) {
    throw new Error('Missing required field: Period_End_Date');
  }
  
  // Plan identifier must exist
  if (!record.Plan_ID && !record.Plan_Name) {
    warnings.push('RowDrop:MissingKey: Plan_ID and Plan_Name both empty');
    return null; // Drop this record
  }
  
  // Validate date formats
  ['Period_End_Date', 'Contract_Date', 'YE_Date'].forEach(field => {
    if (record[field] && !isValidDate(record[field])) {
      warnings.push(`ParseWarning:${field}: could not parse '${record[field]}'`);
      record[field] = null;
    }
  });
  
  // Validate numeric fields
  ['Asset_Value', 'Participant_Count'].forEach(field => {
    if (record[field] !== null && isNaN(record[field])) {
      warnings.push(`ParseWarning:${field}: non-numeric value`);
      record[field] = null;
    }
  });
  
  // Ensure rates are 0–1
  ['Participation_Rate', 'Contribution_Rate'].forEach(field => {
    if (record[field] !== null && (record[field] < 0 || record[field] > 1)) {
      warnings.push(`ParseWarning:${field}: rate outside 0–1 range (${record[field]})`);
    }
  });
  
  record.Parsing = {
    Warnings: warnings,
    Raw_Field_Map: {} // Populate with source→target mapping
  };
  
  return record;
}
```

### Firebase Write (Idempotent)
```javascript
async function batchWriteToFirebase(records) {
  const updates = {};
  
  records.forEach(record => {
    // Generate composite key
    const key = generatePlanPeriodKey(
      record.Record_Keeper,
      record.Plan_ID,
      record.Period_End_Date
    );
    
    // Remove null fields to reduce payload
    const cleaned = removeNullFields(record);
    
    updates[`ers/plan_periods/${key}`] = cleaned;
  });
  
  await firebase.database().ref().update(updates);
  console.log(`✅ Wrote ${Object.keys(updates).length} plan periods to Firebase`);
}

function generatePlanPeriodKey(recordKeeper, planId, periodEnd) {
  const rkCode = recordKeeper.toLowerCase().replace(/\s+/g, '');
  const dateCode = periodEnd.replace(/-/g, '');
  const planCode = planId.replace(/[^a-zA-Z0-9]/g, '');
  return `${rkCode}_${planCode}_${dateCode}`;
}

function removeNullFields(obj) {
  const cleaned = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== null && obj[key] !== undefined) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        const nested = removeNullFields(obj[key]);
        if (Object.keys(nested).length > 0) {
          cleaned[key] = nested;
        }
      } else {
        cleaned[key] = obj[key];
      }
    }
  });
  return cleaned;
}
```

---

## Testing Strategy

### Unit Tests
```javascript
describe('Record Keeper Parsers', () => {
  test('Transamerica: Parse basis point fees', () => {
    const row = {
      'Contract ID': '12345',
      'Asset Value': '$1,000,000',
      'Asset Basis Point': '25'
    };
    const result = parseTransamericaRow(row);
    expect(result.CompensationDetail[0].Earned).toBe(2500); // 25 BPS of $1M
  });
  
  test('John Hancock: Normalize status codes', () => {
    expect(normalizeStatus('Active')).toBe('Active');
    expect(normalizeStatus('DISCONTINUED')).toBe('Discontinued');
    expect(normalizeStatus('Transfer Out')).toBe('Transferred');
  });
  
  test('Principal: Convert percentage rates', () => {
    expect(normalizePrincipalRate('77.1')).toBe(0.771);
    expect(normalizePrincipalRate('0.85')).toBe(0.85);
  });
});
```

### Integration Tests
```javascript
describe('Full Import Pipeline', () => {
  test('Import Transamerica CSV', async () => {
    const file = loadTestFile('transamerica_sample.csv');
    const result = await processFile(file, 'Transamerica');
    
    expect(result.imported).toBeGreaterThan(0);
    expect(result.warnings.length).toBe(0);
  });
  
  test('Handle duplicate imports (idempotency)', async () => {
    const file = loadTestFile('johnhancock_sample.xlsx');
    
    // First import
    await processFile(file, 'John Hancock');
    const count1 = await countFirebaseRecords('johnhancock');
    
    // Second import (same file)
    await processFile(file, 'John Hancock');
    const count2 = await countFirebaseRecords('johnhancock');
    
    expect(count1).toBe(count2); // Should replace, not duplicate
  });
});
```

---

## Error Handling

### File-Level Errors (Abort Import)
- File too large (>10MB)
- Cannot detect file format
- File is corrupt/unreadable
- No valid data rows found
- Missing critical headers (e.g., no period date column)

### Row-Level Errors (Skip Row, Continue)
- Missing `Period_End_Date` → Skip row, log warning
- Both `Plan_ID` and `Plan_Name` empty → Skip row
- Unparseable date → Set null, add warning, keep row
- Non-numeric currency → Set 0, add warning, keep row

### Warning Display
Show warnings in UI after validation:
```
⚠️ Import completed with 3 warnings:
  - Row 45: ParseWarning:Contract_Date: could not parse '13/24/2024'
  - Row 102: ParseWarning:Participation_Rate: rate outside 0–1 range (125.3)
  - Row 203: TPA Name missing
  
✅ 247 records validated and ready for import.
```

---

## Future Enhancements

### Automatic Record Keeper Detection
Use filename patterns or file content heuristics:
```javascript
function detectRecordKeeper(fileName, firstRow) {
  if (fileName.includes('Transamerica') || firstRow.includes('Contract ID')) {
    return 'Transamerica';
  }
  if (fileName.includes('JH') || fileName.includes('Hancock')) {
    return 'John Hancock';
  }
  // ... etc
  return null; // Require user selection
}
```

### Column Fuzzy Matching
Handle slight variations in column names:
```javascript
function findColumn(headers, possibleNames) {
  return headers.find(h => 
    possibleNames.some(name => 
      h.toLowerCase().includes(name.toLowerCase())
    )
  );
}

// Usage:
const planIdColumn = findColumn(headers, [
  'Plan ID', 'Plan Number', 'Account Number', 'Policy Number', 'Contract ID'
]);
```

### Historical Change Tracking
Store multiple versions when re-importing same plan/period:
```javascript
{
  "ers/plan_periods/johnhancock_12345_20241231": {
    "current": { /* latest import */ },
    "history": [
      { "imported_at": "2025-01-15T10:00:00Z", "data": { /* v1 */ } },
      { "imported_at": "2025-01-20T14:30:00Z", "data": { /* v2 */ } }
    ]
  }
}
```

---

## Quick Reference: Field Priority

When multiple sources provide similar data, use this priority:

**Plan Identification:**
1. `Plan_ID` (if structured/unique)
2. `Plan_Name` (if Plan_ID missing)

**Assets:**
1. `Total Assets` / `Market Value` → `Asset_Value`
2. `Recurring Assets` → `Recurring_Assets`
3. `Transfer Assets` / `Rollovers` → `Transfer_Assets`

**Compensation:**
1. Detailed breakdown → `CompensationDetail[]`
2. Rollup totals → `Earned_to_Date`, `Paid_to_Date`, `Owe_This_Period`

**Contacts:**
1. Structured columns (`CSM Name`, `CSM Email`) → Parse into object
2. Combined field (`"John Smith (john@ex.com)"`) → Parse with regex
3. Missing → Omit contact object

**Status:**
1. Explicit status field → Map to standard values
2. Missing → Default to `"Active"`

---

## Summary

This import system provides a **unified pipeline** for ingesting diverse record keeper data formats. By following the field mappings and parsing rules documented here, you ensure:

✅ **Consistency**: All data conforms to a single schema  
✅ **Completeness**: Provenance and warnings are always tracked  
✅ **Idempotency**: Re-importing the same data doesn't create duplicates  
✅ **Flexibility**: Missing fields don't break the import  

**Next Steps:**
1. Implement parser for highest-volume record keeper first (likely John Hancock or Transamerica)
2. Add unit tests for field mapping logic
3. Test with real sample files
4. Build UI preview to show mapped data before import
5. Add export function to download normalized data as JSON

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-09  
**Maintainer:** Executive Retirement Solutions Team
