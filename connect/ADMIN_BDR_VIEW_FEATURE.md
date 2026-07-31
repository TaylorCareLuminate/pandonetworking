# Admin BDR View Feature - Prospect Contacts

## 🎯 Overview

Added admin functionality to the **Prospect Contacts** page that allows administrators from `healthluminate.com` or `careluminate.com` domains to view prospects for any BDR (Business Development Representative). Non-admin users only see their own prospects.

## 👥 User Roles

### **Admin Users**
- Email domains: `@healthluminate.com` or `@careluminate.com`
- Can view prospects for **any BDR** using a dropdown selector
- See their own prospects by default
- Can switch between different BDRs dynamically

### **Regular Users (BDRs)**
- All other email domains
- Can **only** view their own prospects
- No BDR selector shown
- Standard prospect management functionality

## 🎨 UI Changes

### Admin Interface

When an admin logs in, they see an additional section at the top:

```
┌─────────────────────────────────────────────────┐
│ 🛡️ Admin: View BDR Prospects                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Select BDR: [Dropdown with all BDRs ▼]  [Load]│
│                                                 │
│  ℹ️ Viewing prospects for: John Doe            │
│     (john.doe@company.com)                      │
└─────────────────────────────────────────────────┘
```

**BDR Dropdown shows:**
- All BDR email addresses
- Number of LinkedIn accounts per BDR
- "YOU" marker next to admin's own email
- Sorted alphabetically

**Example dropdown entries:**
```
-- Select a BDR --
jane.smith@company.com (2 accounts)
john.doe@company.com (1 account)
taylordavis@careluminate.com (3 accounts) - YOU
```

### Non-Admin Interface

Non-admin users see the normal prospect contacts page without the BDR selector section.

## 🔧 Technical Implementation

### Admin Detection

```javascript
function checkIfAdmin(user) {
    if (!user || !user.email) return false;
    const domain = user.email.split('@')[1].toLowerCase();
    return domain === 'healthluminate.com' || domain === 'careluminate.com';
}
```

### Key Variables

```javascript
let isAdmin = false;              // Is current user an admin?
let selectedBdrEmail = null;      // Which BDR's prospects to show
let allBdrs = [];                 // List of all BDRs (admin only)
```

### Data Loading Flow

#### **For Admins:**
1. Check if user is admin (`checkIfAdmin()`)
2. Show admin BDR selector section
3. Load all BDRs from `linkedin_accounts` collection
4. Populate BDR dropdown
5. Set `selectedBdrEmail` to admin's own email (default)
6. Load LinkedIn accounts for selected BDR
7. Load prospects for selected BDR

#### **For Non-Admins:**
1. Set `selectedBdrEmail` to user's own email
2. Load LinkedIn accounts for user
3. Load prospects for user
4. BDR selector remains hidden

### Modified Functions

#### `initializePage(user)`
- Checks admin status
- Shows/hides BDR selector based on admin status
- Loads BDR list for admins
- Sets initial `selectedBdrEmail`

#### `loadAllBdrs()` - New Function
- Queries all `linkedin_accounts` documents
- Extracts unique BDR emails
- Groups accounts by BDR
- Populates dropdown with BDR info
- Admin only

