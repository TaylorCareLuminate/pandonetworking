# Principal Financial Parser - Technical Implementation Guide

## 🎯 Overview

The Principal Financial parser is the **most complex** in the Direct Import system due to:
- **Legacy .xls format** (may require conversion)
- **20+ column aliases per field** (extensive normalization required)
- **Pivoted month layouts** (wide format → long format melting)
- **Multi-tab merging** (combine Service Fees + Plan Listing)
- **Optional MEP aggregation** (parent/child relationships)

---

## 📊 File Structure

### Typical Files
- **Filename:** `Principals.xls` (legacy Excel format)
- **Format:** XLS (not XLSX)
- **Multiple Tabs:** Service Fee Summary, Plan Listing, Payment Detail, Transaction Fees, Adjustments

### Tab Detection Strategy

```javascript
function findPrincipalSheet(workbook, sheetType) {
  const fuzzyMatch = {
    'serviceFees': ['service fee summary', 'service fees', 'total fees', 'comp summary'],
    'planListing': ['plan listing', 'plan summary', 'contracts'],
    'paymentDetail': ['payment detail', 'monthly payments', 'tpa sfi'],
    'transactionFees': ['transaction fees'],
    'adjustments': ['adjustments', 'credits']
  };
  
  const targetPatterns = fuzzyMatch[sheetType] || [];
  
  for (const sheetName of workbook.SheetNames) {
    const normalized = sheetName.toLowerCase().trim();
    if (targetPatterns.some(pattern => normalized.includes(pattern))) {
      return sheetName;
    }
  }
  
  return null;
}
```

---

## 🗂️ Column Alias System

### Comprehensive Alias Dictionary

```javascript
const PRINCIPAL_COLUMN_ALIASES = {
  'Plan_ID': [
    'contract id', 'contract', 'plan number', 'plan #', 'contract_number'
  ],
  'Plan_Name': [
    'plan name', 'contract name', 'holder name', 'group name'
  ],
  'Period_End_Date': [
    'balance date', 'as of', 'as-of date', 'statement date', 
    'period end date', 'report date'
  ],
  'Contract_Date': [
    'effective date', 'contract effective date', 'start date'
  ],
  'YE_Date': [
    'plan ye', 'year end', 'plan year end'
  ],
  'Asset_Value': [
    'asset value', 'assets', 'current asset value', 'period assets', 'avg assets'
  ],
  'Asset_Basis_Points': [
    'asset basis point', 'asset bps', 'service fee %', 'service fee (bps)', 'asset fee bps'
  ],
  'Asset_Based_Fee': [
    'asset based fee', 'asset fee', 'service fee - asset', 'asset-based comp'
  ],
  'Deposit_Amount': [
    'deposit amount', 'deposits', 'payroll', 'contributions'
  ],
  'Deposit_Basis_Points': [
    'deposit basis point', 'deposit bps', 'fee % on deposits'
  ],
  'Deposit_Based_Fee': [
    'deposit based fee', 'deposit fee', 'service fee - deposit'
  ],
  'Total_Fee': [
    'total fee', 'total service fee', 'service fee income', 'total compensation'
  ],
  'Credits': [
    'credits', 'adjustments', 'waive amount'
  ],
  'TPA_Name': [
    'tpa name', 'third party administrator'
  ],
  'TPA_ID': [
    'tpa id', 'tpa number'
  ],
  'Status': [
    'discontinued', 'terminated', 'transferred', 'moved'
  ]
};

function normalizePrincipalHeader(header) {
  return String(header)
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .toLowerCase();
}

function mapPrincipalColumn(normalizedHeader) {
  for (const [target, aliasList] of Object.entries(PRINCIPAL_COLUMN_ALIASES)) {
    if (aliasList.includes(normalizedHeader)) {
      return target;
    }
  }
  return null; // Unknown column
}
```

---

## 🔄 Pivot Detection & Melting

### Month Column Detection

```javascript
function detectPivotColumns(headers) {
  const monthPatterns = [
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]?\d{2,4}$/i,
    /^\d{4}[-/]\d{2}$/,
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i
  ];
  
  const pivotColumns = [];
  
  headers.forEach((header, idx) => {
    const normalized = String(header).trim();
    if (monthPatterns.some(pattern => pattern.test(normalized))) {
      pivotColumns.push({ 
        index: idx, 
        monthLabel: normalized,
        parsedDate: parseMonthLabel(normalized)
      });
    }
  });
  
  return pivotColumns.length > 0 ? pivotColumns : null;
}

function parseMonthLabel(label) {
  // "Aug-2025" → "2025-08-31"
  // "2025/08" → "2025-08-31"
  // "August 2025" → "2025-08-31"
  
  const monthMap = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
  };
  
  // Pattern 1: "Aug-2025" or "Aug 2025"
  const pattern1 = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[-\s]?(\d{2,4})$/i;
  let match = label.match(pattern1);
  if (match) {
    const month = monthMap[match[1].toLowerCase()];
    let year = parseInt(match[2]);
    if (year < 100) year += 2000; // 25 → 2025
    return getLastDayOfMonth(year, month);
  }
  
  // Pattern 2: "2025/08" or "2025-08"
  const pattern2 = /^(\d{4})[-/](\d{2})$/;
  match = label.match(pattern2);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    return getLastDayOfMonth(year, month);
  }
  
  return null;
}

function getLastDayOfMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
```

