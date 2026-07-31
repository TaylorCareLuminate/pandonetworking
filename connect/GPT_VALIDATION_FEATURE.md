# GPT Validation for LinkedIn Contact Search

**Date:** 2026-01-14  
**Feature:** Pre-save GPT validation to ensure employees match searched organizations

## ✅ **What Was Added**

**GPT-powered validation BEFORE saving prospects** - ensures that each employee's company actually matches the organization you searched for.

## 🎯 **The Problem It Solves**

Even though LinkedIn's Harvest API filters employees by company URL, sometimes employees slip through with the wrong company listed on their profile because:
- They recently changed jobs
- Their profile lists a different division/subsidiary
- Data discrepancies in LinkedIn's system

## 🤖 **How It Works**

### Step 1: Harvest Returns Employees
```
Search: "Mayo Clinic"
Harvest finds 100 employees at linkedin.com/company/mayo-clinic/
```

### Step 2: GPT Validates Each Employee
```javascript
GPT analyzes employee companies:
  - "Mayo Clinic Health System" → ✅ ACCEPT (subsidiary)
  - "Mayo Clinic Arizona" → ✅ ACCEPT (division)  
  - "Mayo Clinic" → ✅ ACCEPT (exact match)
  - "Microsoft Corporation" → ❌ REJECT (wrong company!)
```

### Step 3: Only Validated Employees Saved
```
Result: 95 validated prospects saved (5 rejected)
Logs show: "Rejected: John Smith (Microsoft Corporation) - doesn't match searched companies"
```

## 📋 **Validation Rules**

GPT uses these rules:

✅ **ACCEPT if:**
- Exact name match ("Mayo Clinic" = "Mayo Clinic")
- Subsidiary/division ("Mayo Clinic Health System" vs "Mayo Clinic")
- Abbreviation ("IBM" vs "International Business Machines")
- Minor variations ("Mayo Clinic" vs "The Mayo Clinic")

❌ **REJECT if:**
- Completely different company ("Mayo Clinic" vs "Microsoft")
- No reasonable connection between names

## 🔧 **Technical Details**

**Model:** `gpt-4o-mini` (cost-effective, accurate)  
**Cost:** ~$0.0001 per employee validated  
**API:** OpenAI Chat Completions with JSON response format  
**Fallback:** If GPT API fails, accepts all employees (logs warning)

**Prompt Template:**
```
You are validating employee data from LinkedIn scraping.

SEARCHED COMPANIES (what we asked for):
1. "Mayo Clinic"
2. "Cleveland Clinic"

FOUND COMPANY NAMES (in employee data):
1. "Mayo Clinic Health System"
2. "Microsoft Corporation"

TASK: Determine if each FOUND company matches a SEARCHED company.
- Accept variations, subsidiaries, abbreviations
- REJECT if clearly different
```

**Response Format:**
```json
{
  "matches": [
    {
      "found_name": "Mayo Clinic Health System",
      "searched_name": "Mayo Clinic",
      "is_match": true,
      "reason": "Subsidiary of Mayo Clinic"
    },
    {
      "found_name": "Microsoft Corporation",
      "searched_name": null,
      "is_match": false,
      "reason": "Completely different company"
    }
  ]
}
```

## 📊 **Expected Impact**

### Before:
- Search returns all employees from Harvest API
- Some might be from wrong companies
- All saved as prospects

### After:
- Search returns employees from Harvest API
- **GPT validates each employee's company**
- **Only validated employees saved**
- Rejected employees logged for review

### Example Results:
```
📊 Search: "Mayo Clinic" (3 hospitals)
   ↓
👥 Harvest found: 300 employees
   ↓
🤖 GPT Validation:
   ✅ 285 validated (Mayo Clinic & subsidiaries)
   ❌ 15 rejected (wrong companies - logged)
   ↓
💾 Saved: 285 prospects
   ↓
📋 Logs show which 15 were rejected and why
```

## 🚀 **Benefits**

1. **Cleaner Data** - Wrong companies filtered out automatically
2. **Higher Quality** - Only prospects from correct organizations
3. **Transparency** - Logs show exactly what was rejected and why
4. **Smart Matching** - Handles subsidiaries and variations correctly
5. **Low Cost** - Uses gpt-4o-mini (~$0.0001 per employee)
6. **Reliable** - Fallback to accept all if GPT fails

## 🔍 **Monitoring**

Check Railway logs for validation results:

```
🤖 Using GPT to validate company name matches...
📊 GPT validation result: { matches: [...] }
✅ Valid company matches: 2 of 3
📋 Valid companies: ["Mayo Clinic Health System", "Mayo Clinic"]
❌ Rejected: John Smith (Microsoft Corporation) - doesn't match searched companies
🎯 Filtered: 95 of 100 employees passed validation
❌ Rejected: 5 employees (wrong company)
```

## ⚙️ **Configuration**

**Validation is ENABLED by default** for all LinkedIn contact searches.

To disable (not recommended):
1. Edit `RailwayCLemail/services/linkedin_contact_search_service.js`
2. Find `validateCompanyNameMatches` function
3. Comment out GPT validation code

## 🎯 **Status**

✅ **IMPLEMENTED** - Ready to deploy
- Code: Complete
- Testing: Pending
- Documentation: Complete
- Deploy: Pending Railway deployment
