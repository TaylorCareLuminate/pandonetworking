# Duplicates and Profile Pictures Fix

## Problems

1. **Duplicate Connections**: The "New Connections" section was showing the same people multiple times (e.g., Kathy Parker appeared 3 times)
2. **No Profile Pictures**: Connections and replies were only showing initials, not actual profile pictures like in `my_leads.html`

## Root Causes

### Duplicate Connections Issue

The deduplication logic wasn't actually working:

```javascript
// OLD CODE (Lines 2020-2022)
connections.sort((a, b) => b.timestamp - a.timestamp);
const uniqueConnections = connections.slice(0, 50); // ❌ Just slices, doesn't deduplicate!
```

This code just limited the array to 50 items but didn't remove duplicates. Since connections could come from both:
- Legacy `heyreach_contacts` collection
- Webhook `heyreach_activity` collection (CONNECTION_REQUEST_ACCEPTED events)

The same person could appear multiple times if they existed in both sources.

### Missing Profile Pictures

The connection and reply objects weren't capturing the `profilePicture` field from the data sources, and the HTML rendering only used initials.

## Solutions Implemented

### 1. Proper Deduplication for Connections (Lines 2024-2049)

**New approach:**
- Create a unique key for each connection based on LinkedIn URL (preferred) or name+company fallback
- Use a `Set` to track seen keys
- Only add connections with new keys

```javascript
// Sort by timestamp
connections.sort((a, b) => b.timestamp - a.timestamp);

// Remove duplicates based on LinkedIn URL or name+company combination
const seenKeys = new Set();
const uniqueConnections = [];

for (const connection of connections) {
    // Create a unique key for this connection
    let uniqueKey;
    if (connection.linkedInUrl) {
        // Normalize LinkedIn URL for matching
        uniqueKey = connection.linkedInUrl.toLowerCase().replace(/\/$/, '').split('?')[0];
    } else {
        // Fallback to name+company if no LinkedIn URL
        uniqueKey = `${connection.name.toLowerCase()}_${connection.company.toLowerCase()}`;
    }
    
    if (!seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        uniqueConnections.push(connection);
        
        // Limit to 50
        if (uniqueConnections.length >= 50) break;
    }
}
```

**Benefits:**
- Removes duplicates reliably using LinkedIn URL as primary identifier
- Falls back to name+company for cases without LinkedIn URL
- Normalizes URLs to handle trailing slashes and query parameters
- Preserves the most recent instance (since sorted by timestamp first)

### 2. Profile Pictures for Connections

**Data Capture (Lines 1951-1960, 2011-2018):**

```javascript
// From legacy heyreach_contacts
connections.push({
    name: data.contactName || data.fullName || 'Unknown',
    title: data.headline || data.position || '',
    company: data.company || data.companyName || '',
    timestamp: data.accepted_invite_at.toDate(),
    linkedInUrl: data.profileUrl || data.linkedin_url || '',
    profilePicture: data.imageUrl || data.profilePicture || ''  // ✅ NEW
});

// From webhook heyreach_activity
connections.push({
    name: leadName,
    title: data.leadPosition || '',
    company: data.leadCompany || '',
    timestamp: data.timestamp?.toDate() || new Date(),
    linkedInUrl: data.leadProfileUrl || '',
    profilePicture: data.leadProfilePicture || ''  // ✅ NEW
});
```

**HTML Rendering (Lines 2064-2073):**

```javascript
${connection.profilePicture ? 
    `<img src="${connection.profilePicture}" 
          alt="${escapeHtml(connection.name)}" 
          class="connection-avatar-img"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
     <div class="connection-avatar" style="display: none;">${getInitials(connection.name)}</div>` :
    `<div class="connection-avatar">${getInitials(connection.name)}</div>`
}
```

**CSS (Lines 490-498):**

```css
.connection-avatar-img {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    margin: 0 auto 15px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    display: block;
}
```

**Graceful Fallback:**
- If profile picture exists, show `<img>` with error handler
- If image fails to load (`onerror`), hide the image and show the initials fallback
- If no profile picture URL exists, show initials directly

### 3. Same Fixes for "Recent Replies" Section

Applied identical deduplication and profile picture logic to replies:

