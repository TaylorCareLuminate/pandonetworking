# Database Schema Design - Revenue Tracking System

**Project:** Executive Retirement Plans - Customer Revenue Tracking  
**Version:** 1.0  
**Date:** January 2025  
**Status:** READY FOR REVIEW

---

## 📊 **Database Architecture Overview**

### **Hybrid Database Strategy**

We will use a hybrid approach leveraging both Firebase Realtime Database and Cloud Firestore:

**Firebase Realtime Database** (existing - path: `/ers/`)
- Maintains existing data (agencies, advisors, clients, proposals)
- Adds new revenue tracking under `/ers/revenue/`
- Best for: Real-time updates, simple queries, existing integrations

**Cloud Firestore** (new)
- Complex revenue analytics and aggregations
- Historical data and audit logs
- Best for: Complex queries, aggregations, reporting

---

## 🗂️ **Firebase Realtime Database Schema**

### **Existing Structure (No Changes)**
```
/ers
  /agencies          # Existing agency data
  /advisors          # Existing advisor data
  /clients           # Existing client data
  /proposals         # Existing proposal data
```

### **New Revenue Structure**
```
/ers/revenue
  /providers
    /{providerId}
      - providerId: string
      - name: string
      - status: "active" | "inactive"
      - createdAt: timestamp
      - updatedAt: timestamp
      
  /providerRules
    /{providerId}
      /{ruleId}
        - ruleId: string
        - installRateAssets: number (0.0020 = 0.20%)
        - installRateDeposits: number
        - ongoingRateAssets: number | null
        - ongoingRequiresBuiltIn: boolean
        - qualificationNotes: string
        - notes: string
        - effectiveStart: string (ISO date)
        - effectiveEnd: string | null
        - priority: number
        
  /plans
    /{planId}
      - planId: string (auto-generated)
      - planName: string
      - clientId: string (reference to /ers/clients)
      - providerId: string
      - advisorId: string (reference to /ers/advisors)
      - repId: "REP_JOE" | "REP_DEAN"
      - adminId: string
      - businessUnit: "DC" | "3(16)" | "Consulting"
      - status: "Active" | "Onboarding" | "Terminated"
      - terminationDate: string | null
      - planType: "Conversion" | "TPA Change" | "Startup" | "Solo"
      - firstBilledDate: string | null
      - implementationContact: string
      - notes: string
      - createdAt: timestamp
      - updatedAt: timestamp
      
  /planYears
    /{planId}
      /{year}
        - year: number (2024, 2025, etc.)
        - assetsBasis: number (dollars, not cents for Realtime DB)
        - firstYearDeposits: number
        - participants: number
        - bpsOngoingEligible: boolean
        - installationPaymentEligible: boolean
        - installPaymentDate: string | null
        - recognitionModel: "CASH" | "ACCRUAL" | "PRORATED"
        # Hard dollar fees
        - documentFee: number
        - adminBaseFee: number
        - auditFee: number
        - newCompFee: number
        - participantRate: number
        - consultingFee: number
        # Calculated fields (cached)
        - totalFirstYearTPA: number
        - totalSecondYearTPA: number
        - projectedInstallation: number
        - ongoingRevenue: number
        
  /charges
    /{planId}
      /{year}
        /{chargeId}
          - chargeId: string
          - serviceType: string
          - calculatedAmount: number
          - overrideAmount: number | null
          - overrideReason: string | null
          - invoiced: boolean
          - invoiceDate: string | null
          - workYear: number
          - invoiceYear: number
          - notes: string
          
  /aggregates
    /byProvider
      /{providerId}
        /{year}
          - totalRevenue: number
          - installationRevenue: number
          - ongoingRevenue: number
          - hardDollarRevenue: number
          - planCount: number
          - lastUpdated: timestamp
          
    /byAdmin
      /{adminId}
        /{year}
          - totalClients: number
          - totalParticipants: number
          - totalRevenue: number
          - avgRevenuePerClient: number
          - lastUpdated: timestamp
          
    /byRep
      /{repId}
        /{year}
          - documentFees: number
          - projectedInstallation: number
          - totalFirstYearTPA: number
          - totalSecondYearTPA: number
          - ongoingRevenue: number
          - avgRevenuePerPlan: number
          - clientCount: number
          - lastUpdated: timestamp
          
    /byBusinessUnit
      /{businessUnit}
        /{year}
          - totalRevenue: number
          - planCount: number
          - avgRevenuePerPlan: number
          - totalParticipants: number
          - lastUpdated: timestamp
```

---

## 🔥 **Cloud Firestore Schema**

