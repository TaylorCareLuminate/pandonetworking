# Assignment Future-Date Filter Fix - Feb 3, 2026

## Problem Report
Alex reported:
- OutcomeMD Family Practice campaign not assigning him any calls
- Page taking 30-50 seconds per call load

## Root Cause Analysis

### Issue 1: Assignment System Assigning Future-Scheduled Calls
**Problem**: The `assignCallsToUser()` function was assigning calls scheduled for March 2026 (future dates) to Alex's rolling window. Then when `loadCalls()` ran, it correctly filtered out these future-scheduled calls, leaving Alex with 0 available calls.

**Console Evidence**:
```
Processing 19 total calls (assigned + overdue/unassigned)
→ Skipping future-scheduled call for Brooks Miller (scheduled for 3/3/2026)
→ Skipping future-scheduled call for Stephanie Heath (scheduled for 3/13/2026)
[... 12 more future-scheduled calls ...]
✓ Loaded 0 calls for campaign (after all filters)
```

**Why This Happened**:
- Assignment system (lines 4989-5071) checked cooldown, duplicate phones, and assignment expiry
- But it did NOT check if calls were scheduled for future dates
- Load system (lines 6240-6320) correctly filters future dates
- Result: Mismatch where calls get assigned but never appear

### Issue 2: Slow Query Performance
**Problem**: Query took 18+ seconds (should be under 5 seconds)
**Previous Fix**: Already applied - reduced query limit from 500 to 150
**Status**: Performance improved but assignment logic was still broken

## Solution Implemented

### Added Future-Date Filter to Assignment System
**Location**: `team/phone-calls.html`, lines ~4997-5010

**New Logic**:
```javascript
// 🔥 NEW (Feb 2026): Skip future-scheduled calls - don't assign calls that aren't due yet
let callScheduledDate = data.scheduledDate || data.rescheduledAt || data.scheduledAt;
if (callScheduledDate) {
    let parsedDate;
    if (typeof callScheduledDate === 'object' && callScheduledDate.toDate) {
        parsedDate = callScheduledDate.toDate();
    } else if (typeof callScheduledDate === 'object' && callScheduledDate.seconds) {
        parsedDate = new Date(callScheduledDate.seconds * 1000);
    } else {
        parsedDate = new Date(callScheduledDate);
    }
    
    // Skip if scheduled for future (after today)
    if (parsedDate > today) {
        console.log(`   » Skipping ${data.contactName || 'Unknown'} - scheduled for future (${parsedDate.toLocaleDateString()})`);
        return;
    }
}
```

**What This Does**:
1. Checks the scheduled date of each call BEFORE adding to candidates
2. Parses dates from Firestore (handles Timestamp objects, ISO strings, etc.)
3. Compares to today's date (23:59:59)
4. Skips calls scheduled for future dates
5. Logs which calls are being skipped for debugging

## Expected Results

### Before Fix:
- Alex assigned 15 calls (all future-scheduled for March)
- `loadCalls()` filters all 15 out
- Alex sees 0 calls available
- Console: "Loaded 0 calls for campaign"

### After Fix:
- Assignment system skips 14 future-scheduled calls
- Assignment system finds calls that are actually due today
- Assigns up to 15 calls that are ready to be called
- Alex sees calls in his queue
- Console: "Loaded [X] calls for campaign"

## Campaign-Specific Context

### OutcomeMD Family Practice Status:
- **Total Activities**: 1,133
- **Completed**: 1,052
- **Scheduled**: 81
- **Of the 81 scheduled**:
  - Many are future-scheduled (March 2026)
  - Some blocked by company cooldown (12h)
  - Only a subset are actually due today

### Why So Many Future-Scheduled Calls?
This happens when:
1. Campaign has multiple call attempts per contact (Call 1, Call 2, Call 3)
2. Each attempt is scheduled X business days apart
3. Later calls get scheduled for future dates
4. System should only assign the CURRENT call due, not future ones

## Testing Instructions

1. **Alex should hard-refresh**: Ctrl+Shift+R to clear cache
2. **Select OutcomeMD Family Practice** campaign
3. **Watch console for new messages**:
   - Should see: `» Skipping [Name] - scheduled for future ([date])`
   - Should see: `📋 Found [X] candidates, assigning top [Y]`
   - Should see: `✓ Assigned [Y] calls to maintain rolling window`
4. **Verify calls load**: Should see actual calls in the queue now

## Related Filters

The assignment system now has these filters (in order):
1. ✅ Sequential call filtering (only current call due per phone)
2. ✅ **Future-date filter** (NEW - don't assign calls scheduled for future)
3. ✅ Contact cooldown (40h since last call)
4. ✅ Duplicate phone check (don't assign same phone twice)
5. ✅ Assignment expiry check (respect existing assignments)

The load system has these filters (in order):
1. ✅ Sequential call filtering
2. ✅ Campaign status (must be active)
3. ✅ Declined/blocked contacts
4. ✅ Company cooldown (12h)
5. ✅ Contact cooldown (40h)
6. ✅ **Future-date filter** (don't show calls scheduled for future)
7. ✅ Timezone filter (only show calls within calling hours)

Both systems now align on future-date filtering!

## Performance Notes

**Query Time**: ~18 seconds (down from 110s with previous fix)
- Main query: 15 assigned activities
- Overdue query: 150 activities (reduced from 500)
- Completed query: 222 activities (for cooldown)
- Total time: Acceptable for now

**Next Optimization** (if needed):
- Add Firestore index on `scheduledDate` to filter server-side
- Would reduce client-side filtering overhead

---

**Status**: Fix deployed, waiting for Alex to test
**Date**: Feb 3, 2026, 2:41 PM MT
**Priority**: HIGH - Blocking agent from working
**Files Modified**: `team/phone-calls.html` (added future-date filter to assignment logic)
