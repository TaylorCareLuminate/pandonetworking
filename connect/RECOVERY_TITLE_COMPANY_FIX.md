# Recovery Message Title/Company Enrichment Fix

**Date:** 2026-01-14  
**Issue:** Recovered messages showing "Unknown Position at Unknown Company" in `fast_connect_review.html`

## 🐛 **The Problem**

Messages recovered from `scrapped_linkedin_posts` were missing the `contactTitle` and `contactCompany` fields, causing them to display as "Unknown Position at Unknown Company" in the review interface.

The `scrapped_linkedin_posts` collection only stores:
- `authorName` (full name)
- `authorProfileUrl` (LinkedIn URL)
- `postText`, `postUrl`, etc.

It does NOT store the author's title or company directly.

## ✅ **The Solution**

We implemented **database enrichment** in both:
1. **Recovery endpoint** (`/api/connect/recover-worthy-posts`) - for NEW recovered messages
2. **Migration endpoint** (`/api/connect/migrate-recovered-messages`) - for EXISTING recovered messages

### How It Works

When recovering or migrating a message, the system:

1. **Gets the LinkedIn profile URL** from the post (`authorProfileUrl`)

2. **Normalizes the URL** for matching:
   ```javascript
   // Removes protocol, www, trailing slash
   // https://www.linkedin.com/in/john-doe/ → linkedin.com/in/john-doe
   ```

