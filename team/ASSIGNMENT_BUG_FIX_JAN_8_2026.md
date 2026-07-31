# Assignment Bug Fix - January 8, 2026

## Problem Summary
Multiple agents (Alex, Mak, Kristin, Justin) reported that they couldn't get calls assigned after 11 AM, despite having active reservations. Alex reserved 30 calls but only got 16 assigned and couldn't get more.

## Root Causes Identified

### 1. **Reservation Cap Bug** ⚠️ CRITICAL
**Location:** `team/phone-calls.html` line 5754-5756

**The Bug:**
```javascript
// OLD (BUGGY) CODE:
const targetBlockSize = reservedCallsToday > 0 
    ? Math.min(CALL_BLOCK_TARGET_SIZE, reservedCallsToday)  // ❌ WRONG!
    : CALL_BLOCK_TARGET_SIZE;
```

**The Problem:**
- User reserves **30 calls**
- `CALL_BLOCK_TARGET_SIZE` = **20**
- System calculates: `targetBlockSize = Math.min(20, 30) = 20`
- **System thinks user's limit is 20, not 30!**
- After getting 20 calls assigned, system refuses to assign more
- User's reservation of 30 is ignored

**The Fix:**
```javascript
// NEW (FIXED) CODE:
const targetBlockSize = reservedCallsToday > 0 
    ? reservedCallsToday  // ✅ Use full reservation!
    : CALL_BLOCK_TARGET_SIZE;
```

**Impact:** Users can now receive calls up to their full reservation amount (e.g., 30) instead of being capped at 20.

---

### 2. **Timezone Filter Too Restrictive** ⚠️ CRITICAL
**Location:** `team/phone-calls.html` line 3577

**The Bug:**
```javascript
// OLD (BUGGY) CODE:
endHour = 15;  // 3:00 PM Mountain Time
```

**The Problem:**
- System blocks calling after **3 PM MT** for contacts without timezone data
- At 3:15 PM MT, almost ALL available calls were filtered out
- Campaign 1 had 799+ calls filtered as "outside calling hours"
- Agents couldn't get calls assigned in the afternoon

**The Fix:**
```javascript
// NEW (FIXED) CODE:
endHour = 17;  // 5:00 PM Mountain Time (standard calling hours)
```

**Impact:** Calls are now available from 8 AM - 5 PM MT (instead of 8 AM - 3 PM), making hundreds more calls available in the afternoon.

---

### 3. **Rolling Window Not Reloading Queue** ⚠️ UX ISSUE
**Location:** `team/phone-calls.html` line 10940

**The Bug:**
- After completing a call, `ensureUserHasAssignedCalls()` assigns new calls to the **database**
- But the in-memory `callQueue` array was NOT reloaded
- Agents didn't see newly assigned calls until finishing entire queue
- Appeared as if "no more calls available"

**The Fix:**
```javascript
// NEW (FIXED) CODE:
const totalAssignedAfter = await ensureUserHasAssignedCalls(selectedCampaign);
if (totalAssignedAfter > 0) {
    console.log(`✅ Rolling window check complete: ${totalAssignedAfter} total calls assigned`);
    // Reload the call queue to pick up any newly assigned calls
    await loadPhoneActivities(false); // ✅ Reload queue!
    console.log(`📦 Call queue reloaded: ${assignedCountBefore} → ${callQueue.length} calls`);
}
```

**Impact:** This was REVERTED - rolling window contradicts block-based assignment. Agents should complete entire blocks before getting next block.

---

### 4. **Reservation Not Tracking Completed Calls** ⚠️ CRITICAL
**Location:** `team/phone-calls.html` - Added `getTotalCallsToday()` function

**The Bug:**
- System only counted **currently assigned** calls (status: pending/scheduled)
- Didn't count **completed** calls when checking reservation limit
- After completing Block 1 (20 calls), system thought: "0 assigned, can assign 30 more!"
- Agents could exceed their daily reservation

**Example of the Bug:**
1. Alex reserves 30 calls
2. Gets Block 1: 20 calls assigned
3. Completes all 20 → assignedCount drops to 0
4. System assigns Block 2: **30 MORE calls** (should be 10!)
5. Alex ends up with 50 total instead of 30

