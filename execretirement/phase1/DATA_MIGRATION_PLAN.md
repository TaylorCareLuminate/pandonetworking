# Data Migration Plan - Excel to Firebase

**Project:** Executive Retirement Plans - Revenue Tracking System  
**Version:** 1.0  
**Date:** January 2025  
**Status:** TEMPLATE - Awaiting Excel Files

---

## 📋 **Migration Overview**

### **Source Data**
| File | Status | Description | Est. Records |
|------|--------|-------------|--------------|
| Record Keeper Tracking.xlsx | ❌ Missing | Provider rates and rules | ~10 providers |
| New Rev Tracking Book.xlsx | ❌ Missing | Plan/client revenue data | ~150 plans |
| Other tracking files | ❓ Unknown | Additional data sources | Unknown |

### **Target Systems**
- **Firebase Realtime Database**: `/ers/revenue/*`
- **Cloud Firestore**: Analytics and audit collections
- **Backup Location**: Cloud Storage bucket

### **Migration Timeline**
- **Week 1**: Excel analysis and mapping (BLOCKED)
- **Week 2**: Build migration tools
- **Week 3**: Test migration in staging
- **Week 4**: Production migration

---

## 🔄 **Migration Process**

### **Phase 1: Data Analysis** (BLOCKED - Need Excel Files)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Excel Files    │────▶│    Analysis     │────▶│  Data Mapping   │
│  (Missing)      │     │   - Structure   │     │  Documentation  │
│                 │     │   - Quality     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### **Phase 2: Data Preparation**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Raw Excel      │────▶│  Normalization  │────▶│   Validation    │
│     Data        │     │  - Clean data   │     │  - Rules check  │
│                 │     │  - Standardize  │     │  - Duplicates   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### **Phase 3: Migration Execution**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Validated     │────▶│    Import to    │────▶│ Reconciliation  │
│     Data        │     │    Firebase     │     │   & Verify      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 📊 **Data Mapping Templates**

### **Provider Mapping (Record Keeper Tracking.xlsx)**
```javascript
// Expected Excel structure → Firebase mapping
{
  // Excel columns
  "Provider Name": "Transamerica",
  "Installation Payment": "0.20%",
  "1st Yr Deposits": "0.20%", 
  "Ongoing 5 bps": "0.05%",
  "Qualification Req": "None",
  "Other Notes": "Upfront bonus for 10 plans"
}

// Maps to Firebase structure
{
  "/ers/revenue/providers/PROV_TRANSAMERICA": {
    "providerId": "PROV_TRANSAMERICA",
    "name": "Transamerica",
    "status": "active"
  },
  "/ers/revenue/providerRules/PROV_TRANSAMERICA/RULE_001": {
    "installRateAssets": 0.0020,
    "installRateDeposits": 0.0020,
    "ongoingRateAssets": 0.0005,
    "ongoingRequiresBuiltIn": false,
    "qualificationNotes": "None",
    "notes": "Upfront bonus for 10 plans",
    "effectiveStart": "2024-01-01"
  }
}
```

### **Plan Data Mapping (New Rev Tracking Book.xlsx)**
```javascript
// Expected Excel structure
{
  "Plan Name": "ABC Corp 401(k)",
  "Provider": "Transamerica",
  "Admin": "Jane Smith",
  "Rep": "Joe",
  "Advisor": "John Doe",
  "Assets": "$3,100,000",
  "Flow": "$86,000",
  "Participants": "45",
  "5 bps Y/N": "Y",
  "Installation Y/N": "Y",
  "Document": "$500",
  "Admin": "$1,300",
  "Audit": "$0",
  "New Comp": "$0",
  "Participant Rate": "$5",
  "Consulting": "$0",
  "Projected Installation": "$6,372",
  "Ongoing 5 bps": "$1,550",
  "Total 1st Yr TPA": "$8,372",
  "2nd Year TPA": "$3,075"
}

// Maps to Firebase structure
{
  "/ers/revenue/plans/PLAN_001": {
    "planName": "ABC Corp 401(k)",
    "providerId": "PROV_TRANSAMERICA",
    "adminId": "ADMIN_JSMITH",
    "repId": "REP_JOE",
    "advisorId": "ADV_JDOE",
    "businessUnit": "DC",
    "status": "Active"
  },
  "/ers/revenue/planYears/PLAN_001/2024": {
    "assetsBasis": 3100000,
    "firstYearDeposits": 86000,
    "participants": 45,
    "bpsOngoingEligible": true,
    "installationPaymentEligible": true,
    "documentFee": 500,
    "adminBaseFee": 1300,
    "auditFee": 0,
    "newCompFee": 0,
    "participantRate": 5,
    "consultingFee": 0
  }
}
```