3. **Queries `heyreach_contacts` first**:
   - Filters by `accountEmail` (BDR's LinkedIn email)
   - Loops through results, normalizing each `profileUrl`
   - Matches normalized URLs
   - Extracts `position`/`headline` → `contactTitle`
   - Extracts `company`/`companyName` → `contactCompany`

4. **Falls back to `prospect_contacts` if needed**:
   - Scans all prospects (no account filter)
   - Same normalized URL matching
   - Extracts `jobTitle`/`title` → `contactTitle`
   - Extracts `company` → `contactCompany`

5. **Saves ALL field variants** for maximum compatibility:
   ```javascript
   {
     contactTitle: "VP of Sales",         // ✅ Preferred (camelCase)
     contact_title: "VP of Sales",        // Legacy (snake_case)
     prospect_title: "VP of Sales",       // Alternative
     prospect_position: "VP of Sales",    // Alternative
     
     contactCompany: "Acme Corp",         // ✅ Preferred (camelCase)
     company: "Acme Corp",                // Legacy
     company_name: "Acme Corp",           // Alternative
     prospect_company: "Acme Corp"        // Alternative
   }
   ```

## 🔧 **What Was Changed**

### 1. Recovery Endpoint (`server.js` lines 26903-26970)

**Before:**
```javascript
// Only saved prospect_name (full name)
// No title or company enrichment
```

**After:**
```javascript
// 🆕 ENRICH: Look up title/company from heyreach_contacts or prospect_contacts
let authorTitle = '';
let authorCompany = '';

if (profileUrl) {
  // Normalize URL for matching
  const normalizeUrl = (url) => { ... };
  const normalizedProfileUrl = normalizeUrl(profileUrl);
  
  // Query heyreach_contacts with normalized URL matching
  const contactSnapshot = await admin.firestore().collection('heyreach_contacts')
    .where('accountEmail', '==', bdrLinkedInEmail)
    .get();
  
  // Loop and match normalized URLs
  for (const doc of contactSnapshot.docs) {
    const contactUrl = normalizeUrl(doc.data().profileUrl || '');
    if (contactUrl === normalizedProfileUrl) {
      authorTitle = doc.data().position || doc.data().headline || '';
      authorCompany = doc.data().company || doc.data().companyName || '';
      break;
    }
  }
  
  // Fall back to prospect_contacts if still empty
  // ... similar logic ...
}

// Save all field variants
await admin.firestore().collection('connect_queue').add({
  contactTitle: authorTitle,
  contact_title: authorTitle,
  prospect_title: authorTitle,
  prospect_position: authorTitle,
  contactCompany: authorCompany,
  company: authorCompany,
  company_name: authorCompany,
  prospect_company: authorCompany,
  // ... other fields ...
});
```

### 2. Migration Endpoint (`server.js` lines 27282-27373)

**Before:**
```javascript
// Only used fields already in message (usually empty)
const title = data.prospect_title || data.authorTitle || '';
const company = data.prospect_company || data.authorCompany || '';
```

**After:**
```javascript
// 🆕 ENRICH from database if missing!
if ((!data.contactTitle && !data.contact_title) || 
    (!data.contactCompany && !data.company_name)) {
  
  const profileUrl = data.prospect_li_url || data.linkedin_url;
  
  if (profileUrl) {
    // Same enrichment logic as recovery endpoint
    // 1. Normalize URLs
    // 2. Query heyreach_contacts
    // 3. Fall back to prospect_contacts
    // 4. Save all field variants
  }
}
```

## 📊 **Fields Populated**

After enrichment, messages have:

| Field | Source Priority | Format |
|-------|----------------|--------|
| `contactTitle` | `position` → `headline` → `jobTitle` → `title` | String |
| `contact_title` | Same as above | String |
| `prospect_title` | Same as above | String |
| `prospect_position` | Same as above | String |
| `contactCompany` | `company` → `companyName` | String |
| `company` | Same as above | String |
| `company_name` | Same as above | String |
| `prospect_company` | Same as above | String |

## 🎯 **What `fast_connect_review.html` Expects**

Line 1928-1929 in `fast_connect_review.html`:
```javascript
const company = message.contactCompany || message.prospect_company || 
                message.company || 'Unknown Company';
const position = message.contactTitle || message.prospect_position || 
                 message.position || message.title || 'Unknown Position';
```

✅ **Now all these fallbacks will succeed!**

## 🚀 **How to Use**

### For NEW Messages (Recovery)
1. Go to `generate_messages.html`
2. Select a BDR
3. Click "Test Recovery (5 messages)" or "Recover ALL Messages"
4. **New messages will automatically be enriched with title/company**

### For EXISTING Messages (Migration)
1. Go to `fix_recovered_messages.html`
2. Click "Run Migration"
3. **Existing messages will be scanned and enriched where missing**
4. Check results in the UI

### Verify in `fast_connect_review.html`
1. Select the BDR
2. Load messages
3. **Should now see real titles and companies** instead of "Unknown"

## 🔍 **Debugging**

If title/company is still missing:

1. **Check Railway logs** for enrichment messages:
   ```
   📇 Enriched from heyreach_contacts: VP of Sales at Acme Corp
   ```
   OR
   ```
   📇 Enriched from prospect_contacts: VP of Sales at Acme Corp
   ```

2. **Verify the profile URL exists in the database:**
   - Check `heyreach_contacts.profileUrl`
   - Check `prospect_contacts.linkedInUrl`

3. **Check URL normalization** - the system normalizes:
   - `https://www.linkedin.com/in/john-doe/`
   - `http://linkedin.com/in/john-doe`
   - `www.linkedin.com/in/john-doe/`
   
   All become: `linkedin.com/in/john-doe`

4. **Check if BDR association is correct:**
   - Recovery uses `accountEmail` filter for `heyreach_contacts`
   - Must match the BDR's LinkedIn email

## 📝 **Related Files**

- `RailwayCLemail/server.js` (lines 26903-26970) - Recovery enrichment
- `RailwayCLemail/server.js` (lines 27282-27373) - Migration enrichment
- `HealthLuminateSiteFromLocal/connect/fast_connect_review.html` (lines 1924-1929) - Display logic
- `HealthLuminateSiteFromLocal/connect/generate_messages.html` - Recovery UI
- `HealthLuminateSiteFromLocal/connect/fix_recovered_messages.html` - Migration UI

## ✅ **Success Criteria**

✅ New recovered messages have title/company populated  
✅ Existing recovered messages can be enriched via migration  
✅ `fast_connect_review.html` shows real titles/companies  
✅ Works for both `heyreach_contacts` and `prospect_contacts`  
✅ URL normalization handles format differences  
✅ All field variants populated for compatibility

---

**Status:** ✅ **COMPLETE** - Both recovery and migration endpoints now enrich title/company from database
