# CRM Database Migration Plan

## Overview

This plan creates a unified CRM database structure in **HealthcareITDatabase** that keeps client data separate, prevents duplicate outreach, and can easily merge with CLEmail `outreach_sets` data.

## Database Schema Design

### Primary Structure: `crm_unified/{customerId}/contacts/{contactId}`

```javascript
// Path: crm_unified/{customerId}/contacts/{contactId}
{
  // Contact Identity (for deduplication)
  contactId: "email_based_id", // Generated from primary email
  email: "john.doe@example.com",
  alternateEmails: ["j.doe@example.com"], // Additional emails found
  phone: "+1-555-0123",
  linkedInUrl: "https://linkedin.com/in/johndoe",
  
  // Contact Info
  firstName: "John",
  lastName: "Doe", 
  fullName: "John Doe", // For search/display
  title: "CTO",
  company: "Example Corp",
  
  // Organization Grouping
  orgId: "example_corp", // Generated from company name
  orgName: "Example Corp",
  
  // Outreach History (all channels)
  outreach: {
    email: {
      lastContact: "2024-01-15T10:00:00Z",
      totalContacts: 3,
      activities: [
        {
          date: "2024-01-15T10:00:00Z",
          type: "Email Sent",
          campaign: "healthcare_q1",
          account: "taylor@healthluminate.com",
          result: "delivered",
          notes: "Initial outreach email"
        }
      ]
    },
    linkedin: {
      lastContact: "2024-01-16T09:00:00Z", 
      totalContacts: 1,
      activities: [
        {
          date: "2024-01-16T09:00:00Z",
          type: "Connection Request",
          account: "linkedin_account_1",
          result: "pending",
          notes: "Sent connection request"
        }
      ]
    },
    phone: {
      lastContact: null,
      totalContacts: 0,
      activities: []
    }
  },
  
  // Quick Access Fields (for filtering)
  lastAnyContact: "2024-01-16T09:00:00Z", // Most recent across all channels
  totalContacts: 4, // Sum across all channels
  hasRecentContact: true, // Within last 30 days
  
  // Status
  status: "active", // active, do_not_contact, opted_out
  tags: ["healthcare", "decision_maker"],
  
  // Metadata
  createdAt: "2024-01-10T08:00:00Z",
  updatedAt: "2024-01-16T09:00:00Z",
  lastModifiedBy: "user@healthluminate.com"
}
```

### Supporting Indexes: `crm_unified/{customerId}/indexes/`

```javascript
// Path: crm_unified/{customerId}/indexes/by_company/{orgId}
{
  orgId: "example_corp",
  orgName: "Example Corp", 
  contactIds: ["contact_1", "contact_2", "contact_3"],
  lastUpdated: "2024-01-16T09:00:00Z"
}

// Path: crm_unified/{customerId}/indexes/by_email/{emailHash}
{
  email: "john.doe@example.com",
  contactId: "contact_1",
  lastUpdated: "2024-01-16T09:00:00Z"
}

// Path: crm_unified/{customerId}/indexes/recent_outreach/{date}
{
  date: "2024-01-16",
  contactIds: ["contact_1", "contact_5"],
  lastUpdated: "2024-01-16T09:00:00Z"
}
```

## Key Design Benefits

### 1. Customer Isolation
- Each customer's data is completely separate: `crm_unified/{customerId}/`
- No cross-customer data leakage possible
- Easy to backup/restore per customer

### 2. Efficient Querying
- **Get recent outreach**: Query `indexes/recent_outreach/{last_30_days}`
- **Get company contacts**: Query `indexes/by_company/{orgId}`  
- **Check email exists**: Query `indexes/by_email/{emailHash}`
- **Avoid full table scans**: Use indexes for all common operations

### 3. Deduplication Strategy
- **Primary Key**: Email-based contactId (normalized)
- **Email Variants**: Store alternate emails in array
- **Company Grouping**: orgId groups contacts from same company
- **Phone/LinkedIn**: Additional identifiers for cross-reference

