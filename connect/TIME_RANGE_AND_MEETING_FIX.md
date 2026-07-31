# Time Range Selector & Meeting Requests Improvements

## Summary

Added a time range filter (Day/Week/Month/Custom) and fixed the meeting requests query to capture all `willingToMeet=true` documents with better sorting and filtering.

## Changes Made

### 1. Time Range Selector UI

**Added new filter control** (Line 777-802):
```html
<!-- Time Range Filter -->
<div style="background: white; padding: 1.5rem; border-radius: 16px; ...">
    <select id="timeRangeSelect">
        <option value="1">Last 24 Hours</option>
        <option value="7" selected>Last 7 Days</option>  ← Default
        <option value="30">Last 30 Days</option>
        <option value="90">Last 90 Days</option>
        <option value="custom">Custom Range</option>
    </select>
    <div id="customDateRange" style="display: none;">
        <input type="date" id="startDate">
        <input type="date" id="endDate">
    </div>
</div>
```

**Features:**
- 📅 **Default:** Last 7 Days (changed from 24 hours)
- 🗓️ **Presets:** 1 day, 7 days, 30 days, 90 days
- 📆 **Custom:** Select any date range
- 🔄 **Auto-reload:** Dashboard updates when you change the range

### 2. Time Range JavaScript Logic

**Global Variables** (Line 954-956):
```javascript
let timeRangeDays = 7; // Default to 7 days (was 1)
let customStartDate = null;
let customEndDate = null;
```

**Setup Function** (Line 1081-1138):
```javascript
function setupTimeRangeSelector() {
    const timeRangeSelect = document.getElementById('timeRangeSelect');
    
    timeRangeSelect.addEventListener('change', async (e) => {
        if (e.target.value === 'custom') {
            // Show custom date inputs
            customStartDate = new Date(startDateInput.value);
            customEndDate = new Date(endDateInput.value);
        } else {
            // Use preset days
            timeRangeDays = parseInt(e.target.value);
            customStartDate = null;
            customEndDate = null;
        }
        
        // Reload dashboard with new time range
        shownActivityIds.clear();
        isFirstLoad = true;
        await loadDashboard();
    });
}
```

### 3. Updated All Data Queries

**Dynamic Date Calculation** (added to all load functions):
```javascript
// Calculate time range based on selector
let sinceDate;
if (customStartDate) {
    sinceDate = customStartDate;  // Use custom start date
} else {
    sinceDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
}
```

**Applied to:**
- ✅ `loadActivityFeed()` - Line 1212-1222
- ✅ `loadRecentReplies()` - Line 1913-1924  
- ✅ `loadNewConnections()` - Line 2347-2358

**All Firestore queries now use:**
```javascript
where('timestamp', '>=', Timestamp.fromDate(sinceDate))
```

Instead of the hardcoded:
```javascript
where('timestamp', '>=', Timestamp.fromDate(twentyFourHoursAgo))
```

### 4. Meeting Requests Query Improvements

#### Increased Limit & Added Sorting (Line 2182-2205)

**BEFORE (Limited to 50, unsorted):**
```javascript
let meetingsQuery = query(
    collection(emailDB, 'heyreach_inbox'),
    where('willingToMeet', '==', true),
    limit(50)
);
```

**AFTER (200 documents, sorted by date):**
```javascript
let meetingsQuery = query(
    collection(emailDB, 'heyreach_inbox'),
    where('willingToMeet', '==', true),
    orderBy('meetingWillingnessDate', 'desc'),  // Most recent first
    limit(200)  // Increased from 50
);

// Fallback if sorting fails (missing index or field)
try {
    meetingsSnapshot = await getDocs(meetingsQuery);
} catch (sortError) {
    // Use unsorted query as fallback
    meetingsQuery = query(
        collection(emailDB, 'heyreach_inbox'),
        where('willingToMeet', '==', true),
        limit(200)
    );
    meetingsSnapshot = await getDocs(meetingsQuery);
}
```

**Why This Matters:**
- Your document with `customerId: "internal"` wasn't in the first 50 unsorted results
- Now fetches 200 documents and sorts by most recent `meetingWillingnessDate`
- Should capture your Bobby Guelich meeting request

#### Enhanced Debug Logging (Line 2207-2261)

**New detailed logs:**
```javascript
console.log(`   🔍 Filtering ${meetingsSnapshot.docs.length} willingToMeet documents...`);
console.log(`   👤 Looking for accountEmail: ${accountEmail} OR viewingUserEmail: ${viewingUserEmail}`);

// Log first 3 documents being checked
console.log(`   📄 Doc: internal_2-NGRiYmVhOWEtOTAyYi00MmNhL... | linkedInAccountId: 104063 | email fields: (none)`);

// Log successful matches
console.log(`   ✅ MATCHED by linkedInAccountId: 104063 → taylordavis@careluminate.com → Bobby Guelich`);

// Final summary
console.log(`   ✅ Filtered to 1 meetings for taylordavis@careluminate.com`);
console.log(`      - 0 matched by email field`);
console.log(`      - 1 matched by linkedInAccountId mapping`);
console.log(`      - 199 skipped (different BDR or unmapped)`);
```

