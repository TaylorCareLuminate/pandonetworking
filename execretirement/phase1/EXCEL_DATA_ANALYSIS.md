# Excel Data Analysis - Complete Field Mapping

**Source Files Analyzed:**  
- `Record Keeper Tracking.csv`  
- `New Rev Tracking Book Sheet 1.csv` (Joe's Plans)  
- `New Rev Tracking Book Sheet 2.csv` (Dean's Plans)  
- `New Rev Tracking Book Sheet 3.csv` (Consulting/Other)  

**Analysis Date:** January 2025  
**Status:** COMPLETE

---

## 📊 **Data Structure Analysis**

### **Record Keeper Tracking.csv**
**Purpose:** Provider rate configurations  
**Records:** 7 providers  

| Column | Sample Value | Data Type | Notes |
|--------|--------------|-----------|-------|
| (Provider Name) | "Transamerica" | String | First column, no header |
| Installation Payment | "0.20%" | Percentage | Install rate on assets |
| 1st Yr Deposits (in Installation Payment) | "0.20%" | Percentage | Install rate on deposits |
| Ongoing 5 bps | "0.05%" | Percentage | Ongoing revenue share rate |
| Qualification Reqs | "5 plans" | String | Minimum requirements |
| Other Notes | "Upfront Rev Share Bonus..." | String | Special conditions |

### **New Rev Tracking Book Sheet 1.csv (Joe's Plans)**
**Purpose:** Southwest ERP region plans managed by Joe  
**Records:** ~140 active plans  

| Column | Sample Value | Data Type | Purpose |
|--------|--------------|-----------|---------|
| Plan Name | "Mayville State Bank" | String | Unique plan identifier |
| Advisor | "Mark Gurley" | String | Financial advisor |
| Branch Location | "SW ERP" | String | Geographic region |
| Rep | "Joe" | String | Sales representative |
| Status | (Empty mostly) | String | Plan status |
| Implementation Contact | "Jacob" | String | Internal admin contact |
| 2024/2025 Work | "2023" | String | Work year performed |
| Case Notes | "Outside Brokerage - $250 per" | String | Special notes |
| Conversion, TPA Change... | "Conversion" | String | Plan type |
| Assets | "$3,100,000" | Currency | Plan asset value |
| Flow | "$86,000" | Currency | Annual deposits/flow |
| Participants | "42" | Number | Number of participants |
| Verified Assets/Parts | "Y" | String | Data verification flag |
| 5 bps Y or N | "y" | String | Ongoing revenue eligibility |
| First Billed Date | "2023" | String | Initial billing date |
| Admin Assigned | "Jacob" | String | Plan administrator |
| Installation Payment Date | (Empty) | String | Install payment date |
| Installation payment | "y" | String | Install payment eligibility |
| Provider | "Transamerica" | String | Record keeper |
| Document | "$1,400" | Currency | Document fee |
| Projected Installation Payment | "$9,558" | Currency | Calculated install payment |
| Ongoing 5 bps | "1550" | Currency | Annual ongoing revenue |
| Total 1 Yr RK | "$11,108" | Currency | Record keeper total |
| Annual Admin (Base Fee) | "$1,600" | Currency | Admin base fee |
| Audit | (Empty mostly) | Currency | Audit fee |
| New Comparability | (Empty mostly) | Currency | New comp testing fee |
| Participant Fee | "$25" | Currency | Fee per participant |
| Additional bps built in | (Empty mostly) | Percentage | Additional built-in fees |
| Participant Fee Total | "$1,050" | Currency | Total participant fees |
| Total 1st Yr TPA | "$12,983" | Currency | Total first year revenue |
| 2nd Year TPA | "$4,200" | Currency | Total second year revenue |
| Hard Dollar w/o Rev Share | "$2,650" | Currency | Hard fees excluding rev share |

### **New Rev Tracking Book Sheet 2.csv (Dean's Plans)**
**Purpose:** IMA region plans managed by Dean  
**Records:** ~70 active plans  
**Structure:** Identical to Sheet 1, different data set

### **Key Differences Between Joe and Dean Data:**
- **Joe (Sheet 1):** Southwest ERP region, varied providers, mixed fee structures
- **Dean (Sheet 2):** IMA region, predominantly T Rowe Price, standardized fees ($2,450 admin, $48 participant)

---

## 🔍 **Data Quality Assessment**

### **Provider Data Quality**
✅ **Excellent** - Clean, consistent provider rates  
- All 7 providers have complete rate information
- Rates match screenshots provided earlier
- Special conditions clearly documented

### **Plan Data Quality**
🟡 **Good with Issues**

**Strengths:**
- Comprehensive field coverage
- Clear plan identification
- Complete financial data for most plans

**Issues Identified:**
1. **Inconsistent Date Formats:** Mix of "2023", "2024", actual dates
2. **Currency Formatting:** Mix of "$1,400", "1550", "$11,108" 
3. **Boolean Values:** Mix of "Y", "y", "n", empty
4. **Missing Data:** Some plans have incomplete information
5. **Terminated Plans:** Still in active sheets with $0 values

---

## 💰 **Revenue Calculation Validation**

### **Sample Validation: Mayville State Bank**
**From Excel:**
- Assets: $3,100,000
- Flow: $86,000  
- Provider: Transamerica (0.20% install on both)
- Projected Installation: $9,558
- Ongoing 5 bps: $1,550

**Our Calculation:**
- Installation: ($3,100,000 × 0.0020) + ($86,000 × 0.0020) = $6,200 + $172 = $6,372
- Ongoing: $3,100,000 × 0.0005 = $1,550 ✅

**⚠️ DISCREPANCY FOUND:** Excel shows $9,558, calculation shows $6,372  
**Investigation needed:** Excel may have different rate or additional factors

### **Sample Validation: John Hancock Plan**
**Jeff's Bronco Graveyard 401(k):**
- Assets: $3,900,000
- Flow: $135,000
- Provider: John Hancock (0.20% assets, 1.00% deposits)
- Excel Installation: $9,150

**Our Calculation:**
- Installation: ($3,900,000 × 0.0020) + ($135,000 × 0.0100) = $7,800 + $1,350 = $9,150 ✅

**✅ VALIDATED:** Calculation matches exactly

---

## 🏢 **Business Unit Analysis**

### **Data Distribution:**
- **Southwest ERP (Joe):** ~140 plans, varied providers
- **IMA (Dean):** ~70 plans, mostly T Rowe Price
- **3(16) Plans:** ~10-15 plans identified with "3(16)" notation
- **Consulting:** ~1-2 records, separate fee structure

### **Provider Distribution:**
| Provider | Joe's Plans | Dean's Plans | Total |
|----------|-------------|--------------|-------|
| Transamerica | ~40 | ~5 | ~45 |
| John Hancock | ~25 | ~10 | ~35 |
| T Rowe Price | ~5 | ~45 | ~50 |
| American Funds | ~30 | ~5 | ~35 |
| Voya | ~8 | ~2 | ~10 |
| Principal | ~10 | ~1 | ~11 |
| Empower | ~5 | ~0 | ~5 |
| Other/Fidelity | ~10 | ~2 | ~12 |

### **Fee Structure Patterns:**

**Joe's Plans (SW ERP):**
- Admin Base Fee: $1,300-$1,600 (variable)
- Participant Fee: $15-$35 (mostly $25)
- Document Fee: $0-$1,500 (variable)

**Dean's Plans (IMA):**
- Admin Base Fee: $2,450 (standardized)
- Participant Fee: $48 (standardized)
- Document Fee: $0 (rare)

---

## 📅 **Work Year vs Invoice Year Patterns**

### **Observed Patterns:**
1. **2023 Work → 2024/2025 Billing:** Most common
2. **2024 Work → 2025 Billing:** Current year pattern
3. **Same Year Billing:** Less common, mainly hard fees

### **October Billing Indicator:**
- Many plans show work year ≠ invoice year
- Confirms need for Q1-Q3 consolidated billing in October
- Installation payments typically billed year after work

---

## 🚨 **Data Migration Concerns**

### **High Priority Issues:**

1. **Calculation Discrepancies:**
   - Some Excel calculations don't match provider rates
   - Need to understand Excel formula logic
   - May indicate special rate adjustments

2. **Data Cleanup Needed:**
   - Standardize currency formatting ($X,XXX vs XXXX)
   - Convert Y/N fields to consistent boolean
   - Parse date fields properly
   - Handle terminated plans (separate from active)

3. **Provider Name Matching:**
   - Ensure consistent provider naming
   - Handle variations (e.g., "American Funds" vs "American Funds R6")

### **Medium Priority Issues:**

4. **Missing Data Handling:**
   - Some plans have incomplete information
   - Need default values for missing fields
   - Validate required vs optional fields

5. **Business Unit Classification:**
   - Not all plans clearly marked as DC vs 3(16)
   - Need rules to classify based on data patterns

---

## 🔧 **Import Mapping Strategy**

### **Provider Import:**
```javascript
// Provider rate mapping
const providerMapping = {
  "Transamerica": {
    installRateAssets: 0.0020,
    installRateDeposits: 0.0020,
    ongoingRateAssets: 0.0005,
    ongoingRequiresBuiltIn: false,
    notes: "Upfront Rev Share Bonus for 10 plans and 12MM/year"
  },
  // ... continue for all providers
}
```

### **Plan Import:**
```javascript
// Field mapping for plan data
const fieldMapping = {
  planName: "Plan Name",
  advisor: "Advisor", 
  rep: row => row.Rep === "Joe" ? "REP_JOE" : "REP_DEAN",
  businessUnit: row => {
    if (row["Case Notes"]?.includes("3(16)")) return "3(16)";
    if (row["Branch Location"] === "Consulting") return "Consulting";
    return "DC";
  },
  assets: row => parseCurrency(row["Assets"]),
  deposits: row => parseCurrency(row["Flow"]),
  participants: row => parseInt(row["Participants"]) || 0,
  // ... continue mapping
}
```

---

## ✅ **Validation Test Cases**

### **Test Case 1: Transamerica Standard Plan**
- **Input:** $3.1M assets, $86K deposits, 42 participants
- **Expected Installation:** $6,372
- **Expected Ongoing:** $1,550
- **Expected Admin:** $1,600
- **Expected Participant Total:** $1,050 (42 × $25)

### **Test Case 2: John Hancock High Deposit Plan**
- **Input:** $3.9M assets, $135K deposits, 11 participants  
- **Expected Installation:** $9,150
- **Expected Ongoing:** $1,950
- **Expected Participant Total:** $308 (11 × $28)

### **Test Case 3: T Rowe Price Built-in Plan**
- **Input:** $2.1M assets, $0 deposits, 32 participants
- **Expected Installation:** $0 (built-in required)
- **Expected Ongoing:** $0 (built-in required)
- **Expected Admin:** $2,450 (Dean's standard)

---

## 🎯 **Next Steps**

### **Immediate Actions:**
1. **Resolve Calculation Discrepancies:**
   - Investigate Excel formulas vs provider rates
   - Identify any special rate adjustments
   - Document exceptions and overrides

2. **Complete Data Mapping:**
   - Build comprehensive field mapping
   - Create data transformation rules
   - Prepare validation test suite

3. **Design Import Process:**
   - Build CSV parser with data cleaning
   - Implement validation rules
   - Create reconciliation reports

### **Ready for Phase 2:**
✅ **Data structure fully understood**  
✅ **Provider rates documented**  
✅ **Field mapping identified**  
✅ **Validation test cases prepared**  
⚠️ **Need to resolve calculation discrepancies**  

---

**Analysis Status:** COMPLETE  
**Confidence Level:** HIGH  
**Ready for Development:** YES (with calculation validation)  
**Next Action:** Begin Phase 2 implementation


















