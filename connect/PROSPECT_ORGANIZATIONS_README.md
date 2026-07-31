# Prospect Organizations - LinkedIn URL Flow

## Overview

The Prospect Organizations page allows BDRs to manage a list of target organizations and selectively scan them for contacts. This document explains when and how LinkedIn company URLs are found and saved.

---

## LinkedIn URL Search Flow

### When Are LinkedIn URLs Found?

LinkedIn company URLs are searched and added to organizations in **three scenarios**:

### 1. **🔬 "Research All LinkedIn URLs" Button (RECOMMENDED)**
- **When**: User clicks the purple "Research All LinkedIn URLs" button
- **What happens**:
  1. **Gemini web search**: AI searches the web for each company's LinkedIn page
  2. **Bebity validation**: Verifies the LinkedIn URL exists and is accessible
  3. **OpenAI verification**: Confirms the found URL matches the correct company (rejects wrong matches)
  4. Clears cache to ensure fresh, accurate results
  5. Updates `company_linkedin_url` field with **verified** URLs only
  6. Saves verification status and confidence level
- **Cost**: ~$0.003 per organization (Gemini + Bebity + OpenAI)
- **Accuracy**: **Highest** - triple-verified with AI confirmation
- **Use case**: Initial setup or when you need to ensure URLs are correct
- **Example**: Research 100 organizations = $0.30

### 2. **📌 "Find Missing LinkedIn URLs" Button (QUICK)**
- **When**: User clicks the "Find Missing LinkedIn URLs" button
- **What happens**:
  1. System queries `prospect_organizations` for orgs without `company_linkedin_url`
  2. Calls backend API: `/api/linkedin-contact-search/find-company-urls`
  3. Uses **cached results** when available (instant, free)
  4. For new companies: Gemini AI + Bebity API (no OpenAI verification)
  5. Updates `company_linkedin_url` field in Firestore for found companies
  6. Does **NOT** scan for contacts - only finds URLs
- **Cost**: $0.001 per organization (Bebity API, only for non-cached)
- **Accuracy**: **Good** - uses Gemini + Bebity but no OpenAI verification
- **Use case**: Quick URL population for organizations not yet in system
- **Example**: Find 100 new organizations = $0.10

### 3. **Automatic During Contact Scanning**
- **When**: User scans organizations (via "Scan Selected" or "Scan Next Batch")
- **What happens**:
  1. Job is submitted to `connect_contact_search_log`
  2. Backend job processor runs through 4 steps:
     - **STEP 1**: Find company LinkedIn URLs (if not already found)
     - **STEP 2**: Search for employees at those companies
     - **STEP 3**: Filter contacts (optional)
     - **STEP 4**: Save contacts to `prospect_contacts`
  3. After STEP 1, system updates `prospect_organizations` with found URLs
  4. After STEP 4 completes successfully, marks organizations as scanned
- **Cost**: $0.001 per org (Bebity) + $8 per 1000 contacts + $20 per 1000 API calls (Harvest)
- **Use case**: Full end-to-end contact discovery

---

## Backend Updates to prospect_organizations

The backend job processor (`linkedin_contact_search_job_processor.js`) now includes logic to update the `prospect_organizations` collection:

### NEW: AI Verification Pipeline

When you click "Research All LinkedIn URLs", the system runs a **3-step verification pipeline**:

#### Step 1: Gemini Web Search
```javascript
// Gemini searches the web for company LinkedIn pages
const prompt = `For each company, search the web to find:
1. The exact name they use on LinkedIn
2. Their LinkedIn company page URL

Companies: Mayo Clinic, Banner Health, ...`;

// Returns: Potential LinkedIn URLs and names
```

#### Step 2: Bebity Validation
```javascript
// Bebity actor validates that the LinkedIn URL exists
// Searches by both original name and Gemini's suggested name
// Returns: Confirmed LinkedIn URLs that actually exist
```

#### Step 3: OpenAI Verification (NEW!)
```javascript
// OpenAI GPT-4o-mini verifies the match is correct
const verification = await openai.verify({
  original_name: "Mayo Clinic",
  found_name: "Mayo Clinic",
  found_url: "linkedin.com/company/mayo-clinic",
  city: "Rochester",
  state: "MN"
});

// Returns: 
// - is_match: true/false
// - confidence: "high"/"medium"/"low"
// - reason: "Explanation of match decision"

// ✅ Only URLs that OpenAI confirms are saved
// ❌ Wrong matches are rejected (e.g., found subsidiary instead of parent)
```

**Why this matters**: Sometimes Gemini or Bebity find a LinkedIn page with a similar name, but it's actually a different company (e.g., "Mayo Clinic Florida" vs "Mayo Clinic"). OpenAI's verification step prevents these false matches.

---

### After Finding LinkedIn URLs (STEP 1)
```javascript
// If job source is 'prospect_organizations'
if (jobData.source === 'prospect_organizations') {
  // Loop through companies with prospect_org_id
  for (const company of jobData.companies) {
    if (company.prospect_org_id && foundLinkedInUrl) {
      // Update Firestore
      await db.collection('prospect_organizations')
        .doc(company.prospect_org_id)
        .update({
          company_linkedin_url: foundLinkedInUrl,
          last_updated_at: timestamp
        });
    }
  }
}
```