### **Collections for Complex Queries**

#### **providers Collection**
```javascript
{
  // Document ID: PROV_TRANSAMERICA
  name: "Transamerica",
  normalizedName: "transamerica",
  status: "active",
  currentRules: {
    installRateAssets: 0.0020,
    installRateDeposits: 0.0020,
    ongoingRateAssets: 0.0005,
    ongoingRequiresBuiltIn: false,
    qualificationNotes: "None",
    effectiveDate: "2024-01-01"
  },
  metadata: {
    createdAt: Timestamp,
    updatedAt: Timestamp,
    createdBy: "user@email.com"
  }
}
```

#### **providerRulesHistory Subcollection**
```javascript
providers/{providerId}/rulesHistory/{ruleId}
{
  ruleId: "RULE_20240101",
  installRateAssets: 0.0020,
  installRateDeposits: 0.0020,
  ongoingRateAssets: 0.0005,
  ongoingRequiresBuiltIn: false,
  effectiveStart: "2024-01-01",
  effectiveEnd: null,
  notes: "Initial rates",
  createdAt: Timestamp,
  createdBy: "user@email.com"
}
```

#### **revenueAnalytics Collection**
```javascript
{
  // Document ID: 2024_Q1
  period: "2024_Q1",
  year: 2024,
  quarter: 1,
  metrics: {
    totalRevenue: 1250000,
    installationRevenue: 450000,
    ongoingRevenue: 300000,
    hardDollarRevenue: 500000,
    
    byProvider: {
      "PROV_TRANSAMERICA": {
        revenue: 250000,
        planCount: 15
      },
      // ... other providers
    },
    
    byBusinessUnit: {
      "DC": {
        revenue: 900000,
        planCount: 45
      },
      "3(16)": {
        revenue: 350000,
        planCount: 12
      }
    },
    
    workYearVsInvoiceYear: {
      currentYearWork: 950000,
      priorYearWork: 300000
    }
  },
  generatedAt: Timestamp
}
```

#### **auditLogs Collection**
```javascript
{
  // Document ID: Auto-generated
  timestamp: Timestamp,
  userId: "user@email.com",
  action: "OVERRIDE_CHARGE",
  entityType: "charge",
  entityId: "CHG_12345",
  changes: {
    field: "calculatedAmount",
    oldValue: 5000,
    newValue: 5500,
    reason: "Negotiated rate adjustment"
  },
  metadata: {
    userAgent: "...",
    ipAddress: "...",
    sessionId: "..."
  }
}
```

#### **migrationHistory Collection**
```javascript
{
  // Document ID: MIGRATION_20250115_1
  migrationId: "MIGRATION_20250115_1",
  timestamp: Timestamp,
  type: "EXCEL_IMPORT",
  source: "Record Keeper Tracking.xlsx",
  status: "COMPLETED",
  stats: {
    totalRecords: 150,
    successful: 148,
    failed: 2,
    skipped: 0
  },
  reconciliation: {
    totalVariance: 234.50,
    withinTolerance: true,
    details: [...]
  },
  performedBy: "user@email.com",
  rollbackAvailable: true,
  backupLocation: "gs://bucket/backups/..."
}
```

---

## 🔐 **Security Rules**

### **Firebase Realtime Database Rules**
```json
{
  "rules": {
    "ers": {
      ".read": "auth != null && auth.token.email_verified == true",
      
      "revenue": {
        ".read": "auth != null && auth.token.email_verified == true",
        ".write": "auth != null && auth.token.email_verified == true",
        
        "aggregates": {
          ".read": "auth != null",
          ".write": false
        }
      }
    }
  }
}
```