**This will help debug:**
- Which documents are being fetched
- How they're being matched (email vs linkedInAccountId)
- Why any meetings might be missing

## Expected Results

### Console Logs (After Refresh)

**Time Range:**
```
📅 Looking for activity since: Fri Nov 07 2025 09:19:33 GMT-0700 (7 days or custom)
```

**Meeting Requests:**
```
📅 Loading meeting requests...
✅ heyreach_inbox collection has data, querying for meeting willingness...
   Found 50 documents (sorted by meetingWillingnessDate)
   🔍 Filtering 50 willingToMeet documents...
   👤 Looking for accountEmail: taylordavis@careluminate.com
   📄 Doc: internal_2-NGRiYmVhOWEtOTAyYi00MmNhL... | linkedInAccountId: 104063 | email fields: (none)
   ✅ MATCHED by linkedInAccountId: 104063 → taylordavis@careluminate.com → Bobby Guelich
   ✅ Filtered to 1 meetings for taylordavis@careluminate.com
      - 0 matched by email field
      - 1 matched by linkedInAccountId mapping
      - 49 skipped (different BDR or unmapped)
✅ Found 1 meeting requests
```

### UI Changes

**You'll now see:**
1. **New time range selector** at the top of the dashboard
2. **"Last 7 Days" selected by default** (instead of 24 hours)
3. **More activity data** showing (7 days worth)
4. **Meeting with Bobby Guelich** should appear in "Meeting Requests" section

### Data Coverage

| Section | Old Range | New Range | Increase |
|---------|-----------|-----------|----------|
| Activity Feed | 24 hours | 7 days | **7x more** |
| Replies | 30 days | 7 days | (same query) |
| Meetings | 50 docs | 200 docs | **4x more** |
| Connections | 30 days | 7 days | (same query) |

**Note:** Replies and Connections still use 30-day queries for legacy data, but webhook data uses the selected time range.

## Why Your Meeting Wasn't Showing

Your Bobby Guelich meeting (`internal_2-NGRiYmVhOWEtOTAyYi00MmNhLTkyMmItYjNkNjM0OTI0YTYwXzAxMg==`) has:
- ✅ `willingToMeet: TRUE`
- ✅ `linkedInAccountId: 104063` (your account)
- ❌ NO `account_email`, `accountEmail`, or `bdrEmail` fields
- ❌ `customerId: "internal"` (might have different sorting)

**The issue was:**
1. **Limited fetch:** Query only got first 50 documents (unsorted)
2. **Your document wasn't in those 50** (possibly due to internal vs external customerId sorting)
3. **Filtering worked correctly** (would have matched by linkedInAccountId if it was fetched)

**Now fixed:**
- ✅ Fetches 200 documents (4x more)
- ✅ Sorts by `meetingWillingnessDate` (most recent first)
- ✅ Enhanced logging shows which docs are checked
- ✅ Your meeting should now appear!

## Testing Instructions

1. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Check time range:** Should default to "Last 7 Days"
3. **Check console logs:**
   - Look for "Found X documents (sorted by meetingWillingnessDate)"
   - Look for "✅ MATCHED by linkedInAccountId: 104063"
   - Check the final count
4. **Check Meeting Requests section:** Should show Bobby Guelich meeting
5. **Test time ranges:**
   - Try "Last 24 Hours" (less data)
   - Try "Last 30 Days" (more data)
   - Try "Custom" with specific dates

## Troubleshooting

### If meeting still doesn't show:

**Check console for:**
```
📄 Doc: internal_2-NGRiYmVhOWEtOTAyYi00MmNhL... | linkedInAccountId: 104063
```

If you DON'T see this line, the document still isn't being fetched. Possible reasons:
1. `meetingWillingnessDate` sort pushed it past 200 documents
2. Document was created after your current session started
3. `willingToMeet` field changed to `false`

If you DO see this line but it says "skipped":
1. Check the `linkedInAccountIdMapping` logs at startup
2. Verify Account ID `104063` maps to your email
3. Check for case sensitivity issues

### If time range selector doesn't appear:

Check browser console for JavaScript errors during initialization.

## Files Modified

- **`C:\repos\HealthLuminateSiteFromLocal\connect\index.html`**
  - Line 777-802: Added time range selector HTML
  - Line 954-956: Added global time range variables
  - Line 1081-1138: Added setupTimeRangeSelector() function
  - Line 1167: Call setupTimeRangeSelector() on init
  - Line 1212-1227: Updated loadActivityFeed() for dynamic time range
  - Line 1913-1924: Updated loadRecentReplies() for dynamic time range
  - Line 2347-2358: Updated loadNewConnections() for dynamic time range
  - Line 2182-2205: Improved meeting requests query (sorting + limit)
  - Line 2207-2261: Enhanced meeting requests filtering & debug logging

## Summary

🎯 **Default changed:** 24 hours → 7 days  
📊 **Meeting limit:** 50 → 200 documents  
🔄 **Meeting sorting:** Unsorted → Sorted by date (with fallback)  
🐛 **Debug logs:** Enhanced to show exactly what's being matched  
✨ **User control:** Can now select any time range  

Your Bobby Guelich meeting should now appear! 🎉













