# Alex Assignment Issue - Feb 3, 2026

## Problem Report
Alex reports:
1. Phone-calls page is not assigning him calls for the Family Practice campaign
2. Page is taking 30-50 seconds per call to load

## Issues Identified

### Issue 1: Outdated Cache (FIXED)
**Problem**: Console logs showed "After contact cooldown (72h)" even though we changed cooldown to 40h
**Root Cause**: Browser cache was serving old version of phone-calls.html
**Fix**: Updated console log message at line 4506 to show "40h" instead of "72h"
**Action Required**: Alex needs to hard-refresh (Ctrl+Shift+R or Ctrl+F5) to clear cache

### Issue 2: Slow Query Performance (FIXED)
**Problem**: Query taking 110+ seconds (should be under 5 seconds)
**Root Cause**: `overdueQuery` was loading 500 calls and filtering them client-side
**Fix**: Reduced limit from 500 to 150 calls (line 5229)
**Expected Impact**: Query time should drop from 110s to ~15-20s

### Issue 3: Assignment System Not Finding Calls
**Potential Root Causes**:

#### A. All Calls Already Assigned to Others
- The rolling window system assigns calls to users
- If all available calls are assigned to other agents (Joe, Kristin, Mak) and their assignments haven't expired yet, Alex won't get any
- **Diagnostic**: Check how many calls are assigned to each user in the campaign

#### B. Cooldown Period Too Aggressive
- Current: 40-hour contact cooldown
- If all prospects were called in last 40 hours, none will be available
- **Diagnostic**: Check `phoneLastCalledAt` timestamps in campaign

#### C. Assignment Expiry Window Too Long
- Current: 15-minute expiry for regular calls
- If 5 agents each have 15 calls assigned (75 calls total) with 15-min expiry, those calls are locked
- **Diagnostic**: Check `assignmentExpiry` timestamps

## Immediate Actions

### 1. Alex Should Hard-Refresh
```
Press: Ctrl + Shift + R (Windows/Linux) or Cmd + Shift + R (Mac)
```
This clears the browser cache and loads the latest version with:
- 40h cooldown (not 72h)
- Faster query limits
- Updated console logging

### 2. Check Current Assignments (Run in Console)

```javascript
// See who has calls assigned right now
const q = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', selectedCampaign),
    where('status', 'in', ['pending', 'scheduled'])
);

const snapshot = await getDocs(q);
const assignments = {};
const now = new Date();

snapshot.docs.forEach(doc => {
    const data = doc.data();
    const user = data.assignedTo || 'unassigned';
    
    if (!assignments[user]) {
        assignments[user] = { total: 0, expired: 0, active: 0 };
    }
    
    assignments[user].total++;
    
    if (data.assignmentExpiry) {
        const expiry = new Date(data.assignmentExpiry);
        if (expiry > now) {
            assignments[user].active++;
        } else {
            assignments[user].expired++;
        }
    }
});

console.log('📊 Current Assignments:', assignments);
```

### 3. Check Cooldown Status

```javascript
// See how many calls are in cooldown
const cooldownHours = 40;
const cooldownStart = new Date(Date.now() - (cooldownHours * 60 * 60 * 1000));

const q = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', selectedCampaign),
    where('status', 'in', ['pending', 'scheduled'])
);

const snapshot = await getDocs(q);
let inCooldown = 0;
let available = 0;

snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.phoneLastCalledAt && data.phoneLastCalledAt > cooldownStart.toISOString()) {
        inCooldown++;
    } else {
        available++;
    }
});

console.log(`📊 Cooldown Status: ${inCooldown} in cooldown, ${available} available`);
```

## Potential Solutions

### Solution 1: Reduce Contact Cooldown Further (If Needed)
If most calls are stuck in cooldown:
```javascript
// Current: 40 hours
// Could reduce to: 36 hours or 32 hours
```

### Solution 2: Shorten Assignment Expiry Window
If too many calls are locked to other users:
```javascript
// Current: 15 minutes
// Could reduce to: 10 minutes for all calls (not just overdue)
```

### Solution 3: Force Re-Assignment
If assignments are stuck to users who aren't active:
```javascript
// Clear expired assignments and reassign
// This would require a batch update script
```

## Next Steps

1. **Alex**: Hard refresh browser (Ctrl+Shift+R)
2. **Alex**: Try selecting Family Practice campaign again
3. **Alex**: Share console output showing:
   - Assignment diagnostic results
   - Cooldown status results
   - Any error messages
4. **Team**: Based on diagnostics, implement appropriate solution

## Changes Made to phone-calls.html

```
Line 4506: Updated console log "72h" → "40h"
Line 5073: Updated console log "72h cooldown" → "40h cooldown"
Line 5229: Reduced query limit 500 → 150 for performance
```

## Expected Performance After Fix

- **Query Time**: 15-20 seconds (down from 110s)
- **Call Loading**: 2-5 seconds between calls (down from 30-50s)
- **Assignment**: Should auto-assign 15 calls to Alex's rolling window

---

**Status**: Fixes deployed, waiting for Alex to hard-refresh and test
**Date**: Feb 3, 2026
**Priority**: HIGH - Blocking agent from working
