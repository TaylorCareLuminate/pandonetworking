# Technical Specifications - Revenue Tracking System

**Project:** Executive Retirement Plans - Customer Revenue Tracking  
**Version:** 1.0  
**Date:** January 2025  
**Environment:** Firebase (healthcareitdatabase) + Netlify

---

## 🏗️ **System Architecture**

### **Technology Stack**
- **Frontend:** Static HTML/JavaScript hosted on Netlify
- **Backend:** Firebase Services
  - Firebase Realtime Database (existing)
  - Cloud Firestore (new)
  - Cloud Functions (Node.js 20)
  - Firebase Authentication (existing)
  - Cloud Storage (for backups/imports)
- **Libraries:**
  - Firebase SDK v10.7.0 (existing)
  - Chart.js (existing, for analytics)
  - XLSX (new, for Excel import)
  - date-fns (existing, for date handling)

### **Architecture Diagram**
```
┌─────────────────────────────────────────────────────────┐
│                    Netlify CDN                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Static HTML/JS/CSS Files               │  │
│  │  - revenue-dashboard.html                        │  │
│  │  - providers.html                                │  │
│  │  - plan-revenue.html                             │  │
│  │  - revenue-import.html                           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Firebase Services                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Firebase Authentication                │  │
│  │         (Existing - No modifications)            │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Firebase Realtime Database               │  │
│  │    /ers/revenue/* (New revenue data)             │  │
│  │    /ers/clients/* (Existing)                     │  │
│  │    /ers/advisors/* (Existing)                    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │             Cloud Firestore                      │  │
│  │    - Complex queries                             │  │
│  │    - Analytics aggregation                       │  │
│  │    - Audit logs                                  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Cloud Functions                       │  │
│  │    - Calculation engine                          │  │
│  │    - Data synchronization                        │  │
│  │    - October billing scheduler                   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 **Frontend Specifications**

### **Common Components**

#### **Revenue Navigation Module**
```javascript
// revenue-nav.js
class RevenueNavigation {
  constructor() {
    this.menuItems = [
      { path: '/revenue-dashboard.html', label: 'Dashboard', icon: 'fa-dashboard' },
      { path: '/providers.html', label: 'Providers', icon: 'fa-building' },
      { path: '/plan-revenue.html', label: 'Plans', icon: 'fa-file-invoice' },
      { path: '/revenue-import.html', label: 'Import', icon: 'fa-upload' },
      { path: '/revenue-analytics.html', label: 'Analytics', icon: 'fa-chart-bar' }
    ];
  }
  
  inject() {
    // Adds revenue dropdown to existing header
  }
}
```

#### **Money Formatting Utilities**
```javascript
// money-utils.js
const MoneyUtils = {
  // Convert dollars to cents for storage
  dollarsToCents: (dollars) => Math.round(dollars * 100),
  
  // Convert cents to dollars for display
  centsToDollars: (cents) => cents / 100,
  
  // Format for display
  formatMoney: (cents) => {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(dollars);
  },
  
  // Parse user input
  parseMoney: (input) => {
    const cleaned = input.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  }
};
```

#### **Calculation Engine**
```javascript
// calculations.js
class RevenueCalculator {
  calculateInstallation(assets, deposits, rateAssets, rateDeposits) {
    return (assets * rateAssets) + (deposits * rateDeposits);
  }
  
  calculateOngoing(assets, rate, isBuiltIn) {
    if (isBuiltIn) return 0;
    return assets * rate;
  }
  
  calculateFirstYearTPA(charges) {
    return charges.reduce((sum, charge) => {
      if (charge.workYear === charge.invoiceYear) {
        return sum + charge.amount;
      }
      return sum;
    }, 0);
  }
  
