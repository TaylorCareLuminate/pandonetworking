# Prospect Name Lookup Enhancement

## Date: November 12, 2025

## Summary
Enhanced `connect_review.html` to look up contact names and company information from the `prospect_contacts` collection (uploaded via `manage_my_linkedin_data.html`). This ensures names are displayed consistently, even when HeyReach data is unavailable.

---

## Problem
When reviewing messages in `connect_review.html`, contact names would sometimes not display because:
1. The message didn't have a valid `account_email` 
2. HeyReach didn't have contact data for that person
3. The contact info wasn't stored in the message data itself

Many of these contacts were actually uploaded as prospects via the "Prospect Contacts" feature in `manage_my_linkedin_data.html`, which contains their first name, last name, company, and other details.

---

## Solution
Added a new data source for contact information: the `prospect_contacts` collection.

### Data Priority Order
The system now checks multiple sources in priority order:

1. **HeyReach Contact Data** (highest priority)
   - Most complete information
   - Includes position, location, etc.

2. **Prospect Contact Data** (NEW - second priority)
   - From uploaded prospect lists
   - Contains: firstName, lastName, company, category
   - Matched by LinkedIn URL

3. **Message Data** (fallback)
   - Data stored directly in the message
   - Fields like `prospect_first_name`, `prospect_company`, etc.

---

## Technical Implementation

### New Global Variable
```javascript
let prospectContacts = {}; // Lookup for prospect data by LinkedIn URL
```

### New Function: `loadProspectContacts()`
Loads prospect contacts from Firestore for the current user:

```javascript
async function loadProspectContacts(userEmail) {
    // Query prospect_contacts collection by userEmail
    // Index prospects by normalized LinkedIn URL
    // Store firstName, lastName, company, category, etc.
}
```

**Key Features:**
- Filters by `userEmail` field
- Normalizes LinkedIn URLs for consistent matching
- Creates fast lookup dictionary indexed by URL
- Handles errors gracefully (returns empty object)

### Updated: `displayCurrentMessage()`
Enhanced contact info lookup logic:

```javascript
// 1. Try HeyReach contact data (highest priority)
if (contact) {
    firstName = contact.firstName || ...
    company = contact.company || ...
}

// 2. Try prospect data (NEW - second priority)
if (!firstName && !lastName && prospectData) {
    firstName = prospectData.firstName || '';
    lastName = prospectData.lastName || '';
    console.log(`✅ Using prospect data for name: ${firstName} ${lastName}`);
}
if (!company && prospectData) {
    company = prospectData.company || '';
}

// 3. Fallback: Try message data itself
if (!firstName && !lastName) {
    firstName = message.prospect_first_name || ...
}
```

### Initialization Changes

#### On Page Load (Both Admin & Customer)
```javascript
// Load prospect contacts for current user
await loadProspectContacts(user.email);
```

#### When Admin Changes BDR Selection
```javascript
// Reload prospect contacts for selected BDR
if (currentReviewingEmail) {
    await loadProspectContacts(currentReviewingEmail);
}
```

---

## Data Flow Example

### Example 1: Prospect from Upload
1. User uploads prospect list with:
   - First Name: "Sarah"
   - Last Name: "Johnson"
   - Company: "TechCorp"
   - LinkedIn URL: "linkedin.com/in/sarahjohnson"

2. Message created for this prospect in `connect_queue`
   - Has `prospect_li_url`: "https://www.linkedin.com/in/sarahjohnson/"
   - No name stored in message itself

3. When reviewing in `connect_review.html`:
   - HeyReach data: Not found (no conversation yet)
   - **Prospect data: FOUND! ✅**
     - Name: "Sarah Johnson"
     - Company: "TechCorp"
   - Displays: **Sarah Johnson** from TechCorp

### Example 2: Multiple Sources Available
1. Contact exists in all three sources
2. HeyReach has most complete data (position, location)
3. System uses HeyReach data (highest priority)
4. Prospect data available as backup

### Example 3: No Data Anywhere
1. No HeyReach contact
2. No prospect upload
3. No data in message
4. Displays: **"View Profile"** (LinkedIn link still works)

---

## Benefits

### ✅ Improved Name Display
- Names now show consistently for uploaded prospects
- Reduces "View Profile" placeholders
- Better user experience when reviewing messages

### ✅ Better Data Utilization
- Leverages existing prospect upload feature
- No duplicate data entry needed
- Connects two parts of the system seamlessly

### ✅ Graceful Degradation
- Falls back through multiple sources
- Always tries to find the best available data
- Never breaks if one source is unavailable

### ✅ Performance
- Fast dictionary lookup by URL
- Data loaded once at initialization
- Minimal overhead per message

---

## Console Logging
When prospect data is used, you'll see:
```
✅ Using prospect data for name: Sarah Johnson
```

When loading prospects:
```
📋 Loading prospect contacts for: user@example.com
✅ Loaded 47 prospect contacts
```

---

## Testing Recommendations

1. **Upload Prospect Contacts**
   - Go to `manage_my_linkedin_data.html`
   - Upload a CSV with prospect contacts
   - Note their LinkedIn URLs

2. **Create Messages for Prospects**
   - Ensure `connect_queue` has messages for those LinkedIn URLs
   - Messages should reference the same URLs

3. **Review Messages**
   - Go to `connect_review.html`
   - Review messages for those prospects
   - Names should display correctly

4. **Test Different Scenarios**
   - Prospect with HeyReach data (should use HeyReach)
   - Prospect without HeyReach data (should use prospect data)
   - Contact not in prospects (should fall back to message data or "View Profile")

---

## Related Collections

### `prospect_contacts`
Fields used:
- `userEmail` - Filter field (who uploaded)
- `linkedInUrl` - Lookup key
- `linkedInUrlNormalized` - Normalized URL for matching
- `firstName` - Name display
- `lastName` - Name display
- `company` - Company display
- `category` - Additional context
- `connectionStatus` - Shows if already connected

---

## Future Enhancements

Potential improvements:
1. **Job Title from Prospects**: Add position/title field to prospect uploads
2. **Company Domain Matching**: Match by company domain as fallback
3. **Fuzzy Name Matching**: Match by name similarity if URL doesn't match exactly
4. **Show Data Source**: Display indicator showing which source provided the name
5. **Update Prospects from HeyReach**: Sync prospect status when conversations exist