---

## 🔍 **Data Validation Rules**

### **Provider Validation**
```javascript
const providerValidation = {
  // Required fields
  required: ['Provider Name', 'Installation Payment', '1st Yr Deposits'],
  
  // Rate validation
  rates: {
    min: 0,
    max: 0.10, // 10% maximum
    format: /^\d+\.?\d{0,2}%?$/ // Accepts 0.20% or 0.20
  },
  
  // Name normalization
  nameRules: {
    maxLength: 100,
    normalize: (name) => {
      return name
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s\-&]/g, '');
    }
  }
};
```

### **Plan Data Validation**
```javascript
const planValidation = {
  // Required fields
  required: ['Plan Name', 'Provider', 'Assets', 'Participants'],
  
  // Money fields
  moneyFields: ['Assets', 'Flow', 'Document', 'Admin', 'Audit', 'New Comp', 'Consulting'],
  moneyFormat: /^\$?[\d,]+\.?\d{0,2}$/,
  
  // Yes/No fields
  booleanFields: ['5 bps Y/N', 'Installation Y/N'],
  booleanValues: ['Y', 'N', 'Yes', 'No', 'TRUE', 'FALSE'],
  
  // Business rules
  rules: [
    {
      name: 'Installation requires assets or deposits',
      check: (row) => {
        if (row['Installation Y/N'] === 'Y') {
          return row['Assets'] > 0 || row['Flow'] > 0;
        }
        return true;
      }
    },
    {
      name: 'Participant fee requires participants',
      check: (row) => {
        if (row['Participant Rate'] > 0) {
          return row['Participants'] > 0;
        }
        return true;
      }
    }
  ]
};
```

---

## 🛠️ **Migration Tools**

### **Excel Parser Module**
```javascript
// excel-parser.js
class ExcelParser {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  
  async parseFile(file) {
    const workbook = await this.readExcel(file);
    const sheets = this.extractSheets(workbook);
    const data = this.parseSheets(sheets);
    const validated = this.validateData(data);
    
    return {
      success: this.errors.length === 0,
      data: validated,
      errors: this.errors,
      warnings: this.warnings
    };
  }
  
  normalizeProviderName(name) {
    const mapping = {
      'Trans America': 'Transamerica',
      'John Hancock': 'John Hancock',
      'Empower': 'Empower',
      'American Funds': 'American Funds',
      'Voya': 'Voya',
      'T. Rowe Price': 'T Rowe Price',
      'T Rowe': 'T Rowe Price',
      'Principal': 'Principal'
    };
    
    return mapping[name] || name;
  }
  
  parseMoney(value) {
    if (!value) return 0;
    const cleaned = String(value).replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }
  
  parseRate(value) {
    if (!value) return 0;
    const cleaned = String(value).replace(/%/g, '');
    return parseFloat(cleaned) / 100; // Convert percentage to decimal
  }
  
  parseBoolean(value) {
    const positive = ['Y', 'Yes', 'TRUE', '1', true];
    return positive.includes(value);
  }
}
```