  calculateSecondYearTPA(charges) {
    // Excludes installation and document fees
    const recurringTypes = ['ADMIN_BASE', 'AUDIT', 'NEW_COMP', 'PARTICIPANT', 'ONGOING_BPS'];
    return charges
      .filter(c => recurringTypes.includes(c.serviceType))
      .reduce((sum, c) => sum + c.amount, 0);
  }
}
```

### **Page Specifications**

#### **1. Revenue Dashboard (revenue-dashboard.html)**
```html
<!-- Key Sections -->
<div class="dashboard-grid">
  <!-- KPI Cards -->
  <div class="kpi-card">
    <h3>Total Revenue YTD</h3>
    <div class="kpi-value">$X,XXX,XXX</div>
    <div class="kpi-change">+X% from last year</div>
  </div>
  
  <!-- Provider Revenue Chart -->
  <div class="chart-container">
    <canvas id="providerRevenueChart"></canvas>
  </div>
  
  <!-- Work Year vs Invoice Year Grid -->
  <div class="comparison-grid">
    <table id="workVsInvoiceTable"></table>
  </div>
  
  <!-- Joe vs Dean Comparison -->
  <div class="rep-comparison">
    <div class="rep-metrics" data-rep="joe"></div>
    <div class="rep-metrics" data-rep="dean"></div>
  </div>
</div>
```

#### **2. Provider Management (providers.html)**
```javascript
// Provider management functionality
class ProviderManager {
  async loadProviders() {
    const snapshot = await firebase.database()
      .ref('/ers/revenue/providers')
      .once('value');
    return snapshot.val();
  }
  
  async saveProviderRule(providerId, rule) {
    // Validate rates
    if (rule.installRateAssets < 0 || rule.installRateAssets > 1) {
      throw new Error('Invalid installation rate');
    }
    
    // Save to database
    const ruleId = `RULE_${Date.now()}`;
    await firebase.database()
      .ref(`/ers/revenue/providerRules/${providerId}/${ruleId}`)
      .set(rule);
    
    // Create audit log
    await this.createAuditLog('CREATE_RULE', providerId, rule);
  }
}
```

#### **3. Plan Revenue Detail (plan-revenue.html)**
```javascript
// Plan detail view
class PlanRevenueDetail {
  constructor(planId) {
    this.planId = planId;
    this.currentYear = new Date().getFullYear();
  }
  
  async loadPlanData() {
    // Load plan master data
    const plan = await this.loadPlan();
    
    // Load year data
    const yearData = await this.loadYearData(this.currentYear);
    
    // Load charges
    const charges = await this.loadCharges(this.currentYear);
    
    // Calculate totals
    const totals = this.calculateTotals(yearData, charges);
    
    return { plan, yearData, charges, totals };
  }
  
  enableOverride(chargeId) {
    // Show override modal
    const modal = new OverrideModal(chargeId);
    modal.onSave = async (overrideAmount, reason) => {
      await this.saveOverride(chargeId, overrideAmount, reason);
      await this.createAuditLog('OVERRIDE_CHARGE', chargeId, {
        amount: overrideAmount,
        reason: reason
      });
    };
    modal.show();
  }
}
```

#### **4. Revenue Import (revenue-import.html)**
```javascript
// Excel import handler
class RevenueImporter {
  constructor() {
    this.XLSX = null; // Lazy load XLSX library
  }
  
  async handleFileUpload(file) {
    // Load XLSX library if not loaded
    if (!this.XLSX) {
      this.XLSX = await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    }
    
    // Parse Excel file
    const data = await this.parseExcel(file);
    
    // Validate data
    const validation = this.validateData(data);
    if (!validation.isValid) {
      this.showValidationErrors(validation.errors);
      return;
    }
    
    // Show dry run preview
    const preview = this.generatePreview(data);
    this.showPreview(preview);
    
    // On confirm, import data
    if (await this.confirmImport()) {
      await this.importData(data);
      await this.generateReconciliation(data);
    }
  }
  