### Melting Pivoted Data

```javascript
function meltPrincipalPivot(rawData, headers, pivotColumns, normalizedHeaders) {
  // Pivoted layout: rows are metrics, columns are months
  // Example:
  //   Plan_ID | Plan_Name | Metric             | Aug-2025 | Sep-2025 | Oct-2025
  //   12345   | ABC Plan  | Asset-Based Fee    | 1500.00  | 1550.00  | 1600.00
  //   12345   | ABC Plan  | Deposit-Based Fee  | 250.00   | 275.00   | 300.00
  
  const melted = [];
  
  const planIdIdx = findColumnIndex(normalizedHeaders, 'Plan_ID');
  const planNameIdx = findColumnIndex(normalizedHeaders, 'Plan_Name');
  const metricIdx = findColumnIndex(normalizedHeaders, 'Metric') || 
                     findColumnIndex(normalizedHeaders, 'Fee Type');
  
  rawData.forEach(row => {
    const planId = row[planIdIdx];
    const planName = row[planNameIdx];
    const metric = row[metricIdx] || 'Unknown';
    
    // Skip header and empty rows
    if (!planId || planId === 'Plan_ID') return;
    
    pivotColumns.forEach(col => {
      const value = row[col.index];
      
      melted.push({
        Plan_ID: planId,
        Plan_Name: planName,
        Metric: metric,
        Period_End_Date: col.parsedDate,
        Value: parsePrincipalCurrency(value)
      });
    });
  });
  
  return melted;
}

function pivotToNormalizedRecords(meltedData) {
  // Group by (Plan_ID, Period_End_Date)
  const grouped = {};
  
  meltedData.forEach(row => {
    const key = `${row.Plan_ID}_${row.Period_End_Date}`;
    
    if (!grouped[key]) {
      grouped[key] = {
        Plan_ID: row.Plan_ID,
        Plan_Name: row.Plan_Name,
        Period_End_Date: row.Period_End_Date
      };
    }
    
    // Map metric to field
    const metricNormalized = row.Metric.toLowerCase().trim();
    if (metricNormalized.includes('asset') && metricNormalized.includes('fee')) {
      grouped[key].Asset_Based_Fee = row.Value;
    } else if (metricNormalized.includes('deposit') && metricNormalized.includes('fee')) {
      grouped[key].Deposit_Based_Fee = row.Value;
    } else if (metricNormalized.includes('total')) {
      grouped[key].Total_Fee = row.Value;
    }
  });
  
  return Object.values(grouped);
}
```

---

## 🔀 Multi-Tab Merging

### Merge Strategy

```javascript
function mergePrincipalTabs(serviceFeeData, planListingData, paymentDetailData) {
  const merged = {};
  
  // Helper to add/merge record
  function mergeRecord(record) {
    const key = `${record.Plan_ID}_${record.Period_End_Date}`;
    
    if (!merged[key]) {
      merged[key] = { ...record };
    } else {
      // Merge: prefer non-null values
      Object.keys(record).forEach(field => {
        if (record[field] !== null && record[field] !== undefined) {
          if (merged[key][field] === null || merged[key][field] === undefined) {
            merged[key][field] = record[field];
          } else if (field === 'Provenance' || field === 'Supplemental') {
            // Deep merge objects
            merged[key][field] = { ...merged[key][field], ...record[field] };
          }
        }
      });
    }
  }
  
  // Process each tab
  [serviceFeeData, planListingData, paymentDetailData].forEach(tabData => {
    if (tabData) {
      tabData.forEach(record => mergeRecord(record));
    }
  });
  
  return Object.values(merged);
}
```

---

## 💰 CompensationDetail Builder

