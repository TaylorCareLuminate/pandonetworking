# KBA Campaign Troubleshooting Guide

## Issue
Campaign "KBA DTE LinkedIn Connect and Message" is not adding leads to HeyReach, even though:
- The request succeeds (HTTP 200)
- Account ID, List ID, and Campaign ID are all correct
- Leads are NOT duplicates (verified only 2 leads in list)
- Other campaigns work fine

## Key Difference Between Working vs. Non-Working

### ✅ WORKING Campaign (Hiring Sales Currently)
```json
"fallbackResults": {
  "status": 200,
  "data": 1,  // ← Lead successfully added to list!
}
```

### ❌ NOT WORKING Campaign (KBA DTE)
```json
"fallbackResults": {
  "status": 200,
  "data": 0,  // ← HeyReach rejected the lead
}
```

## 🔍 Diagnostic Steps - Run Now

1. **Open LinkedIn Manager**: `HealthLuminateSite/crm/linkedin_manager.html`

2. **Filter to KBA Campaign**:
   - Customer: Key Benefit Administrators
   - Campaign: KBA DTE LinkedIn Connect and Message

3. **Click "Diagnose HeyReach Config"** button (new orange button)
   - This will automatically check:
     - Campaign status in HeyReach (active/paused?)
     - List ID matches
     - Account ID matches
     - Campaign configuration issues

4. **Review diagnostic results** and follow recommendations

## Most Likely Causes (Based on Research)

### 1. Leads Exist in OTHER Campaigns ⚠️ (MOST LIKELY)
HeyReach **prevents the same lead across multiple campaigns** on the same LinkedIn account.

**Check:**
- Search for "Brandy Moore" or "Alfred Lumsdaine" in **ALL campaigns** using Account 104986
- They might be in a different campaign, not just list 355727
- In HeyReach, go to Accounts → Account 104986 → View all leads

### 2. Campaign-List Not Linked Properly
The campaign might not be configured to accept leads from this list.

**Check:**
- Go to HeyReach campaign 224229
- Edit campaign settings
- Verify "Lead Source" or "List" field points to list 355727
- Some campaigns need explicit list linking

### 3. Campaign Status Issues
**Check:**
- Is campaign 224229 active/running in HeyReach?
- Has it reached daily action limits?
- Is it paused or stopped?

### 4. Connection Degree Mismatch
Campaign might have connection degree restrictions.

**Check:**
- Campaign settings → First action settings
- If campaign is set for 1st degree connections only, it won't accept 2nd/3rd degree
- If set for 2nd/3rd degree, won't accept 1st degree

## 🎯 Recommended Actions

### Option A: Use Diagnostic Tool (Easiest)
1. Run **"Diagnose HeyReach Config"** button
2. Follow the specific recommendations it provides
3. Report back what issues it found

### Option B: Manual Check in HeyReach
1. Log into HeyReach: https://app.heyreach.io
2. Go to Campaigns → Find campaign 224229
3. Check:
   - ✅ Campaign status (should be "Active")
   - ✅ Lead source/list (should be 355727)
   - ✅ First action settings (check connection degree)
   - ✅ Daily limits (check if maxed out)

4. Go to Lists → List 355727
   - Check if it has any restrictions
   - Check capacity limits
   - Check if it's linked to campaign 224229

5. Search ALL leads across account 104986
   - Search for: brandy.moore@christushealth.org
   - Search for: alfred.lumsdaine@ardenthealth.com
   - See if they exist in OTHER campaigns

### Option C: Test with Different Campaign
Create a new test campaign in HeyReach:
1. Create new campaign with list 355727
2. Try adding same leads through LinkedIn Manager
3. If it works → issue is with campaign 224229 configuration
4. If it fails → issue is with list 355727 or account 104986

## Technical Details for Reference

### Working Campaign (Hiring Sales Currently)
- Campaign ID: 218952
- Account ID: 104063
- List ID: 346695
- Status: ✅ Leads being added successfully

### Failing Campaign (KBA DTE)
- Campaign ID: 224229
- Account ID: 104986  
- List ID: 355727
- Status: ❌ Leads rejected (fallback returns 0)

### Sample Lead Data
```json
{
  "firstName": "Brandy",
  "lastName": "",
  "company": "CHRISTUS Health",
  "linkedinUrl": "https://www.linkedin.com/in/brandy-moore-5834537",
  "email": "brandy.moore@christushealth.org",
  "position": ""
}
```

## What I've Ruled Out
✅ Not a duplicate issue (only 2 leads in list, verified)
✅ Not a configuration issue in our system (IDs are correct)
✅ Not an API error (HTTP 200 success)
✅ Not a missing email issue (email is provided)
✅ Not an account/list ID issue (they're being passed correctly)

## Next Steps
1. **Run the diagnostic tool first** - it will tell you exactly what's wrong
2. If diagnostic shows no issues, check for duplicates across **all campaigns**
3. If still no luck, check campaign settings in HeyReach
4. Last resort: Contact HeyReach support with campaign ID 224229

---

**Campaign Details:**
- Customer: Key Benefit Administrators
- Campaign: KBA DTE LinkedIn Connect and Message
- HeyReach Campaign ID: 224229
- HeyReach List ID: 355727
- HeyReach Account ID: 104986





