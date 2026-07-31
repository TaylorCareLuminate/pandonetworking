# Sent Messages - Switched to Webhook Data

## Problem

Sent messages (connection requests/messages sent to leads) were not appearing on the dashboard. The `connect_activity` collection appeared to be empty or not functioning properly.

## Solution

**Switched from `connect_activity` collection to webhook data** - exactly the same approach we use for replies and connections!

### What Changed

**BEFORE:**
- Queried `connect_activity` collection
- Looked for `actionType: 'push_to_heyreach'`
- Filtered by `bdrEmail`, `userEmail`, etc.
- ❌ Collection was empty or data wasn't being written

**AFTER:**
- Query `heyreach_activity` collection (same as replies/connections)
- Look for `eventType: 'MESSAGE_SENT'`
- Filter using **same logic** as replies/connections:
  - LinkedIn Account ID mapping
  - LinkedIn URL mapping
  - Direct `bdrEmail` field
- ✅ Uses the reliable webhook infrastructure

## Implementation Details

### Query for Sent Messages (Lines 1027-1143)

```javascript
// Get messages sent from WEBHOOKS (same as replies/connections)
console.log('🔍 Querying heyreach_activity for sent messages (webhooks)...');

const webhookSentQuery = query(
    collection(emailDB, 'heyreach_activity'),
    where('eventType', '==', 'MESSAGE_SENT'),
    where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
    orderBy('timestamp', 'desc'),
    limit(100)
);
const webhookSentSnapshot = await getDocs(webhookSentQuery);
```

### Filtering Logic (Lines 1062-1120)

**Identical to replies/connections filtering:**

```javascript
// FILTER: Check if this webhook belongs to the viewing user
let webhookBdrEmail = null;

// Method 1: Direct bdrEmail field (if exists)
if (data.bdrEmail) {
    webhookBdrEmail = data.bdrEmail.toLowerCase();
}
// Method 2: linkedInAccountId mapping
else if (data.linkedInAccountId && linkedInAccountIdMapping.has(data.linkedInAccountId)) {
    webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
}
// Method 3: LinkedIn URL mapping
else if (data.rawData?.sender?.profile_url) {
    const normalizedUrl = data.rawData.sender.profile_url.toLowerCase().replace(/\/$/, '');
    if (linkedInUrlMapping.has(normalizedUrl)) {
        webhookBdrEmail = linkedInUrlMapping.get(normalizedUrl);
    }
}

// Apply filtering
if (webhookBdrEmail) {
    const matchesPrimaryEmail = webhookBdrEmail === viewingUserEmail.toLowerCase();
    const matchesLinkedInEmail = webhookBdrEmail === accountEmail.toLowerCase();
    
    if (matchesPrimaryEmail || matchesLinkedInEmail) {
        matchingMessages++;
        // Add to activities array
    }
} else {
    // Skip - no mapping found
}
```

### Data Extraction (Lines 1092-1102)

```javascript
const leadName = `${data.leadFirstName || ''} ${data.leadLastName || ''}`.trim() || 'Unknown';
const messageText = data.eventData?.message || data.eventData?.messageText || 'Message sent';

activities.push({
    type: 'message-sent',
    name: leadName,
    title: data.leadPosition || '',
    message: messageText,
    timestamp: data.timestamp?.toDate() || new Date(),
    icon: 'fa-paper-plane'
});
```

### Error Handling (Lines 1126-1143)

If `MESSAGE_SENT` event type doesn't exist, the code:
1. Catches the error
2. Logs a helpful message
3. **Automatically discovers what event types DO exist** in the collection

```javascript
} catch (webhookError) {
    console.error('❌ Error loading MESSAGE_SENT webhooks:', webhookError);
    console.error('   This might mean MESSAGE_SENT events don\'t exist in heyreach_activity');
    
    // Try to find what event types DO exist
    const sampleQuery = query(
        collection(emailDB, 'heyreach_activity'),
        limit(20)
    );
    const sampleSnapshot = await getDocs(sampleQuery);
    const eventTypes = new Set();
    sampleSnapshot.docs.forEach(doc => {
        const type = doc.data().eventType;
        if (type) eventTypes.add(type);
    });
    console.log('   Available event types in heyreach_activity:', Array.from(eventTypes));
}
```

## Benefits

✅ **Consistency** - All activity data now comes from webhooks
✅ **Reliable** - Uses the same proven infrastructure as replies/connections
✅ **No duplicate code** - Same filtering logic across all event types
✅ **Self-diagnosing** - If `MESSAGE_SENT` doesn't exist, shows what event types are available
✅ **Future-proof** - Easy to add more event types using the same pattern

## Webhook Event Types

The dashboard now uses these event types from `heyreach_activity`:

| Event Type | Section | Status |
|------------|---------|--------|
| `MESSAGE_SENT` | Sent Messages | ✅ Now implemented |
| `MESSAGE_REPLY_RECEIVED` | Recent Replies | ✅ Already working |
| `CONNECTION_REQUEST_ACCEPTED` | New Connections | ✅ Already working |

## Testing Instructions

**Please refresh the dashboard** (Ctrl+Shift+R) and check the console:

### If MESSAGE_SENT exists:
```
🔍 Querying heyreach_activity for sent messages (webhooks)...
📦 Found X MESSAGE_SENT webhook events (before filtering)
🔍 DEBUG - Sample MESSAGE_SENT webhook 1: {...}
   ✅ MATCHED sent message to [Lead Name]
✅ Matched Y sent message activities for [email]
```

### If MESSAGE_SENT doesn't exist:
```
❌ Error loading MESSAGE_SENT webhooks: [error]
   This might mean MESSAGE_SENT events don't exist in heyreach_activity
   Will check for other event types...
   Available event types in heyreach_activity: ["MESSAGE_REPLY_RECEIVED", "CONNECTION_REQUEST_ACCEPTED", ...]
```

**If we see the second scenario**, we'll know exactly what event type to use instead (might be `MESSAGE_CREATED`, `OUTBOUND_MESSAGE`, etc.).

## Files Modified

- **`HealthLuminateSiteFromLocal/connect/index.html`**
  - Lines 1027-1143: Completely replaced `connect_activity` query with `MESSAGE_SENT` webhook query
  - Removed all references to `connect_activity` collection
  - Removed all references to `actionType: 'push_to_heyreach'`
  - Added error handling to discover available event types

## Related Fixes

This completes the webhook migration:
- ✅ **Connections** - Using `CONNECTION_REQUEST_ACCEPTED` webhooks
- ✅ **Replies** - Using `MESSAGE_REPLY_RECEIVED` webhooks
- ✅ **Sent Messages** - Now using `MESSAGE_SENT` webhooks (this fix)
- ✅ **Meeting Requests** - Using `linkedInAccountId` filtering from `heyreach_inbox`

All sections now use the modern webhook infrastructure with consistent filtering!

## Next Steps

After refresh, if the console shows:
1. **"Found X MESSAGE_SENT webhook events"** → ✅ It's working! Check if sent messages appear
2. **"Available event types: [...]"** → We'll use the correct event type from that list
3. **No sent messages showing** → We'll check the filtering logic with the debug logs

The error handling will guide us to the solution! 🎯













