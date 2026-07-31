# LinkedIn Contact Search - Organization Tracking Fix

**Date:** 2026-01-14  
**Issue:** Prospects saved from LinkedIn contact search were showing contacts from different organizations than the ones originally searched

## 🐛 **The Problem**

When searching for employees at specific organizations (e.g., "Mayo Clinic", "Cleveland Clinic"), the saved prospects would sometimes show contacts from completely different companies. This happened because:

1. **Employee's Profile Company vs Searched Organization**
   - The system was saving `contact.current_company` (from the employee's LinkedIn profile)
   - But **NOT** saving which organization was actually searched
   
2. **Employee Mobility**
   - An employee might have moved to a new company after the original LinkedIn data was scraped
   - Or their profile might list a subsidiary/division name instead of the parent company

3. **No Audit Trail**
   - There was no way to tell which organization search resulted in finding a specific prospect
   - Made it impossible to filter prospects by the organization you originally searched for

## ✅ **The Solution**

Added **two new fields** to every prospect saved from LinkedIn contact search:

```javascript
{
  // ... existing fields ...
  
  // ✅ NEW: Which organization was searched to find this prospect
  searchedOrganization: "Mayo Clinic",  // The company name you searched for
  searchedOrganizationLinkedInUrl: "https://linkedin.com/company/mayo-clinic/",
  
  // vs. what might be in their profile
  company: "Mayo Clinic Health System"  // What's on their LinkedIn profile
}
```

## 🔧 **Technical Changes**

### 1. **GPT Validation BEFORE Saving** (`linkedin_contact_search_service.js` lines 598-730)

**CRITICAL:** Before any prospects are saved, GPT validates that each employee's company actually matches the searched organization.

```javascript
// ✅ ENABLED: GPT validation to filter out wrong companies
console.log(`🤖 Using GPT to validate company name matches...`);

// Build prompt comparing searched companies vs found employee companies
const prompt = `You are validating employee data from LinkedIn scraping.

SEARCHED COMPANIES (what we asked for):
1. "Mayo Clinic"
2. "Cleveland Clinic"

FOUND COMPANY NAMES (in employee data):
1. "Mayo Clinic Health System"
2. "Microsoft Corporation"  

TASK: For each FOUND company name, determine if it matches a SEARCHED company.
- Accept variations (e.g., "Mayo Clinic" vs "Mayo Clinic Health System")
- Accept abbreviations (e.g., "IBM" vs "International Business Machines")
- REJECT if clearly different (e.g., "Mayo Clinic" vs "Microsoft")
`;

// GPT returns which companies are valid matches
const validationResult = {
  "matches": [
    {
      "found_name": "Mayo Clinic Health System",
      "searched_name": "Mayo Clinic",
      "is_match": true,  // ✅ ACCEPT
      "reason": "Subsidiary of Mayo Clinic"
    },
    {
      "found_name": "Microsoft Corporation",
      "searched_name": null,
      "is_match": false,  // ❌ REJECT
      "reason": "Completely different company"
    }
  ]
}

// Filter employees - only keep those whose company passed validation
const validatedEmployees = employees.filter(emp => 
  validCompanyNames.has(emp.current_company)
);
```

**What This Does:**
- ✅ **Accepts** employees from subsidiaries, divisions, or name variations
- ✅ **Accepts** employees with abbreviations (IBM, GE, etc.)
- ❌ **Rejects** employees from clearly different companies
- 📊 **Logs** exactly which employees were rejected and why

### 2. **Employee Data Tagging for Cached Employees** (`linkedin_contact_search_service.js` lines 574-596)

**For Cached Employees:**
```javascript
async loadCachedEmployees(companies, criteria) {
  snapshot.forEach(doc => {
    const empData = doc.data();
    employees.push({
      ...empData,
      searched_organization: company.company_name,  // ✅ Tag with searched company
      searched_organization_linkedin_url: company.linkedin_url
    });
  });
}
```

### 3. **Prospect Saving** (`linkedin_contact_search_job_processor.js`)

**A. Normal Job Processing (lines 151-179)**
```javascript
const prospectData = {
  // ... all existing fields ...
  
  // ✅ NEW: Searched organization information (passed GPT validation!)
  searchedOrganization: contact.searched_organization || '',
  searchedOrganizationLinkedInUrl: contact.searched_organization_linkedin_url || ''
};
```

**B. Recovery Function (lines 469-497)**
```javascript
const prospectData = {
  // ... all existing fields ...
  
  // ✅ NEW: Searched organization information (passed GPT validation!)
  searchedOrganization: contact.searched_organization || '',
  searchedOrganizationLinkedInUrl: contact.searched_organization_linkedin_url || ''
};
```

---

## 🎯 **The Two-Layer Validation System**

### Layer 1: LinkedIn Harvest API Filtering
- Harvest API searches employees at specific company URLs
- Returns employees who list that company in their profile

### Layer 2: GPT Validation (NEW!) ✅
- **BEFORE saving prospects**, GPT validates each employee's company
- Accepts name variations, subsidiaries, abbreviations
- **Rejects** employees from clearly different companies
- **Result:** Only validated employees are saved as prospects

### Example Flow:

```
1. You search: "Mayo Clinic"
   ↓
2. Harvest finds employees at linkedin.com/company/mayo-clinic/
   ↓
3. Returns 100 employee profiles
   ↓
4. GPT Validation checks each employee's current_company:
   ✅ "Mayo Clinic Health System" → ACCEPT (subsidiary)
   ✅ "Mayo Clinic Arizona" → ACCEPT (division)
   ❌ "Microsoft Corporation" → REJECT (wrong company!)
   ↓
5. Only validated employees (95) are saved as prospects
   ↓
6. Each prospect is tagged:
   - searched_organization: "Mayo Clinic"
   - company: "Mayo Clinic Health System"
```

---

## 📊 **Benefits**

1. ✅ **GPT Validation BEFORE Saving** - Wrong companies are filtered out automatically
2. ✅ **Clear Attribution** - Know which organization search found each prospect
3. ✅ **Better Filtering** - Filter prospects by searched organization
4. ✅ **Data Quality** - Only validated employees become prospects
5. ✅ **Audit Trail** - See difference between profile company vs searched company
6. ✅ **Smart Matching** - Handles subsidiaries, divisions, abbreviations correctly

## 🔍 **Example Use Cases**

### Use Case 1: GPT Validation in Action
```
Search: "Mayo Clinic"
↓
Harvest finds 100 employees
↓
GPT validates:
  ✅ 85 employees: "Mayo Clinic Health System" → ACCEPT
  ✅ 10 employees: "Mayo Clinic" → ACCEPT
  ❌ 5 employees: "Microsoft" → REJECT (wrong company!)
↓
Result: Only 95 validated prospects are saved
```

### Use Case 2: Filtering by Searched Organization
```javascript
// In prospect_contacts.html or generate_messages.html
const mayoProspects = prospects.filter(p => 
  p.searchedOrganization === "Mayo Clinic"
);
```

### Use Case 3: Detecting Company Changes
```javascript
// Find prospects who might have changed companies
const movedEmployees = prospects.filter(p => 
  p.company !== p.searchedOrganization &&
  !p.company.includes(p.searchedOrganization)
);
```

### Use Case 4: Verifying Search Results
```javascript
// Show which organization each prospect came from
prospects.forEach(p => {
  console.log(`${p.firstName} ${p.lastName}`);
  console.log(`  Profile Company: ${p.company}`);
  console.log(`  Found via search: ${p.searchedOrganization}`);
});
```

## 🚀 **How to Use**

### For New Searches
All new LinkedIn contact searches will automatically include these fields. No changes needed!

### Viewing in prospect_contacts.html
The `searchedOrganization` and `searchedOrganizationLinkedInUrl` fields are now saved with every prospect. You can:

1. **Export to CSV** and see both columns:
   - `company` = What's on their LinkedIn profile
   - `searchedOrganization` = What you searched for

2. **Filter prospects** by `searchedOrganization` to see only those from specific searches

3. **Compare** `company` vs `searchedOrganization` to spot discrepancies

### For Existing Prospects (Before This Fix)
Unfortunately, prospects saved before this fix won't have the `searchedOrganization` fields. They will show as empty/blank. Only new searches will have this data.

## 📝 **Field Definitions**

| Field | Description | Example |
|-------|-------------|---------|
| `searchedOrganization` | The company name you searched for | "Mayo Clinic" |
| `searchedOrganizationLinkedInUrl` | LinkedIn URL of the searched company | "https://linkedin.com/company/mayo-clinic/" |
| `company` | Company name from employee's LinkedIn profile | "Mayo Clinic Health System" |
| `companyDomain` | Derived domain of profile company | "mayoclinic.org" |

## ⚠️ **Important Notes**

1. **GPT Validation:** Uses `gpt-4o-mini` for cost-effective, accurate company matching
2. **Smart Matching:** Accepts subsidiaries, divisions, abbreviations, name variations
3. **Strict Filtering:** Rejects clearly different companies (e.g., searching "Mayo Clinic" but finding "Microsoft")
4. **Fallback:** If GPT API fails, accepts all employees as fallback (with warning logged)
5. **Multiple Companies:** When searching multiple companies in one job, each prospect is validated against ALL searched companies
6. **Cost:** ~$0.0001 per employee validated (extremely low cost with gpt-4o-mini)

## 🎯 **Status**

✅ **FULLY IMPLEMENTED** - GPT validation + organization tracking
- GPT validation: ✅ Enabled and filtering before save
- Cached employee lookups: ✅ Tagged
- New employee scrapes: ✅ Validated and tagged  
- Prospect saving: ✅ Includes new fields (only validated employees)
- Recovery function: ✅ Includes new fields

**Deploy Status:** Pending Railway deployment

---

## 📈 **Expected Results**

### Before This Fix:
- Search "Mayo Clinic" → Get 100 employees
- Some might be from wrong companies
- No way to filter or verify

### After This Fix:
- Search "Mayo Clinic" → GPT validates all 100 employees
- ✅ 95 validated (from Mayo Clinic & subsidiaries)
- ❌ 5 rejected (from wrong companies - logged)
- Only 95 saved as prospects
- Each tagged with "Mayo Clinic" as `searchedOrganization`
