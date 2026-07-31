# Meeting Requests Fix

## Problem

The "Meeting Requests" section was not displaying any data, even though documents with `willingToMeet: true` existed in the `heyreach_inbox` collection.

## Root Causes

### 1. Complex Multi-Field Query
The original code tried to query with multiple conditions:
```javascript
where('account_email', '==', accountEmail),
where('willingToMeet', '==', true),
where('meetingWillingnessDate', '>=', Timestamp.fromDate(thirtyDaysAgo)),
orderBy('meetingWillingnessDate', 'desc')
```

**Issues:**
- Required a Firestore composite index for each field combination
- Failed if `meetingWillingnessDate` field didn't exist in documents
- Tried multiple email field names (`account_email`, `accountEmail`, `bdrEmail`) separately

### 2. Missing Field Handling
The code assumed `meetingWillingnessDate` field existed:
```javascript
timestamp: data.meetingWillingnessDate.toDate() // ❌ Crashes if field doesn't exist!
```

This would throw an error if the field was missing or wasn't a Firestore Timestamp.

## Solution

### 1. Simplified Query Strategy
**Fetch all `willingToMeet: true` documents, then filter client-side:**

```javascript
// Simple query - just get all willing-to-meet contacts
let meetingsQuery = query(
    collection(emailDB, 'heyreach_inbox'),
    where('willingToMeet', '==', true),
    limit(50)
);
let meetingsSnapshot = await getDocs(meetingsQuery);

// Filter client-side by email (checks all possible field names)
const allMeetings = [];
for (const doc of meetingsSnapshot.docs) {
    const data = doc.data();
    const docEmail = data.account_email || data.accountEmail || data.bdrEmail || '';
    
    // Case-insensitive match
    if (docEmail.toLowerCase() === accountEmail.toLowerCase() || 
        docEmail.toLowerCase() === viewingUserEmail.toLowerCase()) {
        allMeetings.push(doc);
    }
}
```

**Benefits:**
- No complex Firestore indexes needed (just single field: `willingToMeet`)
- Handles any email field name (`account_email`, `accountEmail`, `bdrEmail`)
- Case-insensitive matching
- Works regardless of document structure

### 2. Flexible Timestamp Handling
**Try multiple timestamp fields with fallback:**

```javascript
// Determine timestamp - try multiple fields
let timestamp = new Date();
if (data.meetingWillingnessDate && typeof data.meetingWillingnessDate.toDate === 'function') {
    timestamp = data.meetingWillingnessDate.toDate();
} else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
    timestamp = data.timestamp.toDate();
} else if (data.last_message_timestamp && typeof data.last_message_timestamp.toDate === 'function') {
    timestamp = data.last_message_timestamp.toDate();
} else if (lastMessage?.timestamp && typeof lastMessage.timestamp.toDate === 'function') {
    timestamp = lastMessage.timestamp.toDate();
}
```

**Tries in order:**
1. `meetingWillingnessDate` (preferred if exists)
2. `timestamp` (general document timestamp)
3. `last_message_timestamp` (conversation timestamp)
4. `messages[last].timestamp` (from messages array)
5. Falls back to `new Date()` (current time) if none exist

### 3. Enhanced Debug Logging
Added logging to show what data is actually available:

```javascript
console.log('📊 DEBUG - Sample willingToMeet document fields:');
const sampleDoc = debugSnapshot.docs[0].data();
console.log('   Available fields:', Object.keys(sampleDoc));
console.log('   Sample data:', {
    account_email: sampleDoc.account_email,
    accountEmail: sampleDoc.accountEmail,
    bdrEmail: sampleDoc.bdrEmail,
    willingToMeet: sampleDoc.willingToMeet,
    meetingWillingnessDate: sampleDoc.meetingWillingnessDate,
    timestamp: sampleDoc.timestamp,
    lead_name: sampleDoc.lead_name
});
```

This helps identify:
- Which email field is actually used in your documents
- Which timestamp field is available
- Any missing fields that might cause issues

### 4. Client-Side Sorting
After fetching all meetings, sort by timestamp:

```javascript
// Sort by timestamp descending (newest first)
meetings.sort((a, b) => b.timestamp - a.timestamp);
```

## Testing

After refreshing the dashboard, you should see:

1. **Debug logs in console:**
   ```
   📊 DEBUG - Sample willingToMeet document fields:
      Available fields: [...]
      Sample data: {...}
   ```

2. **Query results:**
   ```
   Found X total documents with willingToMeet=true
   Filtered to Y meetings for derek.moore@keybenefit.com
   ✅ Found Y meeting requests
   ```

3. **Meeting requests displayed** in the "Meeting Requests" section

## Files Changed

- `HealthLuminateSiteFromLocal/connect/index.html` - Lines 1771-1848
  - Simplified meeting requests query
  - Added flexible timestamp handling
  - Added debug logging
  - Implemented client-side filtering and sorting

## Firestore Requirements

**Only ONE simple index needed:**
- Collection: `heyreach_inbox`
- Field: `willingToMeet` (Ascending or Descending)

No composite indexes required!