**Deduplication (Lines 1724-1749):**
```javascript
// Sort by timestamp
replies.sort((a, b) => b.timestamp - a.timestamp);

// Remove duplicates based on LinkedIn URL or name
const seenKeys = new Set();
const uniqueReplies = [];

for (const reply of replies) {
    let uniqueKey;
    if (reply.linkedInUrl) {
        uniqueKey = reply.linkedInUrl.toLowerCase().replace(/\/$/, '').split('?')[0];
    } else {
        uniqueKey = reply.name.toLowerCase();
    }
    
    if (!seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        uniqueReplies.push(reply);
        
        if (uniqueReplies.length >= 20) break;
    }
}
```

**Profile Pictures (Lines 1650-1657, 1711-1718, 1763-1773):**
- Added `profilePicture` field to reply objects from both legacy inbox and webhooks
- Updated HTML rendering to show images with initials fallback
- Added `.contact-avatar-img` CSS (Lines 372-378)

### 4. Enhanced Webhook Filtering

While fixing these issues, also improved webhook filtering consistency:

**Lines 1681, 1982:**
```javascript
if (data.bdrEmail) {
    webhookBdrEmail = data.bdrEmail.toLowerCase();  // ✅ Normalize to lowercase
}
```

**Lines 1697-1706, 1997-2007:**
```javascript
if (webhookBdrEmail) {
    const matchesPrimaryEmail = webhookBdrEmail === viewingUserEmail.toLowerCase();
    const matchesLinkedInEmail = webhookBdrEmail === accountEmail.toLowerCase();
    
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip webhooks that don't belong to this user
    }
} else {
    // No mapping found - skip this webhook  // ✅ Skip unmapped instead of showing all
    continue;
}
```

## Files Modified

- **`HealthLuminateSiteFromLocal/connect/index.html`**
  - Lines 1642-1660: Added profile pictures to legacy inbox replies
  - Lines 1673-1722: Enhanced webhook reply filtering and added profile pictures
  - Lines 1724-1749: Proper deduplication for replies (replaced slice with Set-based logic)
  - Lines 1763-1788: Updated reply HTML rendering to show profile pictures
  - Lines 372-378: Added CSS for `.contact-avatar-img`
  - Lines 1951-1960: Added profile pictures to legacy contact connections
  - Lines 1974-2022: Enhanced webhook connection filtering and added profile pictures
  - Lines 2024-2049: Proper deduplication for connections (replaced slice with Set-based logic)
  - Lines 2064-2082: Updated connection HTML rendering to show profile pictures
  - Lines 490-498: Added CSS for `.connection-avatar-img`

## Testing Instructions

1. **Hard refresh** the dashboard (Ctrl+Shift+R / Cmd+Shift+R)
2. **Check "New Connections" section:**
   - Verify no duplicate entries appear
   - Verify profile pictures show when available
   - Verify initials show as fallback when no picture available
3. **Check "Recent Replies" section:**
   - Verify no duplicate entries appear
   - Verify profile pictures show when available
   - Verify initials show as fallback when no picture available
4. **Test BDR switching:**
   - Switch to Derek Moore
   - Verify connections/replies only show his contacts (no mixing)
   - Verify no duplicates after switching

## Expected Results

### Before
- Kathy Parker appeared 3 times
- All contacts showed only initials (e.g., "KP", "MO")
- ~150+ raw connections reduced to just first 50 with many duplicates

### After
- Each person appears only once
- Profile pictures display when available (like in My Leads page)
- Initials show as graceful fallback when pictures unavailable or fail to load
- Properly filtered to selected BDR (no mixing of data)
- Maximum 50 unique connections, 20 unique replies

## Technical Notes

**Why LinkedIn URL is the primary deduplication key:**
- Most reliable unique identifier for a person
- Handles name changes, company changes, etc.
- Normalized to handle URL variations (trailing slash, query params, case)

**Fallback strategy:**
- If no LinkedIn URL: use `name_company` as key
- If name match fails: new entry is created (better to show than hide)

**Profile picture sources:**
- Legacy collections: `imageUrl`, `profilePicture`, `lead_profile_picture`
- Webhook collections: `leadProfilePicture`
- Multiple field names tried to maximize coverage

**Error handling:**
- `onerror` attribute on `<img>` tags hides failed images
- Fallback initials div shown on image failure
- No console errors from missing images













