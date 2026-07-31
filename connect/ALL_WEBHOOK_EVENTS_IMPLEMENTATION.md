# All Webhook Events Implementation

## Summary

Expanded the dashboard to display **ALL** activity types from `heyreach_activity` webhooks (except `CAMPAIGN_COMPLETED`), providing a complete view of all LinkedIn outreach activities.

## Supported Event Types

### Outbound Activities (Sent to Live Activity Feed)

| Event Type | Activity Type | Icon | Display Message | Status |
|------------|---------------|------|-----------------|--------|
| `MESSAGE_SENT` | message-sent | 📧 fa-paper-plane | Actual message text | ✅ Implemented |
| `CONNECTION_REQUEST_SENT` | connection-request-sent | 👤 fa-user-plus | Connection message | ✅ Implemented |
| `VIEWED_PROFILE` | profile-viewed | 👁️ fa-eye | "Viewed profile" | ✅ Implemented |
| `LIKED_POST` | post-liked | 👍 fa-thumbs-up | "Liked a post" | ✅ Implemented |
| `INMAIL_SENT` | inmail-sent | ✉️ fa-envelope | InMail body | ✅ Implemented |

### Inbound Activities (Replies & Connections Sections)

| Event Type | Section | Status |
|------------|---------|--------|
| `MESSAGE_REPLY_RECEIVED` | Recent Replies | ✅ Already working |
| `INMAIL_REPLY_RECEIVED` | Recent Replies | ✅ Now included |
| `CONNECTION_REQUEST_ACCEPTED` | New Connections | ✅ Already working |

### Excluded Event Type

| Event Type | Reason for Exclusion |
|------------|---------------------|
| `CAMPAIGN_COMPLETED` | System event, not user activity |

## Implementation Details

### 1. Live Activity Feed - All Outbound Events (Lines 1027-1189)

**Query Strategy:**
```javascript
// Query for all events in past 24 hours
const webhookSentQuery = query(
    collection(emailDB, 'heyreach_activity'),
    where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
    orderBy('timestamp', 'desc'),
    limit(200)
);
```

**Filtering & Processing:**
```javascript
for (const doc of webhookSentSnapshot.docs) {
    const data = doc.data();
    
    // Skip excluded events
    if (data.eventType === 'CAMPAIGN_COMPLETED') {
        continue;
    }
    
    // Only process target event types
    const eventTypes = ['MESSAGE_SENT', 'CONNECTION_REQUEST_SENT', 'VIEWED_PROFILE', 'LIKED_POST', 'INMAIL_SENT'];
    if (!eventTypes.includes(data.eventType)) {
        continue;
    }
    
    // Filter by BDR using linkedInAccountId mapping or bdrEmail
    let webhookBdrEmail = null;
    if (data.bdrEmail) {
        webhookBdrEmail = data.bdrEmail.toLowerCase();
    } else if (data.linkedInAccountId && linkedInAccountIdMapping.has(data.linkedInAccountId)) {
        webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
    }
    
    // Match against viewing user
    if (webhookBdrEmail === accountEmail.toLowerCase()) {
        // Determine message and icon based on event type
        switch (data.eventType) {
            case 'MESSAGE_SENT':
                message = data.eventData?.messageText || 'Message sent';
                icon = 'fa-paper-plane';
                break;
            case 'CONNECTION_REQUEST_SENT':
                message = data.eventData?.connectionMessage || 'Connection request sent';
                icon = 'fa-user-plus';
                break;
            case 'VIEWED_PROFILE':
                message = 'Viewed profile';
                icon = 'fa-eye';
                break;
            case 'LIKED_POST':
                message = 'Liked a post';
                icon = 'fa-thumbs-up';
                break;
            case 'INMAIL_SENT':
                message = data.eventData?.inmailBody || 'InMail sent';
                icon = 'fa-envelope';
                break;
        }
        
        activities.push({
            type: activityType,
            name: leadName,
            title: data.leadPosition,
            message: message,
            timestamp: data.timestamp?.toDate(),
            icon: icon
        });
    }
}
```

