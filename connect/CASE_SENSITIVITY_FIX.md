# Dashboard Case Sensitivity Fix

## Problem

The dashboard was incorrectly filtering webhook data when the BDR email addresses had different casing between collections:

- `bdr_leaders` collection had: `derek.Moore@keybenefit.com` (capital 'M')
- `linkedin_accounts` collection had: `derek.moore@keybenefit.com` (lowercase 'm')

Since JavaScript string comparison is **case-sensitive**, the filtering logic failed:
```javascript
"derek.Moore@keybenefit.com" !== "derek.moore@keybenefit.com" // true - they're different!
```

This caused the webhook filtering to fail, and the dashboard showed activities from all BDRs instead of filtering to the selected one.

## Root Cause

When you selected "Derek Moore" from the dropdown:
1. The selector value was `derek.Moore@keybenefit.com` (from `bdr_leaders.primaryEmail`)
2. The mapping had `derek.moore@keybenefit.com` (from `linkedin_accounts.bdrEmail`)
3. The comparison `webhookBdrEmail === accountEmail` failed due to case mismatch
4. Without a matching email, the webhook data wasn't filtered properly

## Solution

**Normalized ALL email addresses to lowercase** throughout the entire filtering pipeline:

### 1. LinkedIn Account Mappings (Lines 854-868)
```javascript
// Map heyreachAccountId to bdrEmail (NORMALIZE EMAIL TO LOWERCASE)
if (data.heyreachAccountId && data.bdrEmail) {
    const normalizedEmail = data.bdrEmail.toLowerCase();
    linkedInAccountIdMapping.set(data.heyreachAccountId, normalizedEmail);
}

// Map LinkedIn URL to bdrEmail (NORMALIZE EMAIL TO LOWERCASE)
if (data.linkedInUrl && data.bdrEmail) {
    const normalizedEmail = data.bdrEmail.toLowerCase();
    const normalizedUrl = data.linkedInUrl.toLowerCase().replace(/\/$/, '');
    linkedInUrlMapping.set(normalizedUrl, normalizedEmail);
}
```

### 2. LinkedIn Email Associations (Lines 817-825)
```javascript
linkedInEmailAssociations.forEach((doc) => {
    const data = doc.data();
    if (data.primaryEmail && data.linkedInEmail) {
        // Normalize both emails to lowercase for case-insensitive lookups
        linkedInEmailAssociations.set(
            data.primaryEmail.toLowerCase(), 
            data.linkedInEmail.toLowerCase()
        );
    }
});
```

### 3. Dashboard Loading (Lines 976-979, 952-954)
```javascript
// Normalize when loading dashboard for a specific user
const linkedInEmail = linkedInEmailAssociations.get(viewingUserEmail.toLowerCase());
accountEmail = (linkedInEmail || viewingUserEmail).toLowerCase();
```

### 4. Webhook Filtering (Lines 1219-1247, applied to both replies and connections)
```javascript
// Method 1: Direct bdrEmail field
if (data.bdrEmail) {
    webhookBdrEmail = data.bdrEmail.toLowerCase();
}
// Methods 2 & 3 already return lowercase from the normalized maps

// Apply filtering with case-insensitive comparison
if (webhookBdrEmail) {
    const matchesPrimaryEmail = webhookBdrEmail === viewingUserEmail.toLowerCase();
    const matchesLinkedInEmail = webhookBdrEmail === accountEmail.toLowerCase();
    
    if (!matchesPrimaryEmail && !matchesLinkedInEmail) {
        continue; // Skip webhooks that don't belong to this user
    }
}
```

### 5. Legacy Activity Filtering (Lines 1061-1063)
```javascript
// Match against BOTH the primary email AND the LinkedIn email (CASE-INSENSITIVE)
const matchesPrimaryEmail = possibleUserEmail?.toLowerCase() === viewingUserEmail.toLowerCase();
const matchesLinkedInEmail = possibleUserEmail?.toLowerCase() === accountEmail.toLowerCase();
```

### 6. BDR Leaders Selector (Line 904)
```javascript
const linkedInEmail = linkedInEmailAssociations.get(data.primaryEmail.toLowerCase());
```

### 7. User Email Initialization (Line 933)
```javascript
// When user logs in, normalize their email
currentUserEmail = user.email.toLowerCase();
viewingUserEmail = currentUserEmail; // Already lowercase
```

### 8. Dropdown Change Handler (Line 913)
```javascript
// When admin selects a different BDR from dropdown, normalize the email
viewingUserEmail = (e.target.value || currentUserEmail).toLowerCase();
```

This was a **critical fix** - the dropdown value (e.g., `derek.Moore@keybenefit.com`) was not being normalized, causing all subsequent comparisons to fail!

### 9. Enhanced Debug Logging (Lines 1246-1248, 1417-1429)
```javascript
// Added detailed filtering logs to see exactly what's being compared
console.log(`  🔍 FILTER CHECK: webhookBdrEmail="${webhookBdrEmail}" vs viewingUser="${viewingUserEmail.toLowerCase()}" (${matchesPrimaryEmail}) vs accountEmail="${accountEmail.toLowerCase()}" (${matchesLinkedInEmail})`);
```

## Impact

Now, **regardless of the casing** used in any Firestore collection, the dashboard will correctly filter data:
- ✅ `derek.Moore@keybenefit.com` matches `derek.moore@keybenefit.com`
- ✅ `DEREK.MOORE@KEYBENEFIT.COM` matches `derek.moore@keybenefit.com`
- ✅ All email comparisons are case-insensitive

## Testing

After this fix, when you:
1. Select "Derek Moore" from the dropdown
2. The logs should show mappings and comparisons using normalized (lowercase) emails
3. The dashboard should correctly filter to ONLY Derek Moore's activities
4. No activities from other BDRs (like Taylor Davis or OutcomeMD) should appear

## Files Changed

- `HealthLuminateSiteFromLocal/connect/index.html` - All email normalizations implemented

## Next Steps

Refresh the dashboard and test filtering to each BDR. The filtering should now work correctly regardless of email casing differences in the database.

