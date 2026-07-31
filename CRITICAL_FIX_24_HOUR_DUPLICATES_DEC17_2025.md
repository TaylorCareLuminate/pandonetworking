# 🚨 CRITICAL FIX: 24-Hour Duplicate Calls - Dec 17, 2025

## Executive Summary

**Reported By:** User  
**Date Reported:** December 17, 2025  
**Severity:** CRITICAL - Customer satisfaction risk, compliance issue  
**Status:** ✅ FIXED (2 ISSUES IDENTIFIED & RESOLVED)

### Issues Reported

Duplicate calls were being made to the same contacts within 24 hours, despite cooldown checks being in place. The call_manager showed several duplicate calls occurring on the same day.

**Example from call_manager:**
- **Alishia Ebel** - Called twice in 24h (campaign_1762401107769)
- **Richard Hicks** - Called twice in 24h (campaign_1762401107769)  
- **Charles Cooper** - Called twice in 24h (campaign_1762401107769)
- **Lauren Ball** - Called twice in 24h (campaign_1762401107769)

All within **14 minutes** (9:19 AM to 9:33 AM on 12/17/2025).

## Root Cause Analysis

### TWO SEPARATE ISSUES IDENTIFIED

After investigation, we found **TWO distinct root causes** for the duplicate calls:

---

## ISSUE #1: Cross-Campaign Duplicates

### The Problem

The duplicate prevention system had a **MAJOR FLAW**: it only checked for recent calls **within the same campaign**. 

**Critical Code Flaw:**
```javascript
// OLD CODE - Only checked same campaign
const completedRecentQuery = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', campaignId),  // ❌ CAMPAIGN FILTER
    where('status', '==', 'completed'),
    where('completedAt', '>=', cooldownThreshold)
);
```

**What This Meant:**
- If Contact X exists in Campaign A and Campaign B
- Agent calls Contact X in Campaign A at 10:00 AM
- System updates `phoneLastCalledAt` only on activities in Campaign A
- At 11:00 AM, Agent can call Contact X again in Campaign B
- **Result: Same person called twice within 1 hour!**

### Where the Bug Existed

The campaign filter was present in **4 critical locations**:

1. **Line ~4498** - `assignCallsToUser()` - When assigning calls to agents, only checked cooldown within the campaign being assigned
2. **Line ~3398** - `loadCalls()` overview section - Building cooldown filter for campaign overview
3. **Line ~4895** - `loadCalls()` main query - Building main cooldown filter
4. **Line ~6791** - `checkForDuplicateContact()` - Warning shown to agents only checked same campaign
5. **Line ~8147** - `recordOutcome()` - When updating `phoneLastCalledAt`, only updated activities in the same campaign

---

## ISSUE #2: Same-Campaign Duplicates (Rescheduler)

### The Problem

The **reschedule_campaigns_calls.html** file was creating phone_activities **WITHOUT any duplicate prevention check**.

**Critical Code Flaw:**
```javascript
// OLD CODE - NO DUPLICATE CHECK
await setDoc(doc(db, 'phone_activities', callId), phoneActivity);
// ❌ Just creates it, no check if it already exists!
```

**What This Meant:**
- Campaign rescheduler runs to schedule calls
- Creates phone_activities for all contacts
- If rescheduler runs again (or while activities exist), creates **duplicates**
- Multiple agents get assigned the same contact
- **Result: Same person called multiple times within minutes!**

### Why This Wasn't Caught Before

The November 26, 2025 fix added duplicate prevention to:
- ✅ `campaign_schedule.html` - Has duplicate prevention
- ✅ `ppc_manual_scheduler.html` - Has duplicate prevention  
- ✅ `mail_campaign_hotsheet.html` - Has duplicate prevention
- ❌ **`reschedule_campaigns_calls.html` - MISSING duplicate prevention** ← This was the problem!

---

## Fixes Applied

### ✅ Fix #1: Cross-Campaign phoneLastCalledAt Updates (ISSUE #1)

**File:** `team/phone-calls.html` (Line ~8147)

**OLD CODE:**
```javascript
const samePhoneQuery = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', selectedCampaign),  // ❌ REMOVED
    where('status', 'in', ['pending', 'scheduled'])
);
```

**NEW CODE:**
```javascript
// Query all pending/scheduled activities ACROSS ALL CAMPAIGNS
// 🔥 CRITICAL FIX: Remove campaign filter to prevent duplicates across campaigns
// This ensures if Contact X is called in Campaign A, they won't be called in Campaign B within 72h
const samePhoneQuery = query(
    collection(db, 'phone_activities'),
    where('status', 'in', ['pending', 'scheduled'])
);
```

**Impact:** When a call is completed, `phoneLastCalledAt` is now updated on ALL pending activities with that phone number, regardless of campaign.

---

### ✅ Fix #2: Cross-Campaign Cooldown Check in Assignment (ISSUE #1)

**File:** `team/phone-calls.html` (Line ~4498)