### **Migration UI Component**
```html
<!-- revenue-import.html -->
<div class="import-container">
  <!-- Step 1: Upload -->
  <div class="import-step" id="step-upload">
    <h3>Step 1: Upload Excel Files</h3>
    <div class="file-dropzone" id="dropzone">
      <i class="fas fa-cloud-upload fa-3x"></i>
      <p>Drag & drop Excel files here or click to browse</p>
      <input type="file" id="file-input" accept=".xlsx,.xls" multiple hidden>
    </div>
    <div class="file-list" id="file-list"></div>
  </div>
  
  <!-- Step 2: Validation -->
  <div class="import-step" id="step-validation" style="display:none;">
    <h3>Step 2: Data Validation</h3>
    <div class="validation-results">
      <div class="validation-summary">
        <div class="stat-card success">
          <span class="stat-value" id="valid-count">0</span>
          <span class="stat-label">Valid Records</span>
        </div>
        <div class="stat-card warning">
          <span class="stat-value" id="warning-count">0</span>
          <span class="stat-label">Warnings</span>
        </div>
        <div class="stat-card error">
          <span class="stat-value" id="error-count">0</span>
          <span class="stat-label">Errors</span>
        </div>
      </div>
      <div class="validation-details" id="validation-details"></div>
    </div>
  </div>
  
  <!-- Step 3: Preview -->
  <div class="import-step" id="step-preview" style="display:none;">
    <h3>Step 3: Import Preview</h3>
    <div class="preview-table-container">
      <table class="preview-table" id="preview-table"></table>
    </div>
    <div class="import-actions">
      <button class="btn btn-secondary" onclick="cancelImport()">Cancel</button>
      <button class="btn btn-primary" onclick="executeImport()">Import Data</button>
    </div>
  </div>
  
  <!-- Step 4: Results -->
  <div class="import-step" id="step-results" style="display:none;">
    <h3>Step 4: Import Results</h3>
    <div class="import-results">
      <div class="result-summary" id="result-summary"></div>
      <div class="reconciliation-report" id="reconciliation"></div>
      <div class="result-actions">
        <button class="btn btn-primary" onclick="downloadReport()">
          <i class="fas fa-download"></i> Download Report
        </button>
        <button class="btn btn-success" onclick="viewDashboard()">
          <i class="fas fa-dashboard"></i> View Dashboard
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 📊 **Reconciliation Process**

### **Reconciliation Report Template**
```javascript
{
  "summary": {
    "totalRecords": 150,
    "successfulImports": 148,
    "failedImports": 2,
    "dataQualityScore": 98.7,
    "timestamp": "2025-01-15T10:30:00Z"
  },
  
  "providers": {
    "imported": 7,
    "matched": 7,
    "new": 0,
    "conflicts": []
  },
  
  "plans": {
    "imported": 148,
    "matched": 145,
    "new": 3,
    "conflicts": [
      {
        "planName": "XYZ Corp 401k",
        "issue": "Duplicate plan name with different provider",
        "resolution": "Created as new plan with suffix"
      }
    ]
  },
  
  "calculations": {
    "totalVariance": 234.50,
    "withinTolerance": true,
    "details": [
      {
        "planName": "ABC Corp 401k",
        "field": "Projected Installation",
        "excelValue": 6372.00,
        "calculatedValue": 6372.00,
        "variance": 0.00,
        "status": "MATCH"
      },
      {
        "planName": "DEF Inc Retirement",
        "field": "Total 1st Yr TPA",
        "excelValue": 8500.00,
        "calculatedValue": 8499.50,
        "variance": 0.50,
        "status": "WITHIN_TOLERANCE"
      }
    ]
  },
  
  "warnings": [
    "3 plans have installation payment but no assets/deposits recorded",
    "5 plans missing advisor assignment",
    "2 providers have no qualification requirements documented"
  ],
  
  "recommendations": [
    "Review plans with missing advisor assignments",
    "Verify installation payment calculations for flagged plans",
    "Update provider qualification requirements"
  ]
}
```

---

## 🔄 **Rollback Strategy**

### **Backup Before Migration**
```javascript
async function createBackup() {
  const timestamp = new Date().toISOString();
  const backupId = `BACKUP_${timestamp}`;
  
  // Export current data
  const currentData = await exportAllRevenueData();
  
  // Save to Cloud Storage
  const backupPath = `backups/${backupId}/revenue_data.json`;
  await saveToCloudStorage(backupPath, currentData);
  
  // Record backup metadata
  await saveBackupMetadata({
    backupId,
    timestamp,
    path: backupPath,
    recordCount: currentData.length,
    createdBy: getCurrentUser()
  });
  
  return backupId;
}
```

### **Rollback Procedure**
```javascript
async function rollbackMigration(backupId) {
  // Confirm rollback
  if (!confirm('This will restore data to the pre-migration state. Continue?')) {
    return;
  }
  
  // Get backup data
  const backup = await loadBackup(backupId);
  
  // Clear current data
  await clearRevenueData();
  
  // Restore backup
  await restoreData(backup);
  
  // Create audit log
  await createAuditLog('ROLLBACK_MIGRATION', {
    backupId,
    reason: prompt('Reason for rollback:'),
    performedBy: getCurrentUser()
  });
  
  // Notify users
  showNotification('Migration rolled back successfully');
}
```

---

## 🧪 **Migration Testing**

### **Test Scenarios**

#### **Scenario 1: Clean Import**
- **Input**: Well-formatted Excel with all required fields
- **Expected**: 100% success rate, no warnings
- **Validation**: All calculations match Excel

#### **Scenario 2: Missing Data**
- **Input**: Excel with some missing optional fields
- **Expected**: Import succeeds with warnings
- **Validation**: Defaults applied correctly

#### **Scenario 3: Invalid Data**
- **Input**: Excel with invalid rates, negative amounts
- **Expected**: Validation errors, import blocked
- **Validation**: Clear error messages provided

#### **Scenario 4: Duplicate Detection**
- **Input**: Excel with duplicate plan names
- **Expected**: Duplicates flagged, user prompted
- **Validation**: Merge or create new handled correctly

#### **Scenario 5: Large Dataset**
- **Input**: 500+ records
- **Expected**: Import completes < 60 seconds
- **Validation**: No timeouts, progress shown

### **Test Data Generator**
```javascript
// generate-test-data.js
function generateTestExcel() {
  const providers = ['Transamerica', 'John Hancock', 'Voya', 'Principal'];
  const reps = ['Joe', 'Dean'];
  const admins = ['Jane Smith', 'Bob Johnson', 'Alice Brown'];
  
  const plans = [];
  
  for (let i = 1; i <= 100; i++) {
    plans.push({
      'Plan Name': `Test Company ${i} 401(k)`,
      'Provider': providers[i % providers.length],
      'Admin': admins[i % admins.length],
      'Rep': reps[i % reps.length],
      'Assets': Math.floor(Math.random() * 5000000) + 100000,
      'Flow': Math.floor(Math.random() * 100000) + 10000,
      'Participants': Math.floor(Math.random() * 200) + 10,
      '5 bps Y/N': i % 3 === 0 ? 'N' : 'Y',
      'Installation Y/N': i % 4 === 0 ? 'N' : 'Y',
      'Document': i % 2 === 0 ? 500 : 0,
      'Admin': 1300,
      'Participant Rate': 5
    });
  }
  
  return createExcelFile(plans);
}
```

---

## 📝 **Migration Checklist**

### **Pre-Migration**
- [ ] Excel files received from client
- [ ] Excel structure analyzed and documented
- [ ] Data mapping completed
- [ ] Validation rules defined
- [ ] Test environment prepared
- [ ] Backup procedures tested
- [ ] Rollback procedures tested
- [ ] Stakeholder approval obtained

### **Migration Day**
- [ ] Create full backup
- [ ] Notify users of maintenance window
- [ ] Run validation on production data
- [ ] Execute dry run
- [ ] Review dry run results
- [ ] Get final approval
- [ ] Execute production import
- [ ] Run reconciliation
- [ ] Verify calculations
- [ ] Test user access

### **Post-Migration**
- [ ] Generate reconciliation report
- [ ] Document any issues
- [ ] Update user training materials
- [ ] Schedule follow-up review
- [ ] Archive Excel files
- [ ] Monitor system performance
- [ ] Gather user feedback
- [ ] Plan optimization updates

---

## 🚨 **Risk Mitigation**

| Risk | Mitigation Strategy |
|------|-------------------|
| Data loss during migration | Complete backup before migration |
| Calculation discrepancies | Extensive validation and reconciliation |
| User confusion | Training and documentation |
| Performance degradation | Test with production-size data |
| Import failures | Retry logic and partial import capability |
| Duplicate data | Duplicate detection and merge logic |

---

## 📞 **Support Plan**

### **During Migration**
- Technical lead on-site
- Database admin on standby
- Client stakeholder available
- Support ticket system ready

### **Post-Migration**
- Daily check-ins for first week
- Dedicated support channel
- Quick response team for issues
- Regular performance monitoring

---

**Document Status:** TEMPLATE - Awaiting Excel Files  
**Next Update:** When Excel files are received  
**Last Updated:** January 2025


















