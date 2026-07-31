# Phone Calls Structure Changes for Sam

## Overview

This document describes the changes made to `crm/phone_calls.html` to consolidate data into `phone_activities` as the single source of truth.

---

## Problem Statement

Previously, `phone_calls.html` was:
1. **Reading from multiple collections** to build the call queue and display stats:
   - `phone_activities` - main call data
   - `callForecasts` - to find forecast IDs for reservation matching
   - `callReservations` - to get user's reserved/committed calls
   
2. **Writing to multiple places** when tracking calls:
   - `campaign_call_tracking` - payment/outcome records
   - `campaign_pool_stats` - achievement pool tracking
   - `phone_activities` - call status updates

This caused:
- Slow response times (multiple queries)
- Data scattered across collections
- Need for complex joins in memory

---

## Solution: Single Source of Truth

### Collections We NOW Read From:
| Collection | Purpose | Notes |
|------------|---------|-------|
| `phone_activities` | ALL call data, queue stats, reservation tracking | **Single source of truth** |
| `campaign_call_tracking` | Performance stats (hourly/weekly/monthly) | Still read for payment history |

### Collections We NOW Write To:
| Collection | What We Write | Notes |
|------------|---------------|-------|
| `phone_activities` | Call outcomes, payment data, reservation/commitment tracking | **Primary - contains everything** |
| `campaign_call_tracking` | Payment records | **Keep for payment team** |
| `campaign_pool_stats` | Achievement pool tracking | Keep for now (could also consolidate later) |

### Collections We STOPPED Reading From:
| Collection | Why Removed | Previous Use |
|------------|-------------|--------------|
| `callForecasts` | No longer needed | Was used to map forecast IDs to campaigns |
| `callReservations` | Reservation data now calculated from `phone_activities` | Was used to get user's committed call counts |
| `outreach_sets` | Never read from in this file | N/A |
| `flaggedContacts` | Never read from in this file | N/A |

---

## Data Structure Changes

### New Fields Added to `phone_activities` Documents

When a call is tracked/completed, the following fields are now written to the `phone_activities` document:

#### Payment Tracking Fields (from campaign_call_tracking)
```javascript
{
    // Payment fields (previously only in campaign_call_tracking)
    basePayment: number,              // Base payment for the outcome (e.g., 0.50)
    achievementPoolAwarded: number,   // Bonus from achievement pool (if meeting scheduled)
    totalPayment: number,             // basePayment + achievementPoolAwarded
    contributesToPool: boolean,       // Whether this call contributes to achievement pool
    
    // Tracking metadata
    paymentTrackedAt: string,         // ISO timestamp when payment was recorded
    trackingId: string,               // Reference to campaign_call_tracking document ID
}
```

#### Reservation/Commitment Fields
```javascript
{
    // Reservation tracking (previously only in callReservations)
    userCommittedCalls: number,       // Number of calls user committed to for this campaign
    reservationDate: string,          // Date of the reservation
    reservationStatus: string,        // 'active', 'completed', etc.
}
```

---

## Function Changes

### 1. `trackCallPayment()` - MODIFIED

**Before:** Only wrote to `campaign_call_tracking`

**After:** Writes to BOTH `campaign_call_tracking` AND updates `phone_activities` with payment data

```javascript
// Now writes payment data to phone_activities
await updateDoc(doc(dbFS, 'phone_activities', currentCall.id), {
    basePayment: basePayment,
    achievementPoolAwarded: achievementPoolAwarded,
    totalPayment: totalPayment,
    contributesToPool: POOL_CONTRIBUTING_OUTCOMES.includes(outcome),
    paymentTrackedAt: now.toISOString(),
    trackingId: callId  // Reference to campaign_call_tracking document
});
```

### 2. `updateCallQueueStats()` - MODIFIED

**Before:** 
- Read from `phone_activities` to get calls due today
- Read from `callForecasts` to get forecast IDs
- Read from `callReservations` to get user's reserved call counts

**After:** Uses only `phone_activities` data:
- Counts calls due today by checking `scheduledDate` (unchanged)
- Counts pending/scheduled calls assigned to user OR unassigned calls as "reserved"
- No more queries to `callForecasts` or `callReservations`

```javascript
// New approach - count from phone_activities we already queried
phoneSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const assignedTo = data.assignedTo || data.completedBy || data.reservedBy || '';
    if (assignedTo === userEmail || !assignedTo) {
        totalReserved++;
    }
});
```

### 3. `updateQueueStatsDashboard()` - MODIFIED

**Before:** 
- Read from `phone_activities` for call counts
- Read from `callReservations` to get user's reserved calls and calculate completion rate

**After:** Uses only `phone_activities`:
- Completed calls counted from `completedAt` field (unchanged)
- Reserved calls counted from pending/scheduled activities assigned to user
- Completion rate calculated as `completedToday / (totalReservedCalls + completedToday)`