**OLD CODE:**
```javascript
const completedRecentQuery = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', campaignId),  // ❌ REMOVED
    where('status', '==', 'completed'),
    where('completedAt', '>=', cooldownThreshold)
);
```

**NEW CODE:**
```javascript
// 🔥 CRITICAL FIX DEC 17: Check ALL campaigns, not just current campaign
// This prevents duplicate calls when the same contact exists in multiple campaigns
const completedRecentQuery = query(
    collection(db, 'phone_activities'),
    where('status', '==', 'completed'),
    where('completedAt', '>=', cooldownThreshold)
);
```

**Impact:** When assigning calls to agents, the system now checks if ANY campaign has called this contact in the last 72 hours.

---

### ✅ Fix #3: Cross-Campaign Cooldown Check in loadCalls (Location 1) (ISSUE #1)

**File:** `team/phone-calls.html` (Line ~3398)

Same fix as #2 - removed campaign filter from cooldown query.

---

### ✅ Fix #4: Cross-Campaign Cooldown Check in loadCalls (Location 2) (ISSUE #1)

**File:** `team/phone-calls.html` (Line ~4895)

Same fix as #2 - removed campaign filter from cooldown query.

---

### ✅ Fix #5: Cross-Campaign Duplicate Warning (ISSUE #1)

**File:** `team/phone-calls.html` (Line ~6791)

**Impact:** The warning banner that shows agents "⛔ CALLED WITHIN 24 HOURS" now checks across all campaigns, not just the current one.

---

### ✅ Fix #6: Duplicate Prevention in Rescheduler (ISSUE #2)

**File:** `crm/reschedule_campaigns_calls.html` (Line ~1813)

**NEW CODE:**
```javascript
// 🔥 CRITICAL FIX DEC 17: Check for existing phone_activities to prevent duplicates
// This prevents creating duplicate calls when rescheduler runs multiple times
const existingPhoneQuery = query(
    collection(db, 'phone_activities'),
    where('outreachSetId', '==', outreachSet.id),
    where('campaignId', '==', selectedCampaign.id),
    where('callNumber', '==', call.callNumber),
    where('status', 'in', ['pending', 'scheduled', 'callback-scheduled'])
);

const existingPhoneSnapshot = await getDocs(existingPhoneQuery);

if (!existingPhoneSnapshot.empty) {
    log(`  ⏭️ DUPLICATE SKIPPED: Call ${call.callNumber} already exists`, 'warning');
    duplicatesSkipped++;
    continue; // Skip creating duplicate
}

// Only create if no duplicate exists
await setDoc(doc(db, 'phone_activities', callId), phoneActivity);
```

**Impact:** The rescheduler now checks if a phone_activity already exists before creating a new one. If it exists, it skips creation and logs "DUPLICATE SKIPPED".

---

## How It Works Now

### ISSUE #1 - Before Fix (Cross-Campaign):
```
Campaign A: Contact X called at 10:00 AM
Campaign B: Contact X called at 11:00 AM ❌ DUPLICATE!
```

### ISSUE #1 - After Fix (Cross-Campaign):
```
Campaign A: Contact X called at 10:00 AM
            ↓ phoneLastCalledAt updated on ALL campaigns
Campaign B: Contact X filtered out (within 72h cooldown) ✅
```

### ISSUE #2 - Before Fix (Rescheduler):
```
Rescheduler Run #1: Creates phone_activity for Contact X
Rescheduler Run #2: Creates ANOTHER phone_activity for Contact X ❌ DUPLICATE!
Agent A: Gets assigned Contact X
Agent B: Gets assigned Contact X (duplicate)
Result: Contact X called twice within minutes
```

### ISSUE #2 - After Fix (Rescheduler):
```
Rescheduler Run #1: Creates phone_activity for Contact X
Rescheduler Run #2: Checks... activity exists... SKIPS ✅
Agent A: Gets assigned Contact X
Agent B: Gets assigned different contact
Result: Contact X called only once
```

---

## Testing & Verification

### How to Verify the Fix is Working

#### For ISSUE #1 (Cross-Campaign):

1. **Check Console Logs:**
   ```
   Look for: "✅ Updated phoneLastCalledAt on X activities across ALL campaigns"
   Should say "ALL campaigns" not "in campaign [ID]"
   ```

2. **Check Assignment Logs:**
   ```
   Look for: "🕒 Assignment cooldown filter (ALL campaigns): X outreachIds, Y phones from last 72h"
   Should say "(ALL campaigns)" not just showing one campaign
   ```

3. **Check Load Calls Logs:**
   ```
   Look for: "🔍 Retrieved X completed calls across ALL campaigns for cooldown filter"
   Should say "across ALL campaigns"
   ```

4. **Test Cross-Campaign Duplicates:**
   - Find a contact that exists in multiple campaigns
   - Call them in Campaign A
   - Immediately check Campaign B's queue
   - **Expected:** Contact should NOT appear in Campaign B's queue
   - **Expected:** If manually checking, should see "⛔ CALLED WITHIN 24 HOURS" warning

#### For ISSUE #2 (Rescheduler):

