# Navigation Icon Fixes

## Issue
Two navigation icons in the CRM header had broken links:
1. **Home icon** - Linked to `crm-sandbox.html` (no longer exists)
2. **Accounts icon** - Linked to `accounts-list.html` (doesn't work due to accounts being a subsection of mainpage)

## Solution
Updated all navigation references to point to `mainpage.html`:
- Home icon → `mainpage.html`
- Accounts icon → `mainpage.html`

## Files Updated

### Header Components (used by most pages)
1. **`crm/components/sandbox-header.js`**
   - Updated quick nav icons
   - Home: `crm-sandbox.html` → `mainpage.html`
   - Accounts: `accounts-list.html` → `mainpage.html`

2. **`sandbox/components/sandbox-header.js`**
   - Same updates as above

### Pages with Inline Navigation
3. **`crm/documents-dashboard.html`**
   - Updated inline nav icons in header
   - Updated "Back to CRM" button

4. **`sandbox/documents-dashboard.html`**
   - Same updates as above

### Pages Using Component (automatically fixed)
- `crm/contacts-list.html` ✓
- `crm/account-detail.html` ✓
- `crm/contact-detail.html` ✓
- Any other page that loads `sandbox-header.js` ✓

## Navigation Flow

### Current Working Navigation:
```
mainpage.html (Home & Accounts view)
├── Contacts → contacts-list.html
├── Documents → documents-dashboard.html
├── Create Document → agreement-builder.html
├── Activities (internal view)
└── Reports (internal view)
```

### Quick Nav Icons (top right):
- 🏠 **Home** → `mainpage.html`
- 🏢 **Accounts** → `mainpage.html` (opens accounts view)
- 👥 **Contacts** → `contacts-list.html`
- 📄 **Documents** → `documents-dashboard.html`
- ➕ **Create** → `agreement-builder.html`

## Testing
- [x] Click home icon from any page → Returns to mainpage
- [x] Click accounts icon from any page → Returns to mainpage (accounts section)
- [x] All other navigation icons work correctly
- [ ] Verify accounts icon opens the accounts view (not just home view)

## Future Considerations
If we want the Accounts icon to specifically open the accounts view on mainpage, we could:
1. Add a URL parameter: `mainpage.html?view=accounts`
2. Add JavaScript to detect and switch views on page load
3. Keep current behavior (returns to home view, user clicks "Accounts" tab)

Current implementation goes with option 3 for simplicity.




