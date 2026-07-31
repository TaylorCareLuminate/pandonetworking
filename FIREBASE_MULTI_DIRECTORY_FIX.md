# Firebase Multi-Directory Authentication Fix

## Problem Summary

When opening pages in both `/crm` and `/connect` directories simultaneously, users were experiencing unexpected logouts in the `/connect` pages. 

## Root Cause

Both directories use the **same Firebase project** (`healthcareitdatabase`) for authentication, but they were initializing Firebase app instances independently without checking for existing instances. This caused:

1. **Multiple Firebase app instances** competing for the same `[DEFAULT]` name
2. **Auth state conflicts** where one instance would overwrite another's localStorage auth tokens
3. **False logouts** when Firebase would re-initialize and clear the existing auth state

## Solution

### 1. Updated `auth.js` (v1.2.3)

Modified `/js/auth.js` to check for existing Firebase app instances before initializing:

```javascript
// Check for existing Firebase app instance to prevent conflicts with /crm pages
const existingApps = getApps();
const existingDefaultApp = existingApps.find(a => a.name === '[DEFAULT]');

if (existingDefaultApp) {
  console.log('✅ Using existing Firebase [DEFAULT] app (avoiding conflict)');
  app = existingDefaultApp;
} else {
  console.log('🔥 Initializing new Firebase [DEFAULT] app');
  app = initializeApp(firebaseConfig);
}
```

### 2. Updated CRM Pages

Fixed the following CRM pages to check for existing Firebase instances:

- ✅ `tasks-list.html`
- ✅ `documents-dashboard.html`
- ✅ `agreement-builder.html`
- ✅ `mainpage.html` (already had the fix)
- ✅ `account-detail.html` (already had the fix)
- ✅ `contact-detail.html` (already had the fix)
- ✅ `opportunity-detail.html` (already had the fix)
- ✅ `contacts-list.html` (already had the fix)

### 3. Created Shared Initialization Script

Created `/js/shared-firebase-init.js` as a utility for consistent Firebase initialization across all pages (optional to use).

## How It Works

1. When a page loads, it checks if a Firebase app with name `[DEFAULT]` already exists
2. If it exists (e.g., from another open tab or directory), it **reuses** that instance
3. If it doesn't exist, it creates a new one
4. All pages now share the **same Firebase Auth instance**, preventing conflicts
5. Firebase Auth persistence (`browserLocalPersistence`) ensures auth state is stored in localStorage and shared across tabs

## Best Practices for Future Development

### When adding new pages or features that use Firebase:

**❌ DON'T DO THIS:**
```javascript
import { initializeApp } from 'firebase-app.js';
const app = initializeApp(firebaseConfig);  // ⚠️ May conflict!
```

**✅ DO THIS:**
```javascript
import { initializeApp, getApps } from 'firebase-app.js';

const existingApps = getApps();
const existingApp = existingApps.find(a => a.name === '[DEFAULT]');
const app = existingApp || initializeApp(firebaseConfig);

if (existingApp) {
  console.log('✅ Using existing Firebase [DEFAULT] app');
} else {
  console.log('🔥 Initializing new Firebase [DEFAULT] app');
}
```

### Pages That Still Need Fixing

The following pages still directly initialize Firebase without checking for existing instances. They should be fixed if they're actively used:

**Test/Utility Pages:**
- `test-duplicate-prevention.html`
- `test-24hour-filter.html`
- `emergency_campaign_pause.html`
- `outcomemd_bdr_id_fix.html`
- `temp_fix_email_status.html`
- `billing_dashboard.html`

**Email/Campaign Pages:**
- `mail_campaign_hotsheet.html`
- `email_queue.html`
- `heyreach_campaigns.html`
- `page-usage-analytics.html` (uses old Firebase SDK)

**Note:** Many of these are temporary/testing utilities and may not need fixes unless actively used alongside `/connect` pages.

## Testing

To verify the fix works:

1. Open a `/connect` page (e.g., `connect_review.html`)
2. Log in if needed
3. Open the browser console and run: `console.log(window.auth.currentUser.email)`
4. Open a `/crm` page in a new tab (e.g., `tasks-list.html`)
5. Check the console - you should see "✅ Using existing Firebase [DEFAULT] app"
6. Go back to the `/connect` page
7. Verify you're still logged in: `console.log(window.auth.currentUser.email)`
8. Should still show your email ✅

## Technical Details

### Firebase Auth Persistence

Firebase Auth uses localStorage keys like:
- `firebase:authUser:[API_KEY]:[AUTH_DOMAIN]`

When multiple Firebase instances initialize with the same config, they compete for these keys, causing auth state to be lost.

### Cross-Tab Synchronization

The `auth.js` includes cross-tab synchronization that listens for `storage` events:

```javascript
window.addEventListener('storage', (event) => {
  if (event.key && event.key.startsWith('firebase:authUser')) {
    // Sync auth state across tabs
  }
});
```

This ensures that logging in/out in one tab affects all tabs, but only works correctly when all tabs share the same Firebase app instance.

## Rollback Instructions

If issues occur, you can temporarily revert by:

1. Restoring `auth.js` to version 1.2.2
2. Avoiding using `/crm` and `/connect` pages simultaneously

However, the proper fix is to ensure all pages check for existing Firebase instances as documented above.

## Date

Fixed: January 22, 2026
Version: 1.0.0
