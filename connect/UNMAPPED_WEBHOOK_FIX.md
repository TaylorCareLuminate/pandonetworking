# Unmapped Webhook Fix

## Problem

When filtering the dashboard to a specific BDR (e.g., Derek Moore), users were seeing webhook activities (replies and connections) from OTHER accounts that couldn't be mapped. Specifically:

- **linkedInAccountId '115030'** (Bob Young's account) was NOT in the `linkedin_accounts` collection
- When the code tried to look up this account, `webhookBdrEmail` remained `null`
- The original logic had: `// If no mapping found, show all webhooks (can't filter)`
- **Any unmapped webhook fell through and was displayed to everyone!**

This meant:
- Derek's dashboard showed Derek's activities (correct) ✅
- Derek's dashboard ALSO showed Bob Young's activities (wrong!) ❌
- And any other unmapped accounts' activities

## Root Cause

In the webhook filtering logic for both replies and connections:

```javascript
if (webhookBdrEmail) {
    // Check if it matches the viewing user
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip
    }
}
// If no mapping found, show all webhooks (can't filter)
// <-- CODE FALLS THROUGH HERE and adds the activity anyway!

activities.push({ ... }); // This always executes if webhookBdrEmail is null
```

The comment said "can't filter" but then the code just... **added the activity anyway**. This was incorrect logic.

## Solution

**Skip ALL webhooks that can't be mapped** when filtering to a specific user:

### Replies Section (Lines 1253-1259)
```javascript
if (webhookBdrEmail) {
    // Check if it matches
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip webhooks that don't belong to this user
    }
} else {
    // No mapping found - skip this webhook (can't determine which user it belongs to)
    if (webhookRepliesCount < 3) {
        console.log(`  ⚠️ SKIPPING webhook - no mapping found for linkedInAccountId: ${data.linkedInAccountId}`);
    }
    continue; // <-- KEY FIX: Skip unmapped webhooks!
}
```

### Connections Section (Lines 1436-1442)
```javascript
if (webhookBdrEmail) {
    // Check if it matches
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue;
    }
} else {
    // No mapping found - skip this webhook (can't determine which user it belongs to)
    if (webhookConnectionsCount < 3) {
        console.log(`  ⚠️ SKIPPING connection webhook - no mapping found for linkedInAccountId: ${data.linkedInAccountId}`);
    }
    continue; // <-- KEY FIX: Skip unmapped webhooks!
}
```

## Impact

Now when filtering to Derek Moore:
- ✅ Derek's activities (linkedInAccountId: 104986) are included
- ❌ Taylor's activities (linkedInAccountId: 104063) are **skipped** (different user)
- ❌ Bob Young's activities (linkedInAccountId: 115030) are **skipped** (not mapped)
- ❌ Any other unmapped accounts are **skipped**

**Only activities that can be positively identified as belonging to the selected user are displayed.**

## Debug Logs

You'll now see warnings in the console for unmapped accounts:
```
⚠️ SKIPPING webhook - no mapping found for linkedInAccountId: 115030
⚠️ SKIPPING connection webhook - no mapping found for linkedInAccountId: 115030
```

These warnings help you identify which LinkedIn accounts need to be added to the `linkedin_accounts` collection in Firestore (via the admin panel at `/admin/email_controls.html`).

## Next Steps

1. **Refresh the dashboard** (Ctrl+Shift+R / Cmd+Shift+R)
2. **Select Derek Moore** from the dropdown
3. You should now see **ONLY Derek's activities**
4. Check the console for any `⚠️ SKIPPING webhook` warnings
5. If you see warnings, that means those accounts need their `heyreachAccountId` and `linkedInUrl` added in the admin panel

## Files Changed

- `HealthLuminateSiteFromLocal/connect/index.html` - Added `else` blocks to skip unmapped webhooks in both reply and connection filtering sections













