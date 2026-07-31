# CLEmail Security Migration Guide

## Overview

This guide documents how to migrate pages from direct CLEmail Firestore access to the secure Railway backend proxy.

## Migration Status

### ✅ Completed (Admin - 9 files)
- email_controls.html
- quick_add_linkedin_account.html
- team-members.html
- test_heyreach_manual.html
- fix_campaign_ids.html
- fix_calls.html
- debug_email_forcing.html
- email-requests.html
- bracket_variables.html

### ✅ Completed (Connect - 12 files)
- prospect_contacts.html
- connect_review.html
- index.html
- bdr_review_settings.html
- my_leads.html
- manage_my_linkedin_data.html
- cleanup_bulk_deletes.html
- connect_push.html
- campaign_settings.html
- about_me.html
- fix_my_account_ids.html
- backfill_lead_urls.html

### ✅ Completed (CRM - 2 files)
- worklist.html
- outcomes.html

### 🔄 Remaining (CRM - 76 files)
See list of files in crm folder that contain `projectId.*clemail`

## Migration Pattern

### Step 1: Add Required Scripts

Before the `<script type="module">` block, add:

```html
<!-- Auth and CLEmail Secure API Wrapper -->
<script src="../js/auth.js"></script>
<script src="../js/clemail-firestore-wrapper.js"></script>
```

### Step 2: Remove Direct Firebase Imports

**BEFORE:**
```javascript
<script type="module">
    import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
    import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

    // Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyDGESh2UQT4awIg9Y3kBcZPN-aaWthC1k4",
        authDomain: "clemail.firebaseapp.com",
        databaseURL: "https://clemail-default-rtdb.firebaseio.com",
        projectId: "clemail",
        storageBucket: "clemail.firebasestorage.app",
        messagingSenderId: "762477610174",
        appId: "1:762477610174:web:8547f62e6d9f3b819acaef",
        measurementId: "G-EFW8G912Y7"
    };

    // Initialize Firebase
    let app, db;
    const existingApps = getApps();
    const existingApp = existingApps.find(a => a.name === 'xxx');

    if (existingApp) {
        app = existingApp;
    } else {
        app = initializeApp(firebaseConfig, 'xxx');
    }

    db = getFirestore(app);
```

**AFTER:**
```javascript
<script type="module">
    // Wait for auth to be ready
    await window.firebaseReady;
    
    // Use CLEmail wrapper for secure data access via Railway backend
    const { collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy, limit } = window.clemailFirestore;

    // Use secure wrapper instead of direct Firebase
    let db = window.clemailDb;
    
    console.log('🔒 Using CLEmail secure wrapper for data access');
```

### Step 3: Handle Timestamp Import (if needed)

If the file uses `Timestamp`, import it from Firebase:

```javascript
import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
```

### Step 4: Handle Auth-related Firebase Imports

Keep auth-related imports since auth stays with HealthcareITDatabase:

```javascript
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
```

### Step 5: Handle Dynamic Imports Within Functions

If a file has dynamic imports inside functions like:

**BEFORE:**
```javascript
async function loadData() {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
    const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const cfg = { apiKey:"...", projectId:"clemail" };
    const app = initializeApp(cfg, 'xxx');
    const db = getFirestore(app);
    // ...
}
```

**AFTER:**
```javascript
async function loadData() {
    // Use wrapper functions already available from module scope
    // (db is already defined at module level using window.clemailDb)
    // ...
}
```

## Quick Grep Commands to Find Files Needing Migration

```bash
# Find all files with CLEmail config
grep -r "projectId.*clemail" crm/ --include="*.html" -l

# Count remaining files
grep -r "projectId.*clemail" crm/ --include="*.html" -l | wc -l
```

## Wrapper API Reference

The `clemail-firestore-wrapper.js` provides these Firestore-compatible functions:

```javascript
// Get wrapper functions
const { 
    collection, 
    getDocs, 
    getDoc, 
    addDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    writeBatch 
} = window.clemailFirestore;

// Get database reference
const db = window.clemailDb;

// Usage is identical to Firestore SDK
const q = query(collection(db, 'myCollection'), where('field', '==', 'value'));
const snapshot = await getDocs(q);
```

## Testing After Migration

After migrating a file:

1. Open the page in browser
2. Check browser console for:
   - `🔒 Using CLEmail secure wrapper for data access` - means wrapper loaded
   - No errors about Firebase initialization
3. Test all data operations work (read, write, query)

## Files with Complex Patterns

Some files have multiple Firebase initializations or complex patterns:

- `inbox.html` - Multiple dynamic imports in different functions
- `mail_campaign_hotsheet.html` - Very large file, multiple Firebase instances

For these, you may need to:
1. Remove ALL direct Firebase imports/initializations
2. Define wrapper at module scope
3. Use shared `db` reference throughout

## Rollback Plan

If issues occur, the old direct Firestore access will still work until CLEmail security rules are enabled. The migration is backwards compatible.

## Security Rules

Once ALL files are migrated, deploy these rules to CLEmail Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Block all direct access - force through Railway backend
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This ensures all access goes through the authenticated Railway backend.