### 2. Recent Replies - Added InMail Replies (Lines 1311-1329, 1757-1773)

**Activity Feed Section:**
```javascript
// Get all reply types (MESSAGE_REPLY_RECEIVED + INMAIL_REPLY_RECEIVED)
const webhookRepliesQuery = query(
    collection(emailDB, 'heyreach_activity'),
    where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
    orderBy('timestamp', 'desc'),
    limit(200)
);
const allRepliesSnapshot = await getDocs(webhookRepliesQuery);

// Filter to only reply events
const webhookRepliesSnapshot = {
    docs: allRepliesSnapshot.docs.filter(doc => {
        const type = doc.data().eventType;
        return type === 'MESSAGE_REPLY_RECEIVED' || type === 'INMAIL_REPLY_RECEIVED';
    })
};
```

**Recent Replies Section:**
Same filtering approach applied to the dedicated "Recent Replies" section for 30-day data.

### 3. Enhanced Logging

**Event Type Breakdown:**
```javascript
// Count by event type
const eventTypeCounts = {};
webhookSentSnapshot.docs.forEach(doc => {
    const type = doc.data().eventType;
    eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1;
});
console.log('   Event type breakdown:', eventTypeCounts);
```

**Sample Output:**
```
📦 Found 47 total webhook events (before filtering)
   Event type breakdown: {
     MESSAGE_SENT: 15,
     CONNECTION_REQUEST_SENT: 12,
     VIEWED_PROFILE: 8,
     LIKED_POST: 5,
     INMAIL_SENT: 3,
     MESSAGE_REPLY_RECEIVED: 4
   }
✅ MATCHED MESSAGE_SENT to John Doe
✅ MATCHED CONNECTION_REQUEST_SENT to Jane Smith
✅ MATCHED VIEWED_PROFILE to Bob Johnson
✅ Matched 25 activities for taylordavis@careluminate.com
   ⏭️ Skipped 22 activities from other users or unmapped
```

## Data Extraction by Event Type

### MESSAGE_SENT
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** `eventData.messageText` or `eventData.message`
- **Position:** `leadPosition`

### CONNECTION_REQUEST_SENT
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** `eventData.connectionMessage`
- **Position:** `leadPosition`

### VIEWED_PROFILE
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** Static "Viewed profile"
- **Position:** `leadPosition`

### LIKED_POST
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** Static "Liked a post"
- **Position:** `leadPosition`
- **Note:** Could potentially extract post URL from `eventData.postUrl` if needed

### INMAIL_SENT
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** `eventData.inmailBody`
- **Position:** `leadPosition`

### INMAIL_REPLY_RECEIVED
- **Lead Name:** `${leadFirstName} ${leadLastName}`
- **Message:** Reply text from `eventData`
- **Position:** `leadPosition`

## UI Display

### Live Activity Feed (Animated Bubbles)
All outbound activities appear as animated bubbles in the top section:
- Blue gradient for messages sent
- Green gradient for connections/engagement
- Each bubble shows: icon, lead name, position, message preview, timestamp

### Recent Replies Section
All reply types (MESSAGE_REPLY_RECEIVED + INMAIL_REPLY_RECEIVED) appear in dedicated cards:
- Shows profile picture if available
- Full reply message text
- "Follow Up" badge
- Timestamp

### New Connections Section
CONNECTION_REQUEST_ACCEPTED events shown as connection cards with profile pictures.

## Benefits

✅ **Complete Activity Picture** - Shows ALL outreach activities, not just messages
✅ **Engagement Tracking** - See profile views, post likes, and other engagement
✅ **InMail Support** - Includes InMail sends and replies
✅ **Consistent Filtering** - Same BDR filtering logic across all event types
✅ **Extensible** - Easy to add new event types if HeyReach adds more

## Files Modified

- **`HealthLuminateSiteFromLocal/connect/index.html`**
  - Lines 1027-1189: Complete rewrite to support all outbound event types
  - Lines 1311-1329: Added INMAIL_REPLY_RECEIVED to activity feed replies
  - Lines 1757-1773: Added INMAIL_REPLY_RECEIVED to Recent Replies section
  - Lines 1032-1038: Defined supported event types list
  - Lines 1054-1060: Event type counting for debug
  - Lines 1126-1156: Switch statement for event-specific message/icon handling

