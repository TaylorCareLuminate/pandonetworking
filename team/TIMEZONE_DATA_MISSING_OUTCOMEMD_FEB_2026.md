# Timezone Data Missing - OutcomeMD Family Practice Not Loading
**Date:** February 3, 2026  
**Campaign:** OutcomeMD Family Practice
**Urgency:** HIGH  
**Status:** 🔍 DIAGNOSED

## Problem
OutcomeMD Family Practice campaign isn't loading any calls for agents. This is a recurring issue with new campaigns where timezone data is missing from prospect records.

## Root Cause
The phone-calls system has **strict timezone-based calling hours filtering** to ensure compliance. When contacts lack timezone information, the system applies a **very restrictive default**:

### Default Behavior (No Timezone Data)
- **Timezone:** Mountain Time (America/Denver)
- **Calling Hours:** 8:00 AM - 3:00 PM MT
- **Why Restrictive:** This converts to 10:00 AM - 5:00 PM ET (safe for Eastern contacts)
- **Problem:** If records lack timezone data AND it's outside this narrow window, NO calls load

### Code Location (phone-calls.html, lines 2800-2808)
```javascript
// If no timezone available, use Mountain Time with restricted hours
if (!timezone) {
    timezone = 'America/Denver';
    startHour = 8;    // 8:00 AM Mountain Time = 10:00 AM Eastern Time
    endHour = 15;     // 3:00 PM Mountain Time = 5:00 PM Eastern Time
    source = 'default (Mountain Time - Conservative)';
    console.log('» No timezone data for contact, using default Mountain Time (8 AM - 3 PM MT = 10 AM - 5 PM ET)');
}
```

### How Timezone Data Is Set
The system looks for two fields in `phone_activities`:
1. **`timezoneFromState`** - Calculated from contact's state (e.g., "CA" → "America/Los_Angeles")
2. **`timezoneFromAreaCode`** - Calculated from phone area code (e.g., "310" → "America/Los_Angeles")

If BOTH are missing, the restrictive default kicks in.

## Diagnostic Steps

### 1. Check Firestore Records
Query the `phone_activities` collection for OutcomeMD Family Practice campaign:

```javascript
// In browser console on phone-calls page:
const campaignId = 'OutcomeMD_Family_Practice'; // Replace with actual campaign ID

const q = query(
    collection(db, 'phone_activities'),
    where('campaignId', '==', campaignId),
    where('status', 'in', ['pending', 'scheduled']),
    limit(10)
);

getDocs(q).then(snap => {
    console.log(`Found ${snap.docs.length} activities`);
    snap.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`\nActivity ${i + 1}:`, {
            contactName: data.contactName,
            phoneNumber: data.phoneNumber,
            contactState: data.contactState || data.contact_state || data.state,
            timezoneFromState: data.timezoneFromState,
            timezoneFromAreaCode: data.timezoneFromAreaCode,
            phoneAreaCode: data.phoneAreaCode,
            hasState: !!(data.contactState || data.contact_state || data.state),
            hasPhone: !!data.phoneNumber
        });
    });
});
```

### 2. Expected Results

**If timezone data is MISSING:**
```javascript
{
    contactName: "John Doe",
    phoneNumber: "555-123-4567",
    contactState: undefined,  // ❌ MISSING
    timezoneFromState: undefined,  // ❌ MISSING
    timezoneFromAreaCode: undefined,  // ❌ MISSING
    hasState: false,
    hasPhone: true
}
```

**If timezone data is PRESENT:**
```javascript
{
    contactName: "John Doe",
    phoneNumber: "555-123-4567",
    contactState: "CA",  // ✅ PRESENT
    timezoneFromState: "America/Los_Angeles",  // ✅ CALCULATED
    timezoneFromAreaCode: "America/Los_Angeles",  // ✅ CALCULATED
    hasState: true,
    hasPhone: true
}
```

## Solutions

### Solution 1: Add Timezone Data to Existing Records (BEST)
Run the rescheduler to enrich existing `phone_activities` with timezone data from the source (outreach_sets or wherever the data comes from).

### Solution 2: Temporary Admin Override (QUICK FIX)
Enable admin timezone override to bypass timezone filtering temporarily:

1. On phone-calls page, scroll to Admin Controls
2. Enable "Override Timezone Filter"
3. This allows all calls to load regardless of timezone/calling hours
4. **USE CAREFULLY** - only for testing/emergency access

### Solution 3: Less Restrictive Default (RISKY)
Modify the default calling hours to be less restrictive, but this increases compliance risk:

```javascript
// Change from:
startHour = 8;    // 8 AM MT
endHour = 15;     // 3 PM MT

// To:
startHour = 7;    // 7 AM MT = 9 AM ET
endHour = 17;     // 5 PM MT = 7 PM ET
```

### Solution 4: Disable Timezone Filtering (NOT RECOMMENDED)
Set `FILTER_OUT_UNKNOWN_TIMEZONES` to `false` (already the default) and disable the calling hours check entirely. This creates compliance risk and is not recommended.

## Recommended Fix Workflow

1. **Verify the Issue:**
   - Run the diagnostic query above
   - Confirm that `timezoneFromState` and `timezoneFromAreaCode` are missing

2. **Check Source Data:**
   - Look at the `outreach_sets` or `customers` collection for this campaign
   - Verify if state/phone data exists in the source

3. **Re-run Rescheduler:**
   - If source data has states/phones, re-run the rescheduler
   - This will populate timezone fields in `phone_activities`

4. **If Source Data is Missing:**
   - Import data with state and phone fields
   - Or manually add state data to existing records
   - Then re-run rescheduler

5. **Temporary Workaround:**
   - Enable admin timezone override so agents can work while data is being fixed

## Why This Keeps Happening

This is a **data pipeline issue**:
1. New campaigns are created with contact data
2. Contacts are imported to `outreach_sets` or similar collection
3. Rescheduler creates `phone_activities` from that data
4. **If the source data lacks state/location info**, timezone fields stay empty
5. Timezone-aware filtering blocks all calls with missing data

## Prevention
- **Ensure all imported contact data includes:**
  - `state` or `contact_state` field
  - Valid `phoneNumber` with area code
- **Validate data before import**
- **Run timezone enrichment script immediately after campaign creation**

## Related Files
- `team/phone-calls.html` (lines 2790-2852) - Timezone checking logic
- `team/phone-calls.html` (lines 6317-6389) - Timezone calculation and filtering

## Console Logging to Watch
When you select OutcomeMD Family Practice campaign, watch for:
```
» No timezone data for contact, using default Mountain Time (8 AM - 3 PM MT = 10 AM - 5 PM ET)
🔍 Skipping [Contact Name] - Too early (before 8:00) or Too late (after 15:00)
      ↓ After timezone filter: 0 (removed XX)
```

If you see many contacts filtered by timezone with no timezone data, that's the issue!