  validateData(data) {
    const errors = [];
    
    // Check required fields
    data.forEach((row, index) => {
      if (!row['Plan Name']) {
        errors.push(`Row ${index + 2}: Missing Plan Name`);
      }
      if (!row['Provider']) {
        errors.push(`Row ${index + 2}: Missing Provider`);
      }
      // Validate money fields
      if (isNaN(parseFloat(row['Assets']))) {
        errors.push(`Row ${index + 2}: Invalid Assets value`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}
```

---

## ⚙️ **Backend Specifications**

### **Cloud Functions**

#### **Function: calculateCharges**
```javascript
// functions/src/calculateCharges.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.calculateCharges = functions.database
  .ref('/ers/revenue/planYears/{planId}/{year}')
  .onWrite(async (change, context) => {
    const { planId, year } = context.params;
    const yearData = change.after.val();
    
    if (!yearData) return; // Deleted
    
    // Get provider rules
    const plan = await admin.database()
      .ref(`/ers/revenue/plans/${planId}`)
      .once('value');
    const providerId = plan.val().providerId;
    
    const rules = await getProviderRules(providerId, year);
    
    // Calculate charges
    const charges = [];
    
    // Installation payment
    if (yearData.installationPaymentEligible) {
      const installAmount = calculateInstallation(
        yearData.assetsBasis,
        yearData.firstYearDeposits,
        rules.installRateAssets,
        rules.installRateDeposits
      );
      
      charges.push({
        chargeId: `CHG_INSTALL_${year}`,
        serviceType: 'INSTALLATION',
        calculatedAmount: installAmount,
        workYear: year,
        invoiceYear: year + 1 // Default to next year
      });
    }
    
    // Ongoing BPS
    if (yearData.bpsOngoingEligible && !rules.ongoingRequiresBuiltIn) {
      const ongoingAmount = yearData.assetsBasis * rules.ongoingRateAssets;
      
      charges.push({
        chargeId: `CHG_ONGOING_${year}`,
        serviceType: 'ONGOING_BPS',
        calculatedAmount: ongoingAmount,
        workYear: year,
        invoiceYear: year
      });
    }
    
    // Hard dollar fees
    const hardDollarFees = [
      { type: 'DOCUMENT', amount: yearData.documentFee },
      { type: 'ADMIN_BASE', amount: yearData.adminBaseFee },
      { type: 'AUDIT', amount: yearData.auditFee },
      { type: 'NEW_COMP', amount: yearData.newCompFee },
      { type: 'CONSULTING', amount: yearData.consultingFee }
    ];
    
    hardDollarFees.forEach(fee => {
      if (fee.amount > 0) {
        charges.push({
          chargeId: `CHG_${fee.type}_${year}`,
          serviceType: fee.type,
          calculatedAmount: fee.amount,
          workYear: year,
          invoiceYear: year
        });
      }
    });
    
    // Participant fees
    if (yearData.participants > 0 && yearData.participantRate > 0) {
      charges.push({
        chargeId: `CHG_PARTICIPANT_${year}`,
        serviceType: 'PARTICIPANT',
        calculatedAmount: yearData.participants * yearData.participantRate,
        workYear: year,
        invoiceYear: year
      });
    }
    
    // Save charges
    const batch = {};
    charges.forEach(charge => {
      batch[`/ers/revenue/charges/${planId}/${year}/${charge.chargeId}`] = charge;
    });
    
    await admin.database().ref().update(batch);
    
    // Update aggregates
    await updateAggregates(planId, year);
  });
```

#### **Function: octoberBilling**
```javascript
// functions/src/octoberBilling.js
exports.octoberBilling = functions.pubsub
  .schedule('0 0 1 10 *') // October 1st at midnight
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const currentYear = new Date().getFullYear();
    
    // Find all unbilled Q1-Q3 charges
    const unbilledCharges = await findUnbilledCharges(currentYear);
    
    // Group by plan
    const planCharges = groupByPlan(unbilledCharges);
    
    // Create consolidated invoices
    for (const [planId, charges] of Object.entries(planCharges)) {
      const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0);
      
      // Create invoice record
      await createInvoice({
        planId,
        invoiceDate: new Date().toISOString(),
        type: 'Q1_Q3_CONSOLIDATED',
        amount: totalAmount,
        charges: charges.map(c => c.chargeId)
      });
      
      // Mark charges as invoiced
      await markChargesInvoiced(charges);
    }
    
    console.log(`Processed ${Object.keys(planCharges).length} October invoices`);
  });
```

#### **Function: updateAggregates**
```javascript
// functions/src/updateAggregates.js
exports.updateAggregates = functions.database
  .ref('/ers/revenue/charges/{planId}/{year}/{chargeId}')
  .onWrite(async (change, context) => {
    const { planId, year } = context.params;
    
    // Get plan details
    const plan = await getPlan(planId);
    
    // Update provider aggregates
    await updateProviderAggregate(plan.providerId, year);
    
    // Update admin aggregates
    await updateAdminAggregate(plan.adminId, year);
    
    // Update rep aggregates
    await updateRepAggregate(plan.repId, year);
    
    // Update business unit aggregates
    await updateBusinessUnitAggregate(plan.businessUnit, year);
    
    // Update Firestore analytics
    await updateFirestoreAnalytics(year);
  });

async function updateProviderAggregate(providerId, year) {
  // Get all plans for this provider
  const plans = await getPlansForProvider(providerId);
  
  let totals = {
    installationRevenue: 0,
    ongoingRevenue: 0,
    hardDollarRevenue: 0,
    planCount: 0
  };
  
  for (const plan of plans) {
    const charges = await getChargesForPlan(plan.planId, year);
    
    charges.forEach(charge => {
      if (charge.serviceType === 'INSTALLATION') {
        totals.installationRevenue += charge.amount;
      } else if (charge.serviceType === 'ONGOING_BPS') {
        totals.ongoingRevenue += charge.amount;
      } else {
        totals.hardDollarRevenue += charge.amount;
      }
    });
    
    totals.planCount++;
  }
  
  // Save aggregate
  await admin.database()
    .ref(`/ers/revenue/aggregates/byProvider/${providerId}/${year}`)
    .set({
      ...totals,
      totalRevenue: totals.installationRevenue + totals.ongoingRevenue + totals.hardDollarRevenue,
      lastUpdated: admin.database.ServerValue.TIMESTAMP
    });
}
```

---

## 🔒 **Security Specifications**

### **Authentication Requirements**
- All pages require Firebase Authentication
- Email verification required
- Admin functions restricted to @healthluminate.com and @careluminate.com domains

### **Data Validation**
```javascript
// Validation rules
const ValidationRules = {
  money: {
    min: 0,
    max: 999999999, // $9,999,999.99
    precision: 2
  },
  
  rates: {
    min: 0,
    max: 0.10, // 10% maximum
    precision: 4 // 0.0001 = 1 basis point
  },
  
  participants: {
    min: 0,
    max: 99999
  },
  
  planName: {
    minLength: 3,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-\(\)&]+$/
  }
};
```

### **Audit Logging**
```javascript
// Audit log for all financial changes
async function createAuditLog(action, entity, changes) {
  const log = {
    timestamp: new Date().toISOString(),
    userId: getCurrentUser().email,
    action: action,
    entity: entity,
    changes: changes,
    ipAddress: getUserIP(),
    userAgent: navigator.userAgent
  };
  
  await firestore.collection('auditLogs').add(log);
}
```

---

## 🚀 **Deployment Specifications**

### **Environment Variables**
```bash
# .env.production
FIREBASE_API_KEY=AIzaSyBpsxZCSULnandhpdVLI9nvsxd3_BH4dfs
FIREBASE_AUTH_DOMAIN=healthcareitdatabase.firebaseapp.com
FIREBASE_DATABASE_URL=https://healthcareitdatabase-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=healthcareitdatabase
FIREBASE_STORAGE_BUCKET=healthcareitdatabase.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=1024935247661
FIREBASE_APP_ID=1:1024935247661:web:a74be5c7b9df74245bdda4
```

### **Build Process**
```json
// package.json
{
  "scripts": {
    "build": "webpack --mode production",
    "deploy:functions": "firebase deploy --only functions",
    "deploy:hosting": "netlify deploy --prod",
    "deploy:rules": "firebase deploy --only database,firestore",
    "test": "jest",
    "test:functions": "firebase emulators:exec 'npm test'"
  }
}
```

### **CI/CD Pipeline**
```yaml
# .github/workflows/deploy.yml
name: Deploy Revenue System
on:
  push:
    branches: [main]
    paths:
      - 'execretirement/**'
      - 'functions/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm test
      
