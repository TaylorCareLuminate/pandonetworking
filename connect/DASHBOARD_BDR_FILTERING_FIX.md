# Dashboard BDR Filtering & Meeting Requests Fix

**Date:** November 13, 2025  
**File:** `connect/index.html`

## Issues Fixed

### 1. BDR Filtering Not Working
**Problem:** When an admin selected a specific BDR from the dropdown, the dashboard was showing activity from ALL BDRs instead of just the selected one.

**Root Cause:**
- Webhook data in `heyreach_activity` collection only contained `linkedInAccountId` and `accountName`
- No `bdrEmail` or `accountEmail` field existed in webhook documents
- Queries fetched ALL webhook events without user filtering
- The filtering logic only worked for legacy data, not webhook data

**Solution:**
1. Added `linkedInAccountIdMapping` Map to store the mapping from HeyReach Account ID → BDR Email
2. Created `loadLinkedInAccountIdMapping()` function to load data from `linkedin_accounts` collection
3. Updated all webhook queries to:
   - Fetch more results (increased limit from 20-50 to 100-200)
   - Filter results client-side based on `linkedInAccountId` mapping
   - Check if webhook belongs to the viewing user before adding to results

**Code Changes:**
```javascript
// Load LinkedIn account ID mappings
const linkedInAccountIdMapping = new Map(); // Map LinkedIn account ID -> BDR email

async function loadLinkedInAccountIdMapping() {
    const linkedInAccountsRef = collection(emailDB, 'linkedin_accounts');
    const linkedInAccountsSnapshot = await getDocs(linkedInAccountsRef);
    
    linkedInAccountsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.heyreachAccountId && data.bdrEmail) {
            linkedInAccountIdMapping.set(data.heyreachAccountId, data.bdrEmail);
        }
    });
}

// In webhook queries - filter results
for (const doc of webhookSnapshot.docs) {
    const data = doc.data();
    
    // FILTER: Check if this webhook belongs to the viewing user
    const webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
    const matchesPrimaryEmail = webhookBdrEmail === viewingUserEmail;
    const matchesLinkedInEmail = webhookBdrEmail === accountEmail;
    
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip webhooks that don't belong to this user
    }
    
    // ... process webhook data ...
}
```

**Sections Updated:**
- Activity Feed → MESSAGE_REPLY_RECEIVED webhooks
- Activity Feed → CONNECTION_REQUEST_ACCEPTED webhooks
- Recent Replies → MESSAGE_REPLY_RECEIVED webhooks
- New Connections → CONNECTION_REQUEST_ACCEPTED webhooks

---

### 2. Meeting Requests Not Showing
**Problem:** The "Meeting Requests" section was completely empty with no error messages or helpful information.

**Root Cause:**
- The `heyreach_inbox` collection was empty (0 documents)
- Meeting willingness detection depends on conversation data from inbox sync
- The inbox sync had not been run yet
- No helpful error message was shown to explain why data was missing

**Solution:**
1. Added comprehensive logging to the `loadMeetingRequests()` function
2. Added check to detect if `heyreach_inbox` collection is empty
3. Display informative message when collection is empty:
   - "Meeting requests will appear here once LinkedIn conversations are synced"
   - Explains that inbox sync needs to be run
4. Added better error handling with error message display
5. Added logging for each query attempt (account_email, accountEmail, bdrEmail)

