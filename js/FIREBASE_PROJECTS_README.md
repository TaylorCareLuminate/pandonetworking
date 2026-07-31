## Firebase Projects Overview

This system uses TWO separate Firebase projects. They serve different purposes and should not be mixed.

### 1) HealthcareITDatabase (Primary)
- Purpose: Authentication, CRM data, Realtime Database for general app data, folder permissions
- Used by: auth.js, folder-protection.js, most CRM pages, KBA pages
- Services used:
  - Firebase Auth (email/password)
  - Firestore: collections like `folderPermissions`, `users`
  - Realtime Database: many nodes including campaign-related queues and logs

- Known RTDB nodes (partial list):
  - `all_to`, `ambulatorydata`, `clear`, `clicks`, `ers`, `hccrm`, `hl_emails`, `hl_main_25`, `hl_index_25`, `hl_messaging_25`, `ppc_*`, `ppccare`, `sandbox`, `vasion_*`, `kba/li_post_replies`, and many more.

- Initialization: Provided via `js/auth.js`, exposes:
  - `window.firebaseApp` (HealthcareITDatabase app)
  - `window.auth`, `window.db` (Firestore), `window.database` (RTDB)
  - `window.firebaseRTDB` wrapper with `{ ref(path), get, set, update, remove, child }`
  - `window.firebaseReady` promise indicating auth init completion

Use this project for:
- Authenticated reads/writes required by most CRM features
- Realtime Database paths like `hl_emails/images`, `kba/li_post_replies`
- Folder permissions via Firestore `folderPermissions` collection

### 2) CLEmail (Email/LinkedIn/Phone Prospecting)
- Purpose: Campaign builder data, email settings, bracket variables, LinkedIn/phone activity configuration
- Current access: OPEN (read/write) during build-out
- Services used: Firestore ONLY (no RTDB)

- Firestore collections (current):
  - `app_settings`, `bdr_leaders`, `bracketVariables`, `campaigns`, `customerList`, `emailAccounts`, `emailSettings`, `email_calendar`, `email_calendar_slots`, `linkedin_accounts`, `linkedin_activities`, `linkedin_extractor_items`, `linkedin_extractor_results`, `mentavi_emailSettings`, `optOutList`, `phone_activities`, `receivedEmails`, `scheduledEmails`, `scheduled_emails`

- Typical usage in CRM:
  - Load campaigns, customers, bracket variables from CLEmail Firestore
  - Save campaign changes (draft/active) to `campaigns` collection

Initialization patterns seen:
- Dedicated CLEmail app via `initializeApp(emailFirebaseConfig, 'clemail')` or `getApps().find(a => a.name === 'clemail')`
- Some pages set `window.emailDB = getFirestore(emailApp)` for convenience

### Important Do/Don't

Do:
- Use HealthcareITDatabase (auth.js) when accessing Realtime Database paths like `hl_emails/images` (via `window.firebaseRTDB`).
- Use CLEmail Firestore for campaign entities (campaigns, bracketVariables, customerList, etc.).
- Keep apps separate (distinct app names) to avoid cross-project confusion.

Don't:
- Don't try to access CLEmail data through the HealthcareITDatabase app or vice versa.
- Don't assume CLEmail has Realtime Database; it currently uses Firestore only.

### Where are Email Images stored?

- Source of truth: HealthcareITDatabase Realtime Database at `hl_emails/images`
- Manager UI: `crm/email_load_images.html` loads/saves images under that RTDB path
- Campaign Builder (crm/campaigns_enhanced.html): reads from the same RTDB path and shows tokens `[image:name]` filtered by customer
- Backend: replaces `[image:name]` tokens with CID attachments during send

### KBA Pages Specific Notes

KBA pages (like `kba/li_post_replies.html`, `kba/hotsheetpage.html`) have a specific pattern:
- Include `../js/auth.js` for authentication
- Use HealthcareITDatabase for both RTDB data AND Firestore folder permissions
- Must import Firestore functions separately: `import { getFirestore, doc, getDoc } from 'firebase-firestore.js'`
- Access folder permissions via `getFirestore(window.firebaseApp)` NOT `window.db`
- Access RTDB data via `getDatabase(window.firebaseApp)` or `window.firebaseRTDB`

Common KBA pattern:
```js
// Import both RTDB and Firestore functions
import { getDatabase, ref, get, set, update } from 'firebase-database.js';
import { getFirestore, doc, getDoc } from 'firebase-firestore.js';

// Check folder access (Firestore)
const db = getFirestore(window.firebaseApp);
const folderDoc = await getDoc(doc(db, 'folderPermissions', 'kba'));

// Load data (RTDB) 
const rtdb = getDatabase(window.firebaseApp);
const dataSnap = await get(ref(rtdb, 'kba/li_post_replies'));
```

### Quick Integration Recipes

Load images (HealthcareITDatabase RTDB), in pages that include `auth.js`:
```js
await window.firebaseReady; // optional
const { ref, get } = window.firebaseRTDB;
const snap = await get(ref('hl_emails/images'));
const images = snap.exists() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : [];
```

Load CLEmail campaigns (Firestore):
```js
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';

const emailApp = getApps().find(a => a.name === 'clemail') || initializeApp(emailFirebaseConfig, 'clemail');
const emailDb = getFirestore(emailApp);
const docs = await getDocs(collection(emailDb, 'campaigns'));
```

### Troubleshooting

- Permission denied when loading images:
  - Ensure page includes `../js/auth.js` and waits for `window.firebaseReady` before RTDB access
  - Use `window.firebaseRTDB` (HealthcareITDatabase) for RTDB reads
  - Path should be exactly `hl_emails/images`

- Empty image list after successful RTDB read:
  - Check that image records exist at `hl_emails/images` in HealthcareITDatabase RTDB
  - Verify customerId filter logic (global vs specific customer)

- "window.db.collection is not a function" in KBA pages:
  - KBA pages need to import Firestore functions separately
  - Use `getFirestore(window.firebaseApp)` not `window.db` for folder permissions
  - `window.db` in KBA context refers to RTDB, not Firestore

- "Access Restricted" despite having permissions:
  - Verify domain is added to `folderPermissions` collection in Firestore
  - Check that page imports `getFirestore, doc, getDoc` from firebase-firestore.js
  - Ensure `checkFolderAccess()` uses `getFirestore(window.firebaseApp)`