**The Fix:**
Created new function to track total calls today:
```javascript
async function getTotalCallsToday(userEmail, date) {
    // Count currently assigned calls (pending/scheduled with valid expiry)
    const assignedCount = [...];
    
    // Count completed calls TODAY (lastCallDate === today)
    const completedCount = [...];
    
    return assignedCount + completedCount;
}

// In ensureUserHasAssignedCalls:
const totalCallsToday = await getTotalCallsToday(userEmail, todayStr);
if (totalCallsToday >= targetBlockSize) {
    console.log('🚫 DAILY RESERVATION FULFILLED');
    return;
}

const remainingReservation = targetBlockSize - totalCallsToday;
const callsToAssign = Math.min(CALL_BLOCK_TARGET_SIZE, remainingReservation);
```

**Impact:** 
- Reservation now tracks **total calls today** (completed + assigned)
- After Block 1 (20 completed), Block 2 correctly assigns only 10 more
- Prevents exceeding daily reservation limit

---

## Related Fixes (Previously Completed)

### 4. **Malformed `assignedTo` Data**
**Location:** `team/reserve-calls.html`, `crm/scheduled_calls.html`

**The Bug:**
- Code was using `deleteField()` which creates malformed objects: `{_methodName: 'deleteField'}`
- These objects were being normalized by the CLEmail wrapper, masking the issue
- Caused incorrect counting and filtering of assigned calls

**The Fix:**
- Changed all `deleteField()` calls to set fields to `null` instead
- Prevents future malformed data from being created

---

## Testing Instructions

1. **Hard refresh** `phone-calls.html` (Ctrl+Shift+R)
2. Have an agent (Alex, Mak, Kristin, etc.) reserve calls (e.g., 30)
3. Click "Start Calling" on Campaign 1
4. Agent should get calls assigned (up to their reservation)
5. As agent completes calls, watch console - should see:
   - `✅ Rolling window check complete`
   - `🔄 Reloading call queue to pick up newly assigned calls...`
   - New calls should appear immediately
6. Agent should be able to receive up to their full reservation (30) throughout the day

---

## Expected Behavior After Fixes

### Scenario: Alex reserves 30 calls at 11 AM

**11:00 AM - Block 1:**
- Alex clicks "Start Calling" on **Campaign 1: Large PT Direct Outreach**
- Gets **20 calls assigned immediately** (full block, all at once)
- Works through all 20 calls (no mixing campaigns)

**After Completing Block 1:**
- System automatically checks: "Has Alex used his full reservation?"
- Calculation: 20 completed + 0 assigned = 20 total today
- Remaining reservation: 30 - 20 = **10 calls left**
- **Block 2 auto-assigns:** 10 calls from next available campaign (e.g., OutcomeMD)

**If Alex Switches Campaigns Mid-Block:**
- Has 4 calls remaining in Block 1
- Clicks different campaign → System unassigns those 4 calls
- Assigns new block from selected campaign
- Respects total reservation (30 total)

**If Alex Reloads Page:**
- Those 4 remaining calls **persist** until:
  - Alex clicks "Release my blocks"
  - Admin releases blocks
  - Midnight (auto-release)

**3:00 PM - 5:00 PM:**
- More calls become available (timezone window expanded to 5 PM)
- Blocks can be assigned throughout the afternoon
- No more timezone blocking at 3 PM

**End of Day:**
- Alex completes up to **30 total calls** (his reservation)
- Could be: 20 + 10, or 2 pinned + 16 + 12, etc.
- System tracks **completed + assigned** against reservation

---

## Files Modified

1. ✅ `team/phone-calls.html` (3 critical fixes)
2. ✅ `team/reserve-calls.html` (deleteField → null fix)
3. ✅ `crm/scheduled_calls.html` (deleteField → null fix, made available to all users)

---

## Notes

- The `CALL_BLOCK_TARGET_SIZE = 20` is still used as a **default** when no reservation exists
- When a reservation exists, the **full reservation** is now used as the target
- This allows for flexible block sizes while respecting user intent
- Agents who reserve more calls (30, 40, etc.) will now receive them throughout the day

---

## Status: ✅ FIXED
**Date:** January 8, 2026  
**Fixed By:** AI Assistant  
**Verified By:** [Pending user testing]

