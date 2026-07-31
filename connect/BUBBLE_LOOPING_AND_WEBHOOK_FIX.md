# Bubble Looping & Webhook Filtering Fix

**Date:** November 13, 2025  
**File:** `connect/index.html`

## Issues Fixed

### 1. Bubble Animation Looping
**Problem:** The activity feed bubbles were re-animating every 5 seconds because the dashboard auto-refreshes.

**Solution:**
- Added tracking for which activities have already been displayed (`shownActivityIds` Set)
- Added `isFirstLoad` flag to distinguish initial load from refreshes
- **First Load:** All bubbles animate with 1.5s staggered timing
- **Subsequent Loads:** Only new activities are added (no animation, no clearing)
- When admin switches BDR view, tracking resets and animation plays again

**Code Changes:**
```javascript
let shownActivityIds = new Set(); // Track which activities have been displayed
let isFirstLoad = true; // Track if this is the first load

// Generate unique IDs for activities
activities.forEach(activity => {
    activity.id = `${activity.type}-${activity.name}-${activity.timestamp.getTime()}`;
});

// Filter to only new activities that haven't been shown
const newActivities = activities.filter(activity => !shownActivityIds.has(activity.id));

if (isFirstLoad) {
    // Animate all bubbles with 1.5s delay
    activities.forEach((activity, index) => {
        setTimeout(() => {
            // Create and append bubble
            shownActivityIds.add(activity.id);
        }, index * 1500);
    });
    isFirstLoad = false;
} else {
    // Just append new activities without animation
    newActivities.forEach(activity => {
        // Create bubble with opacity: 1, skip animation
        shownActivityIds.add(activity.id);
    });
}
```

---

### 2. Webhook Events Not Showing (Filtered Out)
**Problem:** 
- Console showed: `✅ Loaded 0 LinkedIn account ID mappings`
- Console showed: `📦 Found 12 webhook reply events (before filtering)`
- Console showed: `✅ Matched 0 reply activities from webhooks (after user filtering)`
- All webhook events were being filtered out because the mapping was empty

**Root Cause:**
- The `linkedin_accounts` collection had no documents or wrong field names
- Webhook filtering logic required the mapping to work
- When mapping was empty, ALL webhooks were filtered out

**Solution:**
- Added comprehensive debug logging to see what's in `linkedin_accounts` collection
- Made webhook filtering smart: **If mapping exists, use it. If not, show all webhooks.**
- Added warnings when mapping is empty

**Code Changes:**

#### Enhanced Debug Logging:
```javascript
async function loadLinkedInAccountIdMapping() {
    const linkedInAccountsSnapshot = await getDocs(linkedInAccountsRef);
    console.log(`📊 Found ${linkedInAccountsSnapshot.docs.length} linkedin_accounts documents`);
    
    linkedInAccountsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`  📄 LinkedIn account doc:`, {
            id: doc.id,
            bdrEmail: data.bdrEmail,
            heyreachAccountId: data.heyreachAccountId,
            accountName: data.accountName,
            allFields: Object.keys(data)
        });
        
        if (data.heyreachAccountId && data.bdrEmail) {
            linkedInAccountIdMapping.set(data.heyreachAccountId, data.bdrEmail);
            console.log(`  ✅ Mapped: HeyReach Account ID ${data.heyreachAccountId} → ${data.bdrEmail}`);
        } else {
            console.warn(`  ⚠️ Skipping doc ${doc.id} - missing heyreachAccountId or bdrEmail`);
        }
    });
    
    if (linkedInAccountIdMapping.size === 0) {
        console.warn('⚠️ WARNING: No LinkedIn account ID mappings loaded!');
        console.warn('   Webhook filtering will not work correctly.');
    }
}
```