## Testing Instructions

**Refresh the dashboard** (Ctrl+Shift+R) and check console:

```
🔍 Querying heyreach_activity for all activity types...
   Looking for activities for: taylordavis@careluminate.com
   Event types: MESSAGE_SENT, CONNECTION_REQUEST_SENT, VIEWED_PROFILE, LIKED_POST, INMAIL_SENT

📦 Found 47 total webhook events (before filtering)
   Event type breakdown: {
     MESSAGE_SENT: 15,
     CONNECTION_REQUEST_SENT: 12,
     VIEWED_PROFILE: 8,
     LIKED_POST: 5,
     INMAIL_SENT: 3,
     MESSAGE_REPLY_RECEIVED: 4,
     CAMPAIGN_COMPLETED: 0
   }

🔍 DEBUG - Sample webhook 1: {
  eventType: "MESSAGE_SENT",
  linkedInAccountId: "104063",
  leadName: "John Doe",
  ...
}

   ✅ MATCHED MESSAGE_SENT to John Doe
   ✅ MATCHED CONNECTION_REQUEST_SENT to Jane Smith
   ✅ MATCHED VIEWED_PROFILE to Bob Johnson
   ✅ MATCHED LIKED_POST to Alice Cooper
   ✅ MATCHED INMAIL_SENT to Mike Wilson

✅ Matched 25 activities for taylordavis@careluminate.com
   ⏭️ Skipped 22 activities from other users or unmapped

🔍 Querying heyreach_activity collection for reply webhooks (MESSAGE_REPLY_RECEIVED + INMAIL_REPLY_RECEIVED)...
📦 Found 8 reply webhook events (before filtering)
```

**What to Verify:**
1. ✅ Live Activity Feed shows messages, connection requests, profile views, post likes, InMails
2. ✅ Different icons appear for different activity types
3. ✅ Recent Replies includes both regular message replies AND InMail replies
4. ✅ All activities filtered correctly to selected BDR
5. ✅ No CAMPAIGN_COMPLETED events appear
6. ✅ Event type breakdown in console shows correct counts

## Example Data from Firebase

Based on your provided data, here's what will now appear:

**MESSAGE_SENT** (OutcomeMD → Taylor MBA):
```
Jean Paty sent: "Know you are super busy. Just putting this at the top of your inbox..."
```

**CONNECTION_REQUEST_SENT** (OutcomeMD → Katelyn Kilduff):
```
Ryan Saliman sent: "Saw Seaview Orthopaedic & Medical Associates (NJ) has a top Google rating..."
```

**VIEWED_PROFILE** (Mentavi Health → L. Alison McInnes):
```
Ryan Scanlon viewed profile
```

**LIKED_POST** (Internal HealthLuminate → Christine Burke):
```
Taylor Davis liked a post
```

**INMAIL_SENT** (OutcomeMD → Matt Thornburg):
```
Bob Young sent: "Matt- Saw your post on telehealth saving hundreds..."
```

**MESSAGE_REPLY_RECEIVED** (Internal HealthLuminate → Robert Becker):
```
Robert Becker replied: "I'm glad to hear the post made an impact..."
```

**INMAIL_REPLY_RECEIVED** (OutcomeMD → Marisa Rogers):
```
Marisa Rogers replied: "Hi Bob, this sounds like interesting work however..."
```

## Related Documentation

- `SENT_MESSAGES_WEBHOOK_SWITCH.md` - Initial webhook migration for sent messages
- `DUPLICATES_AND_PROFILE_PICS_FIX.md` - Duplicate removal and profile pictures
- `MEETING_REQUESTS_LINKEDIN_ACCOUNT_ID_FIX.md` - Meeting requests filtering
- `WEBHOOK_FILTERING_DUAL_MAPPING.md` - LinkedIn Account ID + URL mapping
- `CASE_SENSITIVITY_FIX.md` - Email normalization for filtering

All webhook events now fully integrated! 🎉