### 4. CLEmail Integration Ready
```javascript
// Easy merge with outreach_sets data
async function mergeWithOutreachSets(customerId, contactId) {
  // Get CRM data
  const crmContact = await firebaseRTDB.ref(
    `crm_unified/${customerId}/contacts/${contactId}`
  ).get();
  
  // Get outreach_sets data from CLEmail
  const outreachSets = await clemailDB.collection('outreach_sets')
    .where('customerId', '==', customerId)
    .where('prospectContactId', '==', contactId)
    .get();
  
  // Merge and return unified view
  return mergeContactData(crmContact.val(), outreachSets.docs);
}
```

## Data Migration Strategy

### Phase 1: Extract Legacy Data

#### From Current Firebase Realtime DB (`hl_crm_input_25`)
```javascript
// Migration script for legacy data
async function migrateLegacyData() {
  const legacyRef = firebaseRTDB.ref('hl_crm_input_25');
  const snapshot = await legacyRef.get();
  
  if (!snapshot.exists()) return;
  
  const legacyData = snapshot.val();
  const migrationResults = {
    processed: 0,
    migrated: 0,
    duplicates: 0,
    errors: []
  };
  
  // Process each organization
  for (const [orgId, orgData] of Object.entries(legacyData)) {
    if (!orgData.outreach) continue;
    
    // Process each contact's outreach history
    for (const [encodedEmail, outreachLogs] of Object.entries(orgData.outreach)) {
      try {
        const email = decodeEmailKey(encodedEmail); // Convert _DOT_ and _AT_ back
        const contact = await buildContactFromLegacy(orgId, email, outreachLogs);
        
        // Determine customer (you'll need logic for this)
        const customerId = determineCustomerFromLegacyData(orgData);
        
        await migrateContact(customerId, contact);
        migrationResults.migrated++;
        
      } catch (error) {
        migrationResults.errors.push({
          orgId,
          email: encodedEmail,
          error: error.message
        });
      }
      
      migrationResults.processed++;
    }
  }
  
  return migrationResults;
}

function decodeEmailKey(encodedEmail) {
  return encodedEmail.replace(/_DOT_/g, '.').replace(/_AT_/g, '@');
}

async function buildContactFromLegacy(orgId, email, outreachLogs) {
  const contactId = generateContactId(email);
  const activities = [];
  
  // Convert legacy outreach logs to new format
  for (const [logKey, log] of Object.entries(outreachLogs)) {
    activities.push({
      date: log.date,
      type: log.type,
      account: log.user || 'unknown',
      result: 'completed', // Legacy data assumes completion
      notes: log.notes || '',
      legacyId: logKey
    });
  }
  
  // Sort activities by date
  activities.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return {
    contactId,
    email,
    orgId,
    orgName: extractOrgNameFromId(orgId),
    outreach: {
      email: {
        lastContact: activities.length > 0 ? activities[activities.length - 1].date : null,
        totalContacts: activities.length,
        activities
      },
      linkedin: { lastContact: null, totalContacts: 0, activities: [] },
      phone: { lastContact: null, totalContacts: 0, activities: [] }
    },
    lastAnyContact: activities.length > 0 ? activities[activities.length - 1].date : null,
    totalContacts: activities.length,
    hasRecentContact: isRecentContact(activities),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    migrationSource: 'legacy_hl_crm_input_25'
  };
}
```

#### From Hotsheet Systems
```javascript
// Extract from hotsheet tracking functions
async function extractHotsheetData() {
  // This would extract data from the trackOutreach() calls
  // in oldhotsheet.html and hotsheet.html
  
  // Since these use the same hl_crm_input_25 structure,
  // they'll be captured in the legacy migration above
  
  console.log('Hotsheet data included in legacy migration');
}
```

### Phase 2: Transform and Load