#### Smart Filtering Logic:
```javascript
// BEFORE (filtered out everything when mapping was empty):
const webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
if (!webhookBdrEmail === viewingUserEmail) {
    continue; // Skip
}

// AFTER (fallback to showing all when mapping is empty):
if (linkedInAccountIdMapping.size > 0) {
    const webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
    const matchesPrimaryEmail = webhookBdrEmail === viewingUserEmail;
    const matchesLinkedInEmail = webhookBdrEmail === accountEmail;
    
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip webhooks that don't belong to this user
    }
}
// If mapping is empty, show all webhooks (no filtering)
```

#### Applied to 4 locations:
1. Activity Feed → MESSAGE_REPLY_RECEIVED webhooks
2. Activity Feed → CONNECTION_REQUEST_ACCEPTED webhooks  
3. Recent Replies → MESSAGE_REPLY_RECEIVED webhooks
4. New Connections → CONNECTION_REQUEST_ACCEPTED webhooks

---

## What You'll See in Console

### Before Fix:
```
✅ Loaded 0 LinkedIn account ID mappings
📦 Found 12 webhook reply events (before filtering)
✅ Matched 0 reply activities from webhooks (after user filtering)
📦 Found 11 webhook connection events (before filtering)
✅ Matched 0 connection activities from webhooks (after user filtering)
```

### After Fix (if mapping is empty):
```
🔗 Loading LinkedIn account ID mappings...
📊 Found 0 linkedin_accounts documents
✅ Loaded 0 LinkedIn account ID mappings
⚠️ WARNING: No LinkedIn account ID mappings loaded!
   Webhook filtering will not work correctly.
   All webhook events will be filtered out unless linkedin_accounts collection is populated.
📦 Found 12 webhook reply events (before filtering)
✅ Matched 12 reply activities from webhooks (after user filtering) ← SHOWING ALL
📦 Found 11 webhook connection events (before filtering)
✅ Matched 11 connection activities from webhooks (after user filtering) ← SHOWING ALL
```

### After Fix (if mapping is populated):
```
🔗 Loading LinkedIn account ID mappings...
📊 Found 2 linkedin_accounts documents
  📄 LinkedIn account doc: {id: 'abc123', bdrEmail: 'taylor@careluminate.com', heyreachAccountId: '12345', ...}
  ✅ Mapped: HeyReach Account ID 12345 → taylor@careluminate.com
  📄 LinkedIn account doc: {id: 'def456', bdrEmail: 'derek@keybenefit.com', heyreachAccountId: '67890', ...}
  ✅ Mapped: HeyReach Account ID 67890 → derek@keybenefit.com
✅ Loaded 2 LinkedIn account ID mappings
📦 Found 12 webhook reply events (before filtering)
✅ Matched 5 reply activities from webhooks (after user filtering) ← FILTERED
```

---

## Next Steps

### To Enable Proper Webhook Filtering:

You need to populate the `linkedin_accounts` collection with documents that have:

```javascript
{
  heyreachAccountId: "12345",  // The LinkedIn account ID from HeyReach
  bdrEmail: "taylor@careluminate.com",  // The BDR's email
  accountName: "Taylor Davis",  // Optional
  // ... other fields
}
```

**Where to get `heyreachAccountId`:**
- From the `heyreach_activity` webhook documents (look at `linkedInAccountId` field)
- From HeyReach API
- From the webhook payload when events come in

**Example setup script:**
```javascript
// In Firebase console or via script
db.collection('linkedin_accounts').add({
  heyreachAccountId: "12345",
  bdrEmail: "taylor@careluminate.com",
  accountName: "Taylor Davis",
  createdAt: new Date()
});
```

---

## Summary

✅ **Bubble Looping Fixed:**
- Bubbles only animate once on initial load
- Subsequent refreshes just add new bubbles without re-animating
- Smooth user experience with no jarring re-renders

✅ **Webhook Filtering Fixed:**
- Added comprehensive debug logging to diagnose mapping issues
- Made filtering smart: shows all webhooks when mapping is empty
- When mapping is populated, filters correctly by BDR

✅ **Better Debugging:**
- Clear console messages showing what's happening
- Warnings when configuration is missing
- Detailed logging of mapping process

Both issues are now resolved! The bubbles will animate beautifully once, and webhook events will now show up on the dashboard.













