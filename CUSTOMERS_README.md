# Customer Data Access Guide

## Overview

This document explains how to properly access customer data in the HealthLuminate PPC Care system. Customer data is stored across multiple Firebase tables and requires a specific approach to access correctly.

## Data Structure

### Companies Table (`ppccare/companies`)
This is the **primary source** for customer/company information:
- **Path**: `ppccare/companies`
- **Coverage**: ~230 total companies, ~126 have `bullhornid`, ~60 active with `bullhornid`
- **Key Fields**:
  - `org`: Company/organization name
  - `bullhornid`: Unique identifier used for cross-referencing ⚠️ **Not all companies have this**
  - `status`: Company status (e.g., "Active", "Inactive", "Dormant")
  - `domain`: Company website domain
  - `customer_type`: Type classification

### Consultants Table (`ppccare/consultants`)
Contains consultant information with client assignments:
- **Path**: `ppccare/consultants`
- **Key Fields**:
  - `name`: Consultant name
  - `email`: Consultant email
  - `clientids`: **NEW FIELD** - Bullhorn IDs separated by " || "
  - `Clients`: **DEPRECATED** - Old client names field (don't use)

### KARE Table (`ppc_kare_25`)
Contains role assignments and additional customer details:
- **Path**: `ppc_kare_25`
- **Key Fields**:
  - `organization_name`: Company name
  - `bullhorn_id` or `bullhornid`: Cross-reference ID
  - `sales_leader`, `executive_leader`, etc.: Role assignments

## How to Access Customer Data

### Important: Sync Process Required
Before customer associations appear in team management, you must **run the sync/import process**:

1. **Load the team.html page**
2. **Click "Import from Consultants"** button  
3. **This will**:
   - Parse consultant `clientids` fields
   - Map bullhorn IDs to company names
   - Create/update team member customer assignments
   - Display customer tags in the team table

⚠️ **Without running the sync, team members will show `customers: undefined`**

### Step 1: Fetch Companies Data
```javascript
async function fetchCustomers() {
  const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
  const companiesRef = ref(database, 'ppccare/companies');
  const snapshot = await get(companiesRef);
  return snapshot.exists() ? snapshot.val() : {};
}
```

### Step 2: Map Consultant Client IDs
When mapping consultant clients, use the new `clientids` field:
```javascript
function mapConsultantClients(clientIdsString) {
  if (!clientIdsString) return [];
  
  // Split by " || " separator
  const clientIds = clientIdsString.split(' || ').map(id => id.trim()).filter(id => id);
  
  // Match against company bullhornids
  const validCustomerIds = [];
  clientIds.forEach(clientId => {
    const company = Object.values(companiesData).find(comp => 
      comp.bullhornid === clientId || 
      comp.bullhornid === clientId.toString() || 
      comp.bullhornid === parseInt(clientId)
    );
    
    if (company) {
      validCustomerIds.push(clientId);
    }
  });
  
  return validCustomerIds;
}
```

### Step 3: Display Customer Names
When displaying customer names, look up by bullhornid:
```javascript
function getCustomerName(bullhornId) {
  const company = Object.values(companiesData).find(c => 
    c.bullhornid === bullhornId || 
    c.bullhornid === bullhornId.toString() || 
    c.bullhornid === parseInt(bullhornId)
  );
  return company ? company.org : bullhornId;
}
```

## Data Type Handling

### Important: Multiple Data Types
The `bullhornid` field may be stored as:
- String: `"123456"`
- Number: `123456`
- String number: `"123456"`

Always check for all three types when matching:
```javascript
const company = companies.find(c => 
  c.bullhornid === id || 
  c.bullhornid === id.toString() || 
  c.bullhornid === parseInt(id)
);
```

## Common Patterns

### Pattern 1: Get Active Customers Only
```javascript
const activeCompanies = Object.values(companiesData).filter(company => 
  company.status === 'Active' && company.bullhornid
);
```

### Pattern 2: Cross-Reference with KARE Data
```javascript
// First get active company bullhornids
const activeIds = new Set();
Object.values(companiesData).forEach(company => {
  if (company.status === 'Active' && company.bullhornid) {
    activeIds.add(company.bullhornid);
    activeIds.add(company.bullhornid.toString());
    activeIds.add(parseInt(company.bullhornid));
  }
});

// Then filter KARE data
const filteredKareData = Object.entries(kareData).filter(([id, org]) => {
  return activeIds.has(org.bullhorn_id) || activeIds.has(org.bullhornid);
});
```

### Pattern 3: Consultant-to-Customer Mapping
```javascript
// From consultant record
const consultant = consultantsData[consultantId];
const clientIds = mapConsultantClients(consultant.clientids);

// Map to customer names
const customerNames = clientIds.map(id => getCustomerName(id));
```

## Field Reference

### Companies (`ppccare/companies`)
- `org` → Company name for display
- `bullhornid` → Primary key for cross-referencing
- `status` → Filter for "Active" companies
- `domain` → Company website
- `customer_type` → Classification

### Consultants (`ppccare/consultants`)
- `clientids` → **USE THIS** - Bullhorn IDs separated by " || "
- `Clients` → **DON'T USE** - Deprecated text field
- `name` → Consultant name
- `email` → Consultant email

### KARE (`ppc_kare_25`)
- `organization_name` → Company name
- `bullhorn_id` OR `bullhornid` → Cross-reference to companies
- Role fields: `sales_leader`, `executive_leader`, `sales_second`, etc.

## Troubleshooting

### Issue: No customers showing up
**Root Cause**: Usually haven't run the sync process  
**Solution**: Click "Import from Consultants" button in team.html

### Issue: Client IDs not matching  
**Root Cause**: Wrong separator or data type mismatch  
**Solution**: Ensure you're splitting by " || " not "," and handle different data types

### Issue: Company names not displaying
**Root Cause**: Data type mismatch in bullhornid lookup  
**Solution**: Verify the lookup uses all three data type variations

### Issue: Empty customer lists
**Root Cause**: Companies don't have bullhornid or aren't active  
**Solution**: Filter companies by `status === 'Active'` and `bullhornid` exists

### Debugging: Validate Data Connections
Add this debug code to verify the system is working:
```javascript
// Check companies with bullhornids
const companiesWithIds = Object.values(companiesData).filter(c => c.bullhornid);
console.log(`✅ Companies with bullhornid: ${companiesWithIds.length}`);

// Test a sample consultant
const sampleConsultant = Object.values(consultantsData).find(c => c.clientids);
if (sampleConsultant) {
  console.log('Sample consultant clientids:', sampleConsultant.clientids);
  const ids = sampleConsultant.clientids.split(' || ');
  ids.forEach(id => {
    const company = companiesWithIds.find(c => c.bullhornid == id);
    if (company) {
      console.log(`✅ ID ${id} matches: ${company.org}`);
    }
  });
}
```

## Examples in Use

See these files for working examples:
- `ppccare/team.html` - Team member customer assignments
- `ppccare/customer_roles.html` - Role assignments by customer
- `ppccare/consultants_roles.html` - Consultant role assignments

## Migration Notes

### From Old `Clients` Field to `clientids`
- **Old Method**: `consultant.Clients` contained text names, required fuzzy matching against `company.org`
- **New Method**: `consultant.clientids` contains bullhorn IDs separated by " || ", exact matching against `company.bullhornid`
- **Migration**: Update all references from `consultant.Clients` to `consultant.clientids`
- **Reliability**: New method is 100% accurate vs ~70% accuracy with fuzzy text matching

### Data Coverage Reality
- **Total Companies**: ~230 in `ppccare/companies`
- **With Bullhorn IDs**: ~126 companies (~55%)
- **Active with IDs**: ~60 companies (~26% of total)
- **Implication**: Not all customer relationships can be automatically mapped

### Data Type Evolution
- **Historical**: Some bullhornids stored as strings, some as numbers
- **Current**: Mixed types still exist in production data, always check both
- **Best Practice**: Use flexible matching: `===`, `.toString()`, and `parseInt()`
- **Future**: Standardization may occur, but continue defensive coding 