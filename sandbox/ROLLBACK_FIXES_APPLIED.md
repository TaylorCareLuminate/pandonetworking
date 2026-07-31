# Phone Calls Rollback - Fixes Applied

**Date**: January 19, 2026  
**Base Version**: Dec 31, 2025 snapshot (commit `e63f0460c`)  
**Target File**: `sandbox/phone-calls-rollback.html`

## Summary

Manually ported critical bug fixes from Jan 2-5, 2026 to the Dec 31 rollback version, WITHOUT bringing in the problematic "reservation system" changes.

## Fixes Applied

### 1. ✅ Centralized Bad Number & Declined Contact Filtering

**What was fixed:**
- Added `js/call-filtering.js` import
- Replaced inline filtering logic with centralized `CallFiltering` module
- Properly distinguishes between:
  - **Declined contacts**: Blocks entire contact (ID/email/phone)
  - **Bad numbers**: Blocks phone number only (alternate numbers still callable)
  - **Wrong person**: Blocks phone number only (alternate numbers still callable)

**Files changed:**
- Added script import: `<script src="../js/call-filtering.js"></script>`
- Updated `loadDeclinedContacts()` function to use `CallFiltering.buildBlockedContactSets()`
- Replaced 6 instances of inline `.has()` checks with `CallFiltering.isBlockedBySets()`

**Benefits:**
- Prevents bad numbers from reappearing in call lists
- Prevents declined contacts from showing up again
- Allows alternate phone numbers to be tried when one is marked "wrong person"
- Consistent filtering logic across all call-related pages

### 2. ✅ Company Cooldown (Already Present)

**Status**: The Dec 31 snapshot already had 30-hour company cooldown logic
- Prevents calling multiple contacts at the same company within 30 hours
- Tracks companies via `getPreviousCallInfo()` and displays warnings

### 3. ✅ Same-Company Call History (Already Present)

**Status**: The Dec 31 snapshot already had company-level call tracking
- Shows recent calls to other contacts at the same company
- Helps agents coordinate when calling the same organization

## What Was NOT Ported

### ❌ Reservation System Changes (Jan 2, 2026)
- "Option A blocks" assignment system
- Mandatory call reservation requirements
- "Calling plan" UI changes
- Campaign selection restrictions

**Reason**: These changes caused the problems that prompted the rollback

## Testing Checklist

- [ ] Page loads without errors
- [ ] Campaign buttons show correct call counts
- [ ] Declined contacts do NOT appear in call lists
- [ ] Bad numbers do NOT reappear
- [ ] Wrong-person marked numbers are blocked, but contact can appear with alternate phone
- [ ] Company cooldown prevents duplicate calls to same company
- [ ] Same-company call history displays correctly
- [ ] Console shows proper filtering logs from CallFiltering module

## Console Log Verification

When the page loads, you should see:
```
🗂️ Loading declined/blocked contacts from phone_activities (using CallFiltering module)...
✅ Blocked contact summary:
   📋 X contacts blocked by ID (declined)
   📧 X contacts blocked by email (declined)
   📞 X phone numbers blocked (declined/bad-number/wrong-person)
```

## Next Steps

1. Test `sandbox/phone-calls-rollback.html` thoroughly
2. If it works as expected, copy it to `team/phone-calls.html` for production
3. Keep current system in `sandbox/phone-calls.html` for continued development