```javascript
// New approach - count reservations from phone_activities
activitiesSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.status === 'pending' || data.status === 'scheduled') {
        const assignedTo = data.assignedTo || data.completedBy || data.reservedBy || '';
        if (assignedTo === userEmail || !assignedTo) {
            totalReservedCalls++;
        }
    }
});
```

---

## Migration Notes

### Existing Data
- Existing `phone_activities` documents may not have the new payment fields
- The code handles this gracefully - fields are only added when calls are completed
- No backfill migration required

### Going Forward
- `reschedule_campaigns_calls.html` now writes timezone, alternate phones, and other data to `phone_activities` when scheduling
- All new calls scheduled will have the complete data set

---

## Collections Summary

### phone_activities (Single Source of Truth)
Contains:
- Contact information (name, email, phone, company, title, location)
- Timezone data (contactState, timezoneFromState, timezoneFromAreaCode)
- Alternate phone numbers (phone2, phone3)
- Scheduling information (scheduledDate, status, callNumber)
- Outcome information (outcome, completedAt, completedBy, notes)
- **Payment tracking** (basePayment, totalPayment, achievementPoolAwarded)
- **Call history** (previousCallCount, lastCallDate, lastCallOutcome, attemptNumber)
- Flag status (isFlagged, flagReason) - if applicable
- Referral information (if contact was referred)
- Callback information (if callback was scheduled)

### campaign_call_tracking (Keep for Payment Team)
Still contains:
- Full payment record for each completed call
- Used by payment team to calculate wages
- **No longer read by phone_calls.html for queue stats**

### callReservations (No Longer Read)
- Still exists for legacy data
- New reservation data stored in phone_activities
- May be deprecated in future

### callForecasts (No Longer Read)
- Still exists for legacy data
- **No longer queried by phone_calls.html**

---

## Benefits of This Change

1. **Faster Response Time**: Single query to phone_activities instead of 3+ queries
2. **Data Consistency**: All call data in one place
3. **Simpler Code**: No complex joins or data merging needed
4. **Easier Debugging**: One place to check for all call information
5. **Reduced Firebase Costs**: Fewer reads per page load

---

## What Still Writes to External Collections

| Collection | Written By | Purpose |
|------------|------------|---------|
| `campaign_call_tracking` | `trackCallPayment()` | Payment records for payment team |
| `campaign_pool_stats` | Pool stats functions | Achievement pool tracking |

These are kept for:
- Payment team workflows
- Historical compatibility
- Separation of concerns for financial data

---

## Testing Checklist

- [ ] Load phone calls page - should show calls from phone_activities only
- [ ] Complete a call - should update phone_activities AND campaign_call_tracking
- [ ] Check queue stats - should count from phone_activities only
- [ ] Check performance dashboard - should still show earnings from campaign_call_tracking
- [ ] Schedule callback - should create new phone_activities record
- [ ] Update phone number - should update phone_activities records

---

---

## Additional Changes: Reservation System Removed from team/phone-calls.html

### Why Reservations Were Removed
The reservation system was adding significant overhead and slowing down page loading. Users want to quickly:
1. See available campaigns
2. Select one
3. Start calling

The old reservation workflow required:
- Multiple Firebase queries to `callForecasts` and `callReservations`
- Complex calculations for "over-reserved" and "under-reserved" scenarios
- Rebalancing notifications and prompts
- Reservation management UI elements

### What Was Changed in `team/phone-calls.html`

#### UI Elements Removed/Simplified:
1. **Call workspace header** - Removed "Reserved Calls" and "Progress X of Y" displays
2. **Campaign cards** - Removed:
   - "All Reservations" stat box
   - "Available Now" with expected incoming calculations
   - "Your Reservations" stat box  
   - Reservation status/prompt sections
   - "Reserve Calls Now" and "Manage Reservations" buttons
3. **Added** - Simple "Start Calling" button on each campaign card

#### Functions Simplified:
1. `calculateReservationState()` - Now just counts completed calls, skips all reservation logic
2. `handleReservationNotifications()` - Returns immediately (no notifications)
3. `updateReservationDisplay()` - Just updates completed count, no reservation tracking
4. `checkReservationCompletion()` - Returns false immediately (no target to check)
5. `checkReservationLimit()` - Returns immediately (no limits)
6. `displayCampaignOverview()` - Simplified campaign cards without reservation info
7. `autoRebalanceUserReservations()` - Deprecated, shows info message

#### CSS Removed:
- `.reservation-editor` styles (no longer used)
- Mobile responsive styles for reservation editor

### Result
- **Faster page loading** - Fewer Firebase queries
- **Simpler UI** - Just show campaigns and let people start calling
- **Better UX** - No confusing reservation prompts or notifications

---

## Document Version
- **Created**: December 9, 2025
- **Updated**: December 9, 2025 (added reservation removal notes)
- **Author**: AI Assistant
- **For**: Sam
- **Files Changed**: 
  - `crm/phone_calls.html` (Single Source of Truth changes)
  - `team/phone-calls.html` (Reservation system removed)