### **Cloud Firestore Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             request.auth.token.email.matches('.*@(healthluminate|careluminate)\\.com');
    }
    
    // Providers - read all, write admin only
    match /providers/{document=**} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    
    // Revenue Analytics - read only
    match /revenueAnalytics/{document=**} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Audit Logs - admin read only, no direct writes
    match /auditLogs/{document=**} {
      allow read: if isAdmin();
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Migration History - admin only
    match /migrationHistory/{document=**} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
  }
}
```

---

## 🔄 **Data Synchronization Strategy**

### **Real-time to Firestore Sync**
- Cloud Function triggers on Realtime Database writes
- Updates Firestore collections for analytics
- Maintains eventual consistency

### **Aggregation Updates**
- Triggered by changes to plans, charges, or costs
- Batch updates every 5 minutes for performance
- Immediate updates for critical changes

### **Caching Strategy**
```javascript
// Cache configuration
const cacheConfig = {
  aggregates: {
    ttl: 300, // 5 minutes
    staleWhileRevalidate: true
  },
  providerRules: {
    ttl: 3600, // 1 hour
    staleWhileRevalidate: true
  },
  analytics: {
    ttl: 900, // 15 minutes
    staleWhileRevalidate: true
  }
};
```

---

## 📈 **Indexing Strategy**

### **Firebase Realtime Database Indexes**
```json
{
  "ers": {
    "revenue": {
      "plans": {
        ".indexOn": ["clientId", "providerId", "advisorId", "status", "businessUnit"]
      },
      "planYears": {
        ".indexOn": ["year", "planId"]
      },
      "charges": {
        ".indexOn": ["planId", "year", "serviceType", "invoiced"]
      }
    }
  }
}
```

### **Cloud Firestore Indexes**
```json
{
  "indexes": [
    {
      "collectionGroup": "providers",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "name", "order": "ASCENDING"}
      ]
    },
    {
      "collectionGroup": "revenueAnalytics",
      "fields": [
        {"fieldPath": "year", "order": "DESCENDING"},
        {"fieldPath": "quarter", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "auditLogs",
      "fields": [
        {"fieldPath": "timestamp", "order": "DESCENDING"},
        {"fieldPath": "userId", "order": "ASCENDING"}
      ]
    }
  ]
}
```

---

## 🚀 **Migration Path**

### **Phase 1: Setup**
1. Enable Firestore in Firebase Console
2. Deploy security rules
3. Create indexes
4. Set up Cloud Functions project

### **Phase 2: Schema Creation**
1. Create Realtime Database structure
2. Create Firestore collections
3. Set up sync functions
4. Test with sample data

### **Phase 3: Data Import**
1. Parse Excel files
2. Validate and normalize data
3. Import to staging environment
4. Verify calculations
5. Production import

### **Phase 4: Validation**
1. Compare totals with Excel
2. Run reconciliation reports
3. User acceptance testing
4. Performance testing

---

## 💾 **Backup & Recovery**

### **Backup Strategy**
- Daily automated backups of both databases
- Export to Cloud Storage before major changes
- Point-in-time recovery for Firestore
- Transaction logs for audit trail

### **Recovery Procedures**
1. **Data Corruption**: Restore from last known good backup
2. **Calculation Errors**: Use override mechanism with audit
3. **Migration Failure**: Rollback using backup
4. **Performance Issues**: Scale up resources, optimize queries

---

## 📊 **Sample Data Examples**

### **Provider with Rules**
```javascript
// Realtime Database
"/ers/revenue/providers/PROV_JOHNHANCOCK": {
  "providerId": "PROV_JOHNHANCOCK",
  "name": "John Hancock",
  "status": "active"
}

"/ers/revenue/providerRules/PROV_JOHNHANCOCK/RULE_001": {
  "installRateAssets": 0.0020,
  "installRateDeposits": 0.0100,
  "ongoingRateAssets": 0.0005,
  "ongoingRequiresBuiltIn": false,
  "qualificationNotes": "5 plans",
  "effectiveStart": "2024-01-01"
}
```

### **Plan with Charges**
```javascript
// Plan Year Data
"/ers/revenue/planYears/PLAN_001/2024": {
  "year": 2024,
  "assetsBasis": 3100000,
  "firstYearDeposits": 86000,
  "participants": 45,
  "documentFee": 500,
  "adminBaseFee": 1300,
  "participantRate": 5,
  "totalFirstYearTPA": 8372,
  "projectedInstallation": 6372
}

// Charge Record
"/ers/revenue/charges/PLAN_001/2024/CHG_INSTALL": {
  "serviceType": "INSTALLATION",
  "calculatedAmount": 6372,
  "invoiced": true,
  "invoiceDate": "2025-01-15",
  "workYear": 2024,
  "invoiceYear": 2025
}
```

---

## ✅ **Schema Validation Checklist**

- [x] All provider rates supported
- [x] Work year vs invoice year tracking
- [x] Hard dollar fees structure
- [x] October Q1-Q3 billing support
- [x] Admin caseload tracking
- [x] Joe vs Dean segmentation
- [x] DC vs 3(16) business units
- [x] Plan termination handling
- [x] Audit trail for changes
- [x] Override capabilities
- [x] Historical data support
- [x] Performance optimization
- [x] Security rules defined
- [x] Backup strategy planned
- [x] Migration path clear

---

**Document Status:** READY FOR REVIEW  
**Next Steps:** Stakeholder approval before implementation  
**Last Updated:** January 2025


