```javascript
function buildPrincipalCompensationDetail(row) {
  const detail = [];
  
  // Asset-Based Fee
  if (row.Asset_Based_Fee !== null && row.Asset_Based_Fee !== undefined) {
    detail.push({
      Type: "Asset-Based Fee",
      SubType: null,
      Earned: row.Asset_Based_Fee,
      Paid: row.Asset_Based_Fee, // Unless separate paid column exists
      Owe: null,
      Waived: null,
      Notes: [
        row.Asset_Basis_Points ? `Asset_Basis_Points=${row.Asset_Basis_Points}` : null,
        row.Asset_Value ? `Asset_Value=${row.Asset_Value}` : null
      ].filter(Boolean).join('; ')
    });
  }
  
  // Deposit-Based Fee
  if (row.Deposit_Based_Fee !== null && row.Deposit_Based_Fee !== undefined) {
    detail.push({
      Type: "Deposit-Based Fee",
      SubType: null,
      Earned: row.Deposit_Based_Fee,
      Paid: row.Deposit_Based_Fee,
      Owe: null,
      Waived: null,
      Notes: [
        row.Deposit_Basis_Points ? `Deposit_Basis_Points=${row.Deposit_Basis_Points}` : null,
        row.Deposit_Amount ? `Deposit_Amount=${row.Deposit_Amount}` : null
      ].filter(Boolean).join('; ')
    });
  }
  
  // If only Total Fee provided (no split)
  if (detail.length === 0 && row.Total_Fee !== null && row.Total_Fee !== undefined) {
    detail.push({
      Type: "Total Service Fee",
      SubType: null,
      Earned: row.Total_Fee,
      Paid: row.Total_Fee,
      Owe: null,
      Waived: null,
      Notes: "Period total compensation"
    });
  }
  
  return detail;
}
```

---

## 🏢 MEP Detection & Aggregation

```javascript
function detectPrincipalMEPs(records) {
  // Strategy 1: Look for "MEP" in Plan_Name
  const mepPatterns = ['MEP', 'Multiple Employer Plan', 'Multi-Employer'];
  
  const mepGroups = {};
  const regularPlans = [];
  
  records.forEach(record => {
    const isMEP = mepPatterns.some(pattern => 
      record.Plan_Name.toUpperCase().includes(pattern.toUpperCase())
    );
    
    if (isMEP) {
      // Extract MEP master ID (before any dash or "adopter" suffix)
      const mepMasterId = record.Plan_ID.split('-')[0];
      
      if (!mepGroups[mepMasterId]) {
        mepGroups[mepMasterId] = {
          master: null,
          children: []
        };
      }
      
      // Determine if master or child
      if (record.Plan_Name.toLowerCase().includes('master')) {
        mepGroups[mepMasterId].master = record;
      } else {
        mepGroups[mepMasterId].children.push(record);
      }
    } else {
      regularPlans.push(record);
    }
  });
  
  return { mepGroups, regularPlans };
}

function aggregatePrincipalMEPs(mepGroups) {
  const aggregated = [];
  
  Object.entries(mepGroups).forEach(([masterId, group]) => {
    if (group.children.length === 0) {
      // No children, just a regular plan
      if (group.master) aggregated.push(group.master);
      return;
    }
    
    // Create parent roll-up
    const parent = group.master || {
      Plan_ID: `${masterId}-MEP-MASTER`,
      Plan_Name: `Principal MEP (${masterId})`,
      Record_Keeper: "Principal",
      Period_End_Date: group.children[0].Period_End_Date
    };
    
    // Aggregate financial fields
    parent.Asset_Value = group.children.reduce((sum, child) => 
      sum + (child.Asset_Value || 0), 0
    );
    
    parent.Total_Fee = group.children.reduce((sum, child) => {
      const childTotal = child.Total_Fee || 
        (child.Asset_Based_Fee || 0) + (child.Deposit_Based_Fee || 0);
      return sum + childTotal;
    }, 0);
    
    parent.Is_MEP = true;
    parent.MEP_Participants_Count = group.children.length;
    parent.Children = group.children;
    
    // Build aggregate CompensationDetail
    parent.CompensationDetail = [{
      Type: "Total Service Fee",
      SubType: "MEP Aggregate",
      Earned: parent.Total_Fee,
      Paid: parent.Total_Fee,
      Owe: null,
      Waived: null,
      Notes: `Aggregated from ${group.children.length} adopting employers`
    }];
    
    aggregated.push(parent);
  });
  
  return aggregated;
}
```

---

## 🧪 Complete Parser Implementation