**Code Changes:**
```javascript
async function loadMeetingRequests() {
    console.log('📅 Loading meeting requests...');
    
    // Check if heyreach_inbox collection has ANY documents
    const sampleInboxQuery = query(
        collection(emailDB, 'heyreach_inbox'),
        limit(1)
    );
    const sampleInboxSnapshot = await getDocs(sampleInboxQuery);
    
    if (sampleInboxSnapshot.empty) {
        console.warn('⚠️ heyreach_inbox collection is EMPTY - no conversation data available');
        console.warn('   This means LinkedIn inbox sync has not been run yet');
        
        meetingsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-info-circle"></i>
                <p>Meeting requests will appear here once LinkedIn conversations are synced</p>
                <p style="font-size: 0.8rem; color: #999; margin-top: 10px;">
                    The inbox sync needs to be run to detect meeting willingness from conversations
                </p>
            </div>
        `;
        return;
    }
    
    // ... continue with queries ...
}
```

**Improved User Experience:**
- Clear explanation of why no data is shown
- Helpful guidance on what needs to happen (inbox sync)
- Better error messages with specific error details
- Console logging for debugging

---

## Testing Instructions

### Test 1: BDR Filtering
1. Log in as an admin (healthluminate.com or careluminate.com domain)
2. Admin selector dropdown should appear at top of dashboard
3. Select a specific BDR from dropdown
4. Console should show:
   - `🔗 Loading LinkedIn account ID mappings...`
   - `✅ Loaded X LinkedIn account ID mappings`
   - `📦 Found Y webhook reply events (before filtering)`
   - `✅ Matched Z reply activities from webhooks (after user filtering)`
5. Verify only activities for selected BDR are shown
6. Check all sections: Activity Feed, Recent Replies, New Connections

### Test 2: Meeting Requests with Empty Collection
1. Open console and look for meeting requests logs
2. Should see:
   - `📅 Loading meeting requests...`
   - `⚠️ heyreach_inbox collection is EMPTY - no conversation data available`
3. Meeting Requests section should show informative message
4. Counts should show "0"

### Test 3: Meeting Requests with Data (After Inbox Sync)
1. Run inbox sync on backend: `/heyreach/inbox/sync`
2. Run conversation analysis: `/heyreach/inbox/analyze`
3. Reload dashboard
4. Should see meetings if any contacts expressed willingness
5. Console should show query results for each field attempt

---

## Backend Requirements

For these fixes to work properly, the backend needs:

1. **`linkedin_accounts` collection** must have documents with:
   - `heyreachAccountId`: The HeyReach LinkedIn account ID
   - `bdrEmail`: The BDR's email address

2. **`heyreach_activity` collection** webhook documents must have:
   - `linkedInAccountId`: The HeyReach LinkedIn account ID
   - `eventType`: 'MESSAGE_REPLY_RECEIVED' or 'CONNECTION_REQUEST_ACCEPTED'
   - `timestamp`: Date of event
   - Lead information (leadFirstName, leadLastName, etc.)

3. **`heyreach_inbox` collection** for meeting requests must have:
   - `account_email` or `accountEmail` or `bdrEmail`: BDR identifier
   - `willingToMeet`: Boolean flag
   - `meetingWillingnessDate`: Timestamp
   - `lead_name`: Contact name
   - `messages`: Array of conversation messages

---

## Console Output Examples

### Successful BDR Filtering
```
🔗 Loading LinkedIn account ID mappings...
  🔗 HeyReach Account ID 12345 → taylordavis@careluminate.com
  🔗 HeyReach Account ID 67890 → derek.Moore@keybenefit.com
✅ Loaded 2 LinkedIn account ID mappings
📦 Found 50 webhook reply events (before filtering)
✅ Matched 11 reply activities from webhooks (after user filtering)
```

### Meeting Requests - Empty Collection
```
📅 Loading meeting requests...
   Looking for account_email: taylordavis@careluminate.com
   Viewing user: taylordavis@careluminate.com
⚠️ heyreach_inbox collection is EMPTY - no conversation data available
   This means LinkedIn inbox sync has not been run yet
   Meeting willingness detection requires conversation data from heyreach_inbox
```

### Meeting Requests - With Data
```
📅 Loading meeting requests...
   Looking for account_email: taylordavis@careluminate.com
✅ heyreach_inbox collection has data, querying for meeting willingness...
   Found 3 meetings with account_email
✅ Found 3 meeting requests
```

---

## Summary

✅ **BDR Filtering Fixed:**
- Added LinkedIn Account ID → BDR Email mapping
- Client-side filtering of webhook data
- Now correctly shows only the selected BDR's activities

✅ **Meeting Requests Fixed:**
- Added empty collection detection
- Informative user messages
- Better error handling and logging
- Clear guidance on what's needed (inbox sync)

Both issues are now resolved with comprehensive logging and user-friendly error messages.