  deploy-functions:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g firebase-tools
      - run: firebase deploy --only functions --token ${{ secrets.FIREBASE_TOKEN }}
      
  deploy-hosting:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm run build
      - uses: netlify/actions/cli@master
        with:
          args: deploy --prod
```

---

## 📊 **Performance Specifications**

### **Performance Targets**
- Page load: < 2 seconds
- Dashboard refresh: < 1 second
- Excel import (100 records): < 30 seconds
- Calculation update: < 500ms
- Search/filter: < 200ms

### **Optimization Strategies**
1. **Caching**: Use local storage for provider rules and aggregates
2. **Pagination**: Limit results to 50 records per page
3. **Lazy Loading**: Load charts and analytics on demand
4. **Debouncing**: Delay search/filter operations by 300ms
5. **Batch Operations**: Group database writes

### **Monitoring**
```javascript
// Performance monitoring
window.addEventListener('load', () => {
  const perfData = performance.getEntriesByType('navigation')[0];
  
  analytics.track('page_performance', {
    page: window.location.pathname,
    loadTime: perfData.loadEventEnd - perfData.fetchStart,
    domReady: perfData.domContentLoadedEventEnd - perfData.fetchStart,
    resourceCount: performance.getEntriesByType('resource').length
  });
});
```

---

## 🧪 **Testing Specifications**

### **Unit Tests**
```javascript
// tests/calculations.test.js
describe('Revenue Calculations', () => {
  test('Installation payment calculation', () => {
    const assets = 3100000;
    const deposits = 86000;
    const rateAssets = 0.0020;
    const rateDeposits = 0.0020;
    
    const result = calculateInstallation(assets, deposits, rateAssets, rateDeposits);
    
    expect(result).toBe(6372);
  });
  
  test('Ongoing BPS with built-in flag', () => {
    const assets = 3100000;
    const rate = 0.0005;
    const isBuiltIn = true;
    
    const result = calculateOngoing(assets, rate, isBuiltIn);
    
    expect(result).toBe(0);
  });
});
```

### **Integration Tests**
```javascript
// tests/integration/import.test.js
describe('Excel Import', () => {
  test('Import provider rules', async () => {
    const file = await loadTestFile('test-providers.xlsx');
    const importer = new RevenueImporter();
    
    const result = await importer.importProviders(file);
    
    expect(result.success).toBe(true);
    expect(result.imported).toBe(7);
    expect(result.errors).toHaveLength(0);
  });
});
```

### **E2E Tests**
```javascript
// tests/e2e/revenue-flow.test.js
describe('Revenue Tracking Flow', () => {
  test('Create plan and verify calculations', async () => {
    // Create plan
    await page.goto('/plan-revenue.html');
    await page.click('#create-plan');
    await page.fill('#plan-name', 'Test Plan 401k');
    await page.select('#provider', 'PROV_TRANSAMERICA');
    await page.fill('#assets', '3100000');
    await page.fill('#deposits', '86000');
    await page.click('#save');
    
    // Verify calculations
    await page.waitForSelector('.installation-amount');
    const installation = await page.textContent('.installation-amount');
    expect(installation).toBe('$6,372.00');
  });
});
```

---

## 📝 **Documentation Requirements**

### **Code Documentation**
```javascript
/**
 * Calculate installation payment for a plan
 * @param {number} assets - Plan assets in dollars
 * @param {number} deposits - First year deposits in dollars
 * @param {number} rateAssets - Installation rate for assets (decimal)
 * @param {number} rateDeposits - Installation rate for deposits (decimal)
 * @returns {number} Installation payment in dollars
 * @throws {Error} If rates are invalid
 */
function calculateInstallation(assets, deposits, rateAssets, rateDeposits) {
  // Implementation
}
```

### **API Documentation**
- Use JSDoc for all public functions
- Document Firebase database paths
- Include example requests/responses
- Maintain changelog for API changes

### **User Documentation**
- Step-by-step guides for common tasks
- Video tutorials for complex features
- FAQ section for troubleshooting
- Release notes for updates

---

**Document Status:** COMPLETE  
**Next Steps:** Review with development team  
**Last Updated:** January 2025


















