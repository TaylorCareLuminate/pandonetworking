# Message Filtering Logic - Shared Module Documentation

## Overview

The `message-filter-logic.js` module provides centralized, consistent message filtering logic across all Connect Queue pages. This ensures that all pages show **identical message counts** and apply the same business rules.

## Problem Solved

Previously, each page (connect_review.html, generate_messages.html, connect_push.html) had its own filtering logic. This led to:
- **Inconsistent message counts** between pages
- **Maintenance nightmares** when updating business rules
- **Difficult debugging** due to scattered logic

## Solution

A single, shared JavaScript module that all pages import and use for filtering.

## Usage

### 1. Include the module in your HTML

```html
<script src="message-filter-logic.js"></script>
```

### 2. Access functions via window.connectQueueFilters

All functions are available under the global `window.connectQueueFilters` namespace.

## Key Functions

### normalizeLinkedInUrl(url)

Normalizes LinkedIn URLs for consistent comparison.

**Example:**
```javascript
const normalized = window.connectQueueFilters.normalizeLinkedInUrl(
    'https://www.linkedin.com/in/john-doe/'
);
// Returns: 'linkedin.com/in/john-doe'
```

### hasApprovedMessageInPast45Days(linkedinUrl, allMessages)

Checks if a contact has an approved message within the past 45 days. Used to prevent duplicate messages.

**Parameters:**
- `linkedinUrl` (string): LinkedIn profile URL to check
- `allMessages` (Array): All messages from connect_queue

**Returns:** `boolean`

**Example:**
```javascript
const isDuplicate = window.connectQueueFilters.hasApprovedMessageInPast45Days(
    'https://linkedin.com/in/john-doe',
    allMessages
);
```

### filterMessagesForAdminQueue(allMessages)

Filters messages for Queue 1 (Admin Review). Shows messages that need admin review.

**Filtering Rules:**
1. ✅ NOT deleted
2. ✅ `reviewStatus === 'pending_admin_review'` OR no reviewStatus
3. ✅ Excludes contacts with approved messages in past 45 days (duplicates)

**Parameters:**
- `allMessages` (Array): All messages from connect_queue

**Returns:** Object with `messages` and `stats`
```javascript
{
    messages: [...],  // Filtered messages array
    stats: {
        total: 150,           // Total messages in database
        deleted: 10,          // Deleted messages
        wrongStatus: 50,      // Messages with wrong status (approved/rejected)
        duplicates: 20,       // Contacts with approved message in past 45 days
        visible: 70           // Messages visible in Queue 1
    }
}
```

**Example:**
```javascript
const result = window.connectQueueFilters.filterMessagesForAdminQueue(allMessages);
console.log(`Showing ${result.messages.length} messages`);
console.log(`Filtered out ${result.stats.duplicates} duplicates`);
```

### filterMessagesForCustomerQueue(allMessages)

Filters messages for Queue 2 (Customer/BDR Review). Shows messages that BDRs need to review.

**Filtering Rules:**
1. ✅ NOT deleted
2. ✅ `reviewStatus === 'pending_customer_review'`

**Returns:** Object with `messages` and `stats`

### filterMessagesForPushQueue(allMessages)

Filters messages for Push Queue (Ready to send to HeyReach).

**Filtering Rules:**
1. ✅ NOT deleted
2. ✅ NOT already pushed to HeyReach
3. ✅ `reviewStatus === 'approved'`

**Returns:** Object with `messages` and `stats`

### countMessagesPerBDRForAdminQueue(allMessages)

Counts messages per BDR for Admin Queue. Returns counts that match exactly what shows in connect_review.html Queue 1.

**Parameters:**
- `allMessages` (Array): All messages from connect_queue

**Returns:** Object with `counts` and `stats`
```javascript
{
    counts: {
        'bdr1@example.com': { connect: 10, message: 15, total: 25 },
        'bdr2@example.com': { connect: 5, message: 8, total: 13 }
    },
    stats: {
        total: 150,
        deleted: 10,
        wrongStatus: 50,
        duplicates: 20,
        visible: 70
    }
}
```

**Example:**
```javascript
const { counts, stats } = window.connectQueueFilters.countMessagesPerBDRForAdminQueue(allMessages);

// Show counts for each BDR
for (const [email, count] of Object.entries(counts)) {
    console.log(`${email}: ${count.total} messages (${count.connect} connect, ${count.message} message)`);
}
```