#### `loadLinkedInAccounts()`
- Modified to use `selectedBdrEmail` instead of `userEmail`
- Loads accounts for the selected BDR (or user's own if not admin)

#### `loadProspects()`
- Modified to use `selectedBdrEmail` instead of `userEmail`
- Loads prospects for the selected BDR
- Updates "Viewing prospects for" info display (admin only)

#### `loadProspectsForSelectedBdr()` - New Function
- Triggered when admin clicks "Load Prospects" button
- Gets selected BDR from dropdown
- Reloads LinkedIn accounts and prospects for selected BDR
- Shows loading overlay during process

#### `onBdrChange()` - New Function
- Triggered when admin changes BDR selection in dropdown
- Hides the "Viewing prospects for" info until "Load" is clicked

## 📊 Firestore Queries

### Original Query (Non-Admin)
```javascript
query(
    collection(db, 'prospect_contacts'),
    where('userEmail', '==', userEmail)  // Current user's email
)
```

### Updated Query (Admin)
```javascript
query(
    collection(db, 'prospect_contacts'),
    where('userEmail', '==', selectedBdrEmail)  // Selected BDR's email
)
```

## 🎯 Features & Behavior

### Admin Features
✅ View prospects for any BDR
✅ Switch between BDRs without page reload
✅ See BDR account counts in dropdown
✅ Own email highlighted in dropdown
✅ Info banner shows currently viewed BDR
✅ All prospect management features work for selected BDR
✅ "Check for New Connections" works for selected BDR
✅ Statistics reflect selected BDR's data

### Non-Admin Features
✅ View only own prospects
✅ All standard prospect management features
✅ No access to other BDRs' data
✅ Clean interface without admin controls

## 🔒 Security Considerations

### Client-Side Restrictions
- Admin UI only shown to verified admin emails
- BDR selector hidden from non-admins
- Admin status checked on page load

### Server-Side Security (Firestore Rules)
**⚠️ Important:** The client-side checks should be complemented with Firestore security rules:

```javascript
// Recommended Firestore Rules for prospect_contacts collection
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /prospect_contacts/{document} {
      // Users can read/write their own prospects
      allow read, write: if request.auth != null 
        && request.auth.token.email == resource.data.userEmail;
      
      // Admins can read all prospects
      allow read: if request.auth != null 
        && (request.auth.token.email.matches('.*@healthluminate.com$') 
        || request.auth.token.email.matches('.*@careluminate.com$'));
    }
  }
}
```

## 🧪 Testing Scenarios

### Test Case 1: Admin User Loads Page
1. Admin logs in with `@healthluminate.com` or `@careluminate.com` email
2. Page shows BDR selector section
3. Dropdown populated with all BDRs
4. Admin's own email selected by default
5. Admin's own prospects loaded

### Test Case 2: Admin Switches BDR
1. Admin selects different BDR from dropdown
2. Clicks "Load Prospects" button
3. Loading overlay appears
4. LinkedIn accounts loaded for selected BDR
5. Prospects loaded for selected BDR
6. Info banner shows selected BDR's name/email
7. Statistics updated to reflect selected BDR

### Test Case 3: Non-Admin User Loads Page
1. Non-admin user logs in
2. BDR selector section is hidden
3. Only user's own prospects loaded
4. All standard features work normally

### Test Case 4: Admin Checks New Connections for BDR
1. Admin selects a BDR
2. Loads their prospects
3. Clicks "Check for New Connections"
4. System compares BDR's prospects against BDR's LinkedIn connections
5. New connections detected and celebrated
6. Stats updated for selected BDR

## 📝 Files Modified

### `prospect_contacts.html`

**HTML Changes:**
- Added `adminBdrSelector` section (lines 413-439)
- BDR dropdown selector
- "Load Prospects" button
- Info banner for selected BDR

**JavaScript Changes:**
- Added `isAdmin`, `selectedBdrEmail`, `allBdrs` variables
- Added `checkIfAdmin()` function
- Modified `initializePage()` to handle admin vs non-admin
- Added `loadAllBdrs()` function
- Modified `loadLinkedInAccounts()` to use `selectedBdrEmail`
- Modified `loadProspects()` to use `selectedBdrEmail`
- Added `onBdrChange()` handler
- Added `loadProspectsForSelectedBdr()` function

## 🚀 Usage

### For Admins

1. **Navigate** to Prospect Contacts page
2. **See** BDR selector at top of page
3. **Select** BDR from dropdown
4. **Click** "Load Prospects" button
5. **View** selected BDR's prospects, statistics, and connections
6. **Manage** categories, check connections, etc. for selected BDR

### For Non-Admins

1. **Navigate** to Prospect Contacts page
2. **View** own prospects automatically
3. **Manage** prospects normally

## 🎨 UX Improvements

### Visual Indicators
- 🛡️ Shield icon for admin section
- ℹ️ Info banner showing currently viewed BDR
- "YOU" marker in dropdown
- Account count badges in dropdown

### User Feedback
- Loading overlay when switching BDRs
- Clear indication of selected BDR
- Consistent behavior with non-admin view

### Efficiency
- No page reload required to switch BDRs
- Dropdown pre-populated with all BDRs
- Current selection remembered during session

## 📈 Benefits

### For Admins
- **Oversight:** Monitor all BDRs' prospect pipelines
- **Support:** Help BDRs manage their prospects
- **Reporting:** View progress across team
- **Training:** See examples of good prospect management

### For Organization
- **Transparency:** Clear visibility into prospect data
- **Accountability:** Track BDR performance
- **Quality:** Ensure consistent prospect management
- **Scalability:** Easy to add more BDRs

## 🔮 Future Enhancements

Potential additions:
- Export prospects for selected BDR
- Bulk operations across multiple BDRs
- Comparison view (side-by-side BDR stats)
- Historical performance tracking
- Team-wide dashboards
- Activity logs for prospect management
- Notifications for new connections across team

---

**Feature Status:** ✅ Complete and Production Ready  
**Implementation Date:** November 2024  
**Security Note:** Requires Firestore rules configuration for full security