```javascript
async parsePrincipal(file) {
  console.log('🏦 Parsing Principal file...');
  
  const warnings = [];
  
  // Step 1: Read workbook
  const fileBuffer = await file.arrayBuffer();
  let workbook;
  
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (error) {
    throw new Error('Unable to read .xls file. Please convert to .xlsx format and try again.');
  }
  
  // Step 2: Find relevant sheets
  const serviceFeeSheet = findPrincipalSheet(workbook, 'serviceFees');
  const planListingSheet = findPrincipalSheet(workbook, 'planListing');
  
  if (!serviceFeeSheet && !planListingSheet) {
    throw new Error('No recognizable sheets found (expected Service Fee Summary or Plan Listing)');
  }
  
  const allRecords = [];
  
  // Step 3: Parse each sheet
  if (serviceFeeSheet) {
    const sheetData = workbook.Sheets[serviceFeeSheet];
    const rawData = XLSX.utils.sheet_to_json(sheetData, { header: 1 });
    
    // Detect pivot layout
    const headers = rawData[0];
    const normalizedHeaders = headers.map(h => normalizePrincipalHeader(h));
    const pivotColumns = detectPivotColumns(headers);
    
    if (pivotColumns) {
      // Melt pivoted data
      const melted = meltPrincipalPivot(rawData.slice(1), headers, pivotColumns, normalizedHeaders);
      const normalized = pivotToNormalizedRecords(melted);
      allRecords.push(...normalized.map(row => 
        mapPrincipalToCommonDataset(row, serviceFeeSheet, file.name, warnings)
      ));
    } else {
      // Regular table layout
      const records = parseStandardPrincipalSheet(rawData, normalizedHeaders, serviceFeeSheet, file.name, warnings);
      allRecords.push(...records);
    }
  }
  
  if (planListingSheet) {
    const sheetData = workbook.Sheets[planListingSheet];
    const rawData = XLSX.utils.sheet_to_json(sheetData, { header: 1 });
    const headers = rawData[0];
    const normalizedHeaders = headers.map(h => normalizePrincipalHeader(h));
    const records = parseStandardPrincipalSheet(rawData, normalizedHeaders, planListingSheet, file.name, warnings);
    allRecords.push(...records);
  }
  
  // Step 4: Merge multi-tab data
  const merged = mergePrincipalTabsByKey(allRecords);
  
  // Step 5: Handle MEPs
  const { mepGroups, regularPlans } = detectPrincipalMEPs(merged);
  const aggregatedMEPs = aggregatePrincipalMEPs(mepGroups);
  
  const finalRecords = [...regularPlans, ...aggregatedMEPs];
  
  console.log(`✅ Parsed ${finalRecords.length} Principal records`);
  if (warnings.length > 0) {
    console.warn(`⚠️ ${warnings.length} warnings encountered`);
  }
  
  return finalRecords;
}
```

---

## 🎯 Testing Checklist

### File Handling
- [ ] Read .xls format (gracefully fail with conversion prompt)
- [ ] Read .xlsx format (if converted)
- [ ] Handle multiple sheets
- [ ] Fuzzy match sheet names

### Column Mapping
- [ ] Apply all 20+ aliases per field
- [ ] Normalize headers (trim, collapse spaces, lowercase)
- [ ] Handle missing columns (null values)

### Pivot Detection
- [ ] Detect month patterns (3 regex variations)
- [ ] Parse month labels to ISO dates
- [ ] Melt wide → long format
- [ ] Group melted data by Plan_ID + Period

### Data Parsing
- [ ] Currency fields (strip $, commas, handle negatives)
- [ ] Date fields (multiple formats)
- [ ] YE_Date (MM/DD only, infer year)
- [ ] Basis points (store as decimals)

### Multi-Tab Merging
- [ ] Merge by (Plan_ID, Period_End_Date)
- [ ] Prefer non-null values
- [ ] Deep merge nested objects

### CompensationDetail
- [ ] Build Asset + Deposit entries (if split)
- [ ] Or single Total Fee entry (if not split)
- [ ] Include basis points in Notes

### MEP Aggregation
- [ ] Detect MEP patterns
- [ ] Create parent record
- [ ] Sum child assets and fees
- [ ] Link children to parent

### Edge Cases
- [ ] Single-tab file
- [ ] Missing Period_End_Date (use parameter)
- [ ] Only Total Fee (no asset/deposit split)
- [ ] Pivoted layout
- [ ] Status flags (discontinued/transferred)
- [ ] Cumulative vs period values

---

## 📋 Summary

**Principal Financial is the most complex parser** due to:
1. **20+ column aliases** requiring extensive normalization
2. **Pivot detection** and melting for wide-format layouts
3. **Multi-tab merging** with intelligent conflict resolution
4. **MEP aggregation** for parent/child relationships
5. **Legacy .xls format** requiring conversion or special handling

**Recommended implementation order:**
1. Build column alias system first
2. Add pivot detection next
3. Implement multi-tab merging
4. Add MEP handling last (optional feature)

**Estimated complexity:** 800-1000 lines of JavaScript

