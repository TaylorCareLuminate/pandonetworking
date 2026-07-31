# Address Fields Implementation

## Overview
Added comprehensive address management to CRM accounts with auto-population in the agreement builder.

## Changes Made

### 1. Account Detail Page (`crm/account-detail.html`)

#### Added Address Fields to Edit Modal
- **Street Address**: Full street address
- **City**: City name
- **State**: State/province
- **ZIP Code**: Postal code
- **Country**: Country (defaults to "United States")

#### Display Address in About Section
- Address now displays in the right sidebar under "Organization Type"
- Formatted multi-line display:
  ```
  123 Main Street
  New York, NY 10001
  United States
  ```

#### Data Structure
Address is stored in Firebase at:
```
hccrm/leads/{accountId}/organization/address/
  ├── street
  ├── city
  ├── state
  ├── zip
  └── country
```

### 2. Agreement Builder (`crm/agreement-builder.html`)

#### Auto-Population of Invoice Address
When creating an invoice for an account, the "Invoice To" field automatically populates with:
- Company name
- Street address
- City, State, ZIP
- Country (if not United States)

#### Account Selection Integration
- The `selectAccount()` function now updates the global `accountId` variable
- This ensures all forms can access the selected account's data
- Address auto-population works whether account is selected from URL parameter or account selection step

## How It Works

### For Users:
1. **Edit Account Information**
   - Click "Edit" button on account detail page
   - Fill in address fields in the "Billing/Mailing Address" section
   - Click "Save Changes"

2. **Create Documents with Auto-Fill**
   - When creating an invoice from an account page, the address auto-fills
   - When selecting an account in the agreement builder, address is available for all forms
   - All fields remain editable if adjustments are needed

### For Developers:
- Address data is stored as a nested object in `organization.address`
- The `loadAccountDataForInvoice()` function reads from this structure
- All account-related forms can access the address via `accountId`

## Future Enhancements
Consider adding:
- Separate billing and shipping addresses
- Address validation
- Google Maps integration for address lookup
- Address history for accounts that move locations

## Testing Checklist
- [x] Add address to existing account via Edit modal
- [x] View address in Account Detail "About" section
- [ ] Create invoice from account page - verify address auto-fills
- [ ] Select account in agreement builder - verify address available
- [ ] Edit auto-filled address and save document
- [ ] Verify address persists across page refreshes

## Notes
- Country field defaults to "United States" for convenience
- If country is US, it's omitted from invoice to reduce redundancy
- Address is optional - accounts can exist without addresses
- All address fields display gracefully when empty ("Not specified")