### After Saving Contacts (STEP 4)
```javascript
// Mark organizations as scanned
if (jobData.source === 'prospect_organizations' && totalSaved > 0) {
  for (const company of jobData.companies) {
    if (company.prospect_org_id) {
      await db.collection('prospect_organizations')
        .doc(company.prospect_org_id)
        .update({
          scanned: true,
          scan_count: currentCount + 1,
          last_scanned_at: timestamp
        });
    }
  }
}
```

---

## Firestore Schema

### prospect_organizations Collection

```javascript
{
  bdrEmail: string,                    // Which BDR owns this org
  company_name: string,                // Required
  company_domain: string | null,       // Optional
  company_city: string | null,         // Optional
  company_state: string | null,        // Optional
  company_industry: string | null,     // Optional
  company_linkedin_url: string | null, // ✅ Found via Gemini/Bebity/OpenAI
  linkedin_url_verified: boolean,      // ✅ True if verified by OpenAI
  linkedin_url_confidence: string | null, // ✅ 'high', 'medium', 'low', or null
  linkedin_url_source: string | null,  // ✅ 'research', 'cache', 'gemini', 'bebity'
  scanned: boolean,                    // ✅ Marked true after scanning
  scan_count: number,                  // ✅ Incremented each scan
  last_scanned_at: string | null,      // ✅ ISO timestamp
  created_at: string,                  // ISO timestamp
  created_by: string                   // User email
}
```

---

## Key Features

### Statistics Dashboard
- **Total Organizations**: All orgs in the list
- **Scanned Organizations**: How many have been scanned for contacts
- **Unscanned Organizations**: Not yet scanned
- **Missing LinkedIn URLs**: How many need URLs found
- **Scan Progress**: Percentage scanned

### Smart Filtering & Comparison
- **Compare with Existing Prospects**: Check which orgs already have contacts in system
  - **Primary matching**: Uses `searchedOrganizationLinkedInUrl` field (most accurate)
  - **Fallback matching**: Uses company name for older prospects
  - Shows breakdown of URL matches vs name matches
  - Detects contacts from both this page AND the LinkedIn Contact Search tab
- **Hide organizations with existing prospects**: Focus on new orgs
- **Hide scanned organizations**: Only show unscanned ones

### Why LinkedIn URL Matching is Better
The system uses the `searchedOrganizationLinkedInUrl` field saved in `prospect_contacts` to match organizations. This is more accurate than company name matching because:
- ✅ Company names can vary: "Mayo Clinic" vs "Mayo Clinic Health System"
- ✅ LinkedIn URLs are unique and standardized
- ✅ Avoids false positives from similar company names
- ✅ Works across both scanning workflows (Prospect Organizations and LinkedIn Contact Search)

**Recommendation**: Always click "Find Missing LinkedIn URLs" before comparing to get the most accurate results!

### Selective Scanning
- **Select specific organizations**: Manual checkbox selection
- **Scan Selected**: Only scan the ones you choose
- **Scan Next Batch**: Automatically scan X unscanned organizations

---

## Cost Control

### Research All URLs ($0.003 each - Most Accurate)
```
100 organizations × $0.003 = $0.30
- Gemini web search: ~$0.001
- Bebity validation: $0.001
- OpenAI verification: ~$0.001
✅ Triple-verified accuracy
✅ Rejects wrong matches
```

### Find Missing URLs ($0.001 each - Uses Cache When Available)
```
100 organizations × $0.001 = $0.10
(Only for organizations not in cache)
```

### Full Contact Scan
```
100 organizations × $0.001 (URLs) = $0.10
+ Employee searches (varies by org size and criteria)
+ ~$8 per 1000 contacts found
+ ~$20 per 1000 API calls to Harvest

Typical: $0.10 - $2.00 per organization depending on size
```

---

## Workflow Example

### Recommended Workflow (NEW):
1. **Upload organizations** via CSV
2. **Click "Research All LinkedIn URLs"** to get verified URLs ($0.30 for 100 orgs)
   - Uses AI to search web, validate, and verify matches
   - Ensures URLs are correct before expensive contact scans
3. **Click "Compare with Existing Prospects"** to see which are already in your system
4. **Filter out** orgs with existing prospects
5. **Select 5-10 organizations** you want to scan
6. **Configure** job functions and seniority levels
7. **Click "Scan Selected"** to scan only those orgs
8. **Monitor** scan progress in stats dashboard
9. **Repeat** for more batches as budget allows

### Alternative Quick Workflow:
1. **Upload organizations** via CSV
2. **Click "Find Missing LinkedIn URLs"** for quick URL population ($0.10 for 100 orgs)
   - Uses cache when available
   - Good for most cases but less verified
3. Continue with steps 3-9 above

**💡 Pro Tip**: Use "Research All" for your first batch to ensure accuracy. Later batches can use "Find Missing" which leverages the cached results!