```javascript
async function migrateContact(customerId, contact) {
  const contactRef = firebaseRTDB.ref(
    `crm_unified/${customerId}/contacts/${contact.contactId}`
  );
  
  // Check if contact already exists
  const existing = await contactRef.get();
  if (existing.exists()) {
    // Merge with existing data
    const merged = mergeContactData(existing.val(), contact);
    await contactRef.set(merged);
  } else {
    // Create new contact
    await contactRef.set(contact);
  }
  
  // Update indexes
  await updateIndexes(customerId, contact);
}

async function updateIndexes(customerId, contact) {
  const batch = [];
  
  // Email index
  const emailHash = hashEmail(contact.email);
  batch.push(
    firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_email/${emailHash}`)
      .set({
        email: contact.email,
        contactId: contact.contactId,
        lastUpdated: new Date().toISOString()
      })
  );
  
  // Company index
  batch.push(
    firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_company/${contact.orgId}`)
      .transaction((current) => {
        if (!current) {
          return {
            orgId: contact.orgId,
            orgName: contact.orgName,
            contactIds: [contact.contactId],
            lastUpdated: new Date().toISOString()
          };
        }
        
        if (!current.contactIds.includes(contact.contactId)) {
          current.contactIds.push(contact.contactId);
          current.lastUpdated = new Date().toISOString();
        }
        
        return current;
      })
  );
  
  // Recent outreach index (if has recent contact)
  if (contact.hasRecentContact) {
    const today = new Date().toISOString().split('T')[0];
    batch.push(
      firebaseRTDB.ref(`crm_unified/${customerId}/indexes/recent_outreach/${today}`)
        .transaction((current) => {
          if (!current) {
            return {
              date: today,
              contactIds: [contact.contactId],
              lastUpdated: new Date().toISOString()
            };
          }
          
          if (!current.contactIds.includes(contact.contactId)) {
            current.contactIds.push(contact.contactId);
            current.lastUpdated = new Date().toISOString();
          }
          
          return current;
        })
    );
  }
  
  await Promise.all(batch);
}
```

## Utility Functions

### Contact ID Generation
```javascript
function generateContactId(email) {
  // Create consistent ID from email
  return email.toLowerCase()
    .replace(/[^a-z0-9@.]/g, '_')
    .replace(/[@.]/g, '_');
}

function hashEmail(email) {
  // Simple hash for index keys
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}
```

### Customer Assignment Logic
```javascript
function determineCustomerFromLegacyData(orgData) {
  // You'll need to implement logic to determine which customer
  // this legacy data belongs to. Could be based on:
  // - Domain patterns
  // - Date ranges
  // - User who created the data
  // - Manual mapping file
  
  // For now, default to internal
  return 'internal';
}
```

### Deduplication Logic
```javascript
function mergeContactData(existing, incoming) {
  return {
    ...existing,
    // Merge alternate emails
    alternateEmails: [
      ...(existing.alternateEmails || []),
      ...(incoming.alternateEmails || [])
    ].filter((email, index, arr) => arr.indexOf(email) === index),
    
    // Merge outreach activities
    outreach: {
      email: mergeChannelData(existing.outreach?.email, incoming.outreach?.email),
      linkedin: mergeChannelData(existing.outreach?.linkedin, incoming.outreach?.linkedin),
      phone: mergeChannelData(existing.outreach?.phone, incoming.outreach?.phone)
    },
    
    // Update totals
    totalContacts: calculateTotalContacts(merged.outreach),
    lastAnyContact: calculateLastContact(merged.outreach),
    hasRecentContact: isRecentContact(merged.outreach),
    
    updatedAt: new Date().toISOString()
  };
}
```

## Implementation Steps

### Step 1: Create Migration Scripts
1. **Legacy data extractor** - Pull from `hl_crm_input_25`
2. **Data transformer** - Convert to new schema
3. **Deduplication engine** - Handle duplicate contacts
4. **Index builder** - Create search indexes

### Step 2: Test Migration
1. **Small batch test** - Migrate 100 contacts
2. **Validate structure** - Ensure data integrity  
3. **Test queries** - Verify index performance
4. **Test CLEmail merge** - Ensure integration works

### Step 3: Full Migration
1. **Backup existing data** - Complete backup before migration
2. **Run migration** - Process all legacy data
3. **Validate results** - Check totals and spot-check data
4. **Update applications** - Point hotsheets to new structure

This focused approach gives you a clean, customer-isolated database that prevents duplicate outreach and integrates easily with your existing CLEmail `outreach_sets` data.