1. **Run Rescheduler Twice:**
   - Go to `reschedule_campaigns_calls.html`
   - Select a campaign and run "Analyze Campaign"
   - Run it again immediately
   - **Expected:** Second run should show "DUPLICATE SKIPPED" messages

2. **Check Rescheduler Logs:**
   ```
   Look for: "⏭️ DUPLICATE SKIPPED: Call X already exists for [Contact Name]"
   Look for: "✅ Prevented X duplicate phone activities from being created"
   ```

3. **Verify No Duplicate phone_activities:**
   - Check `phone_activities` collection in Firestore
   - Query for same outreachSetId + campaignId + callNumber
   - **Expected:** Should have exactly 1 record per combination

### Monitoring

**In call_manager:**
- The "Duplicates (Within 24 Hours)" filter should show ZERO duplicates after this fix
- If duplicates still appear, check:
  1. Was the fix deployed?
  2. Are the console logs showing "ALL campaigns"?
  3. Is `phoneLastCalledAt` being set correctly?

**Key Fields to Monitor:**
- `phoneLastCalledAt` - Should be set on all activities with same phone number (all campaigns)
- `phoneNormalized` - Should be set to the cleaned 10-digit phone number
- `assignedTo` - Should be cleared if contact was just called

---

## Performance Considerations

### ⚠️ Potential Impact

Removing the `campaignId` filter means these queries now scan more documents:

**Before:** ~50-500 documents per campaign  
**After:** ~500-5,000 documents across all campaigns

### ✅ Mitigation

1. **Firestore Index:** Ensure composite index exists:
   - Collection: `phone_activities`
   - Fields: `status` (Ascending), `completedAt` (Descending)

2. **Limit Results:** Already using `limit(1000)` in duplicate check queries

3. **Fast Path:** Primary cooldown check uses `phoneLastCalledAt` field (fast!)
   - Fallback to completed calls set only if field not set

4. **Caching:** Recent calls are loaded once and reused during session

---

## Related Files

- ✅ **HealthLuminateSiteFromLocal/team/phone-calls.html** - Cross-campaign fixes (ISSUE #1)
- ✅ **HealthLuminateSiteFromLocal/crm/reschedule_campaigns_calls.html** - Rescheduler fix (ISSUE #2)
- ✅ **HealthLuminateSiteFromLocal/crm/campaign_schedule.html** - Already has duplicate prevention (Nov 26)
- ✅ **HealthLuminateSiteFromLocal/crm/ppc_manual_scheduler.html** - Already has duplicate prevention (Nov 26)
- ✅ **HealthLuminateSiteFromLocal/crm/mail_campaign_hotsheet.html** - Already has duplicate prevention (Nov 26)
- 📊 **HealthLuminateSiteFromLocal/crm/call_manager.html** - Duplicate detection (read-only, for monitoring)
- 📄 **HealthLuminateSiteFromLocal/CRITICAL_FIX_SAME_CAMPAIGN_DUPLICATES_DEC17_2025.md** - Detailed doc for ISSUE #2

---

## Additional Notes

### Why 72 Hours?

The cooldown is set to 72 hours (3 days) to:
- Prevent annoying customers with repeated calls
- Allow time for contacts to respond to emails/voicemails
- Reduce campaign fatigue
- Improve overall campaign success rates

### phoneLastCalledAt Field

This field is the "fast path" for cooldown checks:
- Updated immediately when call is completed
- Set on ALL activities with same phone number (all campaigns)
- Enables quick filtering without querying completed calls
- Format: ISO string (e.g., "2025-12-17T14:30:00.000Z")

---

## Rollback Procedure (If Needed)

If this fix causes issues, revert by adding back the campaign filter:

```javascript
// Add this line back to all 5 locations:
where('campaignId', '==', campaignId),  // or selectedCampaign
```

**Note:** This should only be used as a temporary measure. The duplicate issue will return.

---

## Success Metrics

After deployment, monitor for:

### For ISSUE #1 (Cross-Campaign):
✅ **Zero cross-campaign duplicates within 72 hours**  
✅ **Console logs show "ALL campaigns"** in cooldown messages  
✅ **Agents see duplicate warnings** when contact was called in ANY campaign  
✅ **No performance degradation** in call loading times

### For ISSUE #2 (Rescheduler):
✅ **Zero same-campaign duplicates** (as shown in call_manager)  
✅ **Rescheduler shows "DUPLICATE SKIPPED"** on subsequent runs  
✅ **Rescheduler can be run multiple times safely**  
✅ **No duplicate phone_activities created**

### Overall:
✅ **call_manager shows ZERO duplicates** in "Duplicates (Within 24 Hours)" filter  
✅ **Agents report no duplicate contacts** in their queues  

---

## Timeline

- **Issue Reported:** December 17, 2025
- **Root Cause Identified:** December 17, 2025
- **Fix Applied:** December 17, 2025
- **Status:** ✅ COMPLETE - Ready for testing

---

## Contact

For questions about this fix, contact the development team.

**Priority:** CRITICAL - Deploy ASAP to prevent customer complaints and compliance issues.

