# Overdue Calls Visibility Fix - Feb 3, 2026

## Problem Report
User observed: "scheduled-calls is showing that there are hundreds of overdue calls that are not assigned. Shouldn't these show?"

## Root Cause Analysis

### Issue: Overdue Calls Hidden by Artificial Time Window
**Problem**: The `loadCalls()` function had a 4-hour expiry threshold that was hiding older overdue calls from agents.

**Original Logic** (lines 5255-5281):
```javascript
// Only check assignments that expired within the last 4 hours (240 minutes)
const recentExpiryThreshold = new Date(now.getTime() - (4 * 60 * 60 * 1000));

if (expiryDate <= now) {
    // Assignment expired - but only include if it expired recently (within last 4 hours)
    if (expiryDate >= recentExpiryThreshold) {
        console.log(`⏰ Found expired assignment: ${data.contactName}`);
        additionalCalls.push({ id: docSnap.id, ...data });
        return;
    } else {
        // Expired too long ago (>4 hours) - ignore it
        // These will be picked up by the normal assignment system
        return;
    }
}
```

### Why This Was a Problem

1. **Artificial Time Window**: Calls with assignments that expired MORE than 4 hours ago were completely hidden from agents
2. **False Assumption**: Comment said "These will be picked up by the normal assignment system" - but the assignment system only assigns 15 calls at a time (rolling window)
3. **Bottleneck**: If 100 calls expired 5+ hours ago, they would:
   - NOT show in the overdue query (filtered out by 4-hour window)
   - NOT get assigned by rolling window (only 15 at a time)
   - Sit invisible and unworked

4. **Query Limit**: Additionally limited to 150 calls, so even within the 4-hour window, only first 150 would load

### The Logic Error

**Scenario**:
- Campaign has 300 overdue calls
- 200 expired 6+ hours ago
- 100 expired within last 4 hours
- Agent has 15 calls in rolling window

**What Agent Saw**:
- 15 assigned calls (rolling window)
- ~100 overdue calls (only recent ones within 4h window)
- **MISSING: 200 older overdue calls that should be available**

**What Scheduled_Calls Showed**:
- All 300 overdue calls (no time window filter)
- Created confusion: "Why does Scheduled_Calls show 300 but Phone-Calls only shows 115?"

## Solution Implemented

### Fix 1: Removed 4-Hour Expiry Threshold
**Change**: Lines 5254-5273
```javascript
// REMOVED 4-hour expiry threshold - ALL expired/unassigned overdue calls should be available
// This ensures agents see all truly available calls, not just recently expired ones

if (data.assignedTo && data.assignmentExpiry) {
    const expiryDate = new Date(data.assignmentExpiry);
    const minutesExpired = Math.floor((now - expiryDate) / 60000);
    
    if (expiryDate <= now) {
        // Assignment expired - include it as available
        console.log(`⏰ Found expired assignment: ${data.contactName} (expired ${minutesExpired} min ago)`);
        additionalCalls.push({ id: docSnap.id, ...data });
        return;
    } else {
        // Assignment is still valid - skip it
        return;
    }
}
```

**What Changed**:
- Removed `recentExpiryThreshold` variable
- Removed nested if checking `expiryDate >= recentExpiryThreshold`
- Now includes ALL expired assignments, regardless of when they expired
- Only excludes calls with ACTIVE (non-expired) assignments

### Fix 2: Increased Query Limit
**Change**: Line 5248
```javascript
limit(300) // PERFORMANCE: Increased to 300 to catch more overdue calls (Feb 2026)
```

**Before**: 150 calls
**After**: 300 calls
**Reason**: Campaign has hundreds of overdue calls that need to be visible

## Expected Results

### Before Fix:
```
Campaign: OutcomeMD Family Practice
- Total overdue: 300 calls
- Showing in Phone-Calls: ~115 calls
  - 15 assigned (rolling window)
  - ~100 overdue (only recently expired, within 4h)
- Hidden: 200 older overdue calls
- Scheduled_Calls shows: 300 (confusing!)
```

### After Fix:
```
Campaign: OutcomeMD Family Practice
- Total overdue: 300 calls
- Showing in Phone-Calls: ~300 calls (up to query limit)
  - 15 assigned (rolling window)
  - ~285 overdue (ALL expired + unassigned)
- Hidden: 0 (all available calls now visible)
- Scheduled_Calls shows: 300 (matches!)
```

## Why the 4-Hour Window Existed

Looking at the original comment:
> "Only check assignments that expired within the last 4 hours. Older expired assignments indicate the campaign has been inactive for too long"

**Original Intent**: Prevent showing "stale" calls from inactive campaigns

**Why This Was Wrong**:
1. If a campaign is active TODAY, all overdue calls should be available
2. The assignment expiry is 15 minutes - anything expired is fair game
3. The 4-hour window was arbitrary and created artificial scarcity
4. Better solution: If campaign is inactive, don't select it at all

## Performance Considerations

**Query Load**:
- Before: 150 overdue calls queried
- After: 300 overdue calls queried
- Impact: ~2x query size, but still reasonable

**Client-Side Filtering**:
- Still applies all filters (cooldown, timezone, future-date, etc.)
- Just now has more candidates to filter from
- Better to have more candidates and filter than hide them artificially

**If Performance Becomes an Issue**:
- Could add Firestore index on `scheduledDate` 
- Filter server-side for calls due <= today
- Would reduce client-side work

## Related Issues

This fix addresses the discrepancy between:
- **Phone-Calls page**: Shows calls ready to work (with artificial 4h limit - NOW REMOVED)
- **Scheduled_Calls page**: Shows all scheduled calls (no time limit)

Both should now be closer in alignment for overdue calls.

## Testing Instructions

1. **Select OutcomeMD Family Practice** (or any campaign with many overdue calls)
2. **Hard-refresh** (Ctrl+Shift+R)
3. **Check console**:
   - Should see MORE `⏰ Found expired assignment` messages
   - Should see calls expired hours or days ago (not just last 4 hours)
4. **Check call count**:
   - Should see significantly more calls available
   - Should match closer to Scheduled_Calls count

---

**Status**: Fix deployed
**Date**: Feb 3, 2026, 3:00 PM MT  
**Priority**: HIGH - Was artificially limiting agent call availability
**Files Modified**: `team/phone-calls.html` (removed 4-hour expiry threshold, increased limit to 300)
**Impact**: Agents will now see ALL overdue calls, not just recently expired ones