## Implementation Examples

### In generate_messages.html

```javascript
// Load all messages
const allMessages = [];
queueSnapshot.forEach(doc => {
    allMessages.push({ id: doc.id, ...doc.data() });
});

// Use shared filtering to count messages per BDR
const { counts: bdrCounts, stats: filterStats } = 
    window.connectQueueFilters.countMessagesPerBDRForAdminQueue(allMessages);

// Display counts
console.log(`Total visible: ${filterStats.visible}`);
console.log(`Duplicates filtered: ${filterStats.duplicates}`);
```

### In connect_review.html

```javascript
// For Queue 1 (Admin)
const filterResult = window.connectQueueFilters.filterMessagesForAdminQueue(allMessages);
const messagesToFilter = filterResult.messages;

console.log(`Showing ${filterResult.stats.visible} messages`);
console.log(`Filtered ${filterResult.stats.duplicates} duplicates`);

// For Queue 2 (Customer)
const filterResult = window.connectQueueFilters.filterMessagesForCustomerQueue(allMessages);
const messagesToFilter = filterResult.messages;
```

### In connect_push.html

```javascript
// Get messages ready to push
const filterResult = window.connectQueueFilters.filterMessagesForPushQueue(allMessages);
const messagesToPush = filterResult.messages;

console.log(`${filterResult.stats.visible} messages ready to push`);
console.log(`${filterResult.stats.alreadyPushed} already pushed`);
```

## Business Rules

### Duplicate Prevention (45-Day Rule)

A contact is considered a "duplicate" if they have an **approved** message within the past **45 days**. This prevents sending multiple messages to the same contact too quickly.

**Implementation Details:**
- Checks `adminApprovedAt` or `review_date` timestamp
- Only counts messages that are `reviewed === true` OR `reviewStatus === 'pending_customer_review'`
- **CRITICAL:** Deleted messages do NOT block new messages for the same contact
- Uses fuzzy URL matching (contains/includes) to catch URL variations

### Message Statuses

Messages flow through these statuses:

1. **pending_admin_review** (Default)
   - Shows in Queue 1 (Admin Review)
   - Admin reviews and either approves or rejects

2. **pending_customer_review**
   - Admin approved the message
   - Shows in Queue 2 (BDR Review)
   - BDR reviews and finalizes

3. **approved**
   - BDR approved the message
   - Shows in Push Queue (connect_push.html)
   - Ready to send to HeyReach

4. **rejected**
   - Admin or BDR rejected the message
   - Hidden from all queues

### Deleted Messages

Messages with `deleted: true` are:
- **Hidden from all queues**
- **Ignored in duplicate detection** (don't block new messages)
- **Not counted** in any statistics

## Testing

To verify consistency across pages:

1. Open Browser DevTools Console
2. Navigate to `generate_messages.html`
3. Check message counts for each BDR
4. Navigate to `connect_review.html` (Queue 1)
5. Verify counts match **exactly**

**Expected Result:** All counts should be identical.

## Debugging

Enable detailed logging:

```javascript
const { counts, stats } = window.connectQueueFilters.countMessagesPerBDRForAdminQueue(allMessages);

console.log('Filtering Statistics:');
console.log(`- Total messages: ${stats.total}`);
console.log(`- Deleted: ${stats.deleted}`);
console.log(`- Wrong status: ${stats.wrongStatus}`);
console.log(`- Duplicates: ${stats.duplicates}`);
console.log(`- Final visible: ${stats.visible}`);
```

## Maintenance

When updating business rules:

1. **Edit ONLY** `message-filter-logic.js`
2. **Test** in all three pages (generate, review, push)
3. **Verify** counts remain consistent
4. **Deploy** to all environments

**DO NOT** duplicate filtering logic in individual pages!

## Future Enhancements

Potential additions to the module:

- `filterMessagesForBDR(allMessages, bdrEmail)` - Filter for specific BDR
- `getMessageStatistics(allMessages)` - Overall queue statistics
- `validateMessage(message)` - Validate message data structure
- `sortMessages(messages, sortBy)` - Consistent sorting logic

## Version History

- **v1.0** (2025-12-31) - Initial release
  - Core filtering functions
  - Duplicate detection
  - Per-BDR counting
  - Support for all three queue types

## Support

For questions or issues:
1. Check console logs for detailed filtering statistics
2. Verify `message-filter-logic.js` is loaded before use
3. Ensure all pages use the same version of the module




