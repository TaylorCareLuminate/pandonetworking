# Campaign Portal Editing & Change Logging

## Overview
The KBA Campaign Portal now includes comprehensive editing capabilities with full change logging. Users can view, edit, and track all changes to LinkedIn outreach content, ensuring data integrity before messages are sent to HeyReach.

## Features

### 1. **Expandable Detail View**
- Click the chevron icon (▼) in the first column to expand/collapse detailed information
- Shows all LinkedIn messages:
  - Connection Request Message
  - Follow-up Message 1-4
- Displays additional information like notes and outreach set ID

### 2. **Edit Modal**
- Click the "Edit" button (pencil icon) on any row to open the edit modal
- Edit all outreach set fields:
  - Contact Name
  - Company Name
  - LinkedIn Profile URL
  - Notes
  - All LinkedIn Messages (Connection + 4 Follow-ups)

### 3. **Change Logging**
- Every edit is automatically tracked in the `outreach_set_changes` collection
- Change log displays:
  - Timestamp of change
  - User who made the change
  - Field that was changed
  - Old value vs. New value (side-by-side comparison)
- Change history is visible in the edit modal

### 4. **Real-time Database Updates**
- Changes are immediately saved to Firestore `outreach_sets` collection
- Updates are reflected before messages are sent to HeyReach
- No approval required - edits can be made even on approved outreach sets

## Technical Implementation

### Database Structure

#### outreach_sets Collection
Updated fields:
```javascript
{
  // ... existing fields ...
  contactName: string,
  companyName: string,
  linkedinUrl: string,
  notes: string,
  PersonalizedConnectMessage: string,
  PersonalizedOutreachMessage: string,
  PersonalizedOutreachMessage2: string,
  PersonalizedOutreachMessage3: string,
  PersonalizedOutreachMessage4: string,
  lastModifiedAt: Timestamp,
  lastModifiedBy: string
}
```

#### outreach_set_changes Collection (NEW)
```javascript
{
  outreachSetId: string,           // Reference to outreach_sets doc
  customerId: string,              // Customer ID
  campaignId: string,              // Campaign ID
  fieldName: string,               // Human-readable field name
  fieldKey: string,                // Technical field key
  oldValue: string,                // Previous value
  newValue: string,                // New value
  changedBy: string,               // User email who made the change
  changedAt: Timestamp             // When the change was made
}
```

### Required Firestore Indexes
To support change log queries, ensure this composite index exists:
```
Collection: outreach_set_changes
Fields:
  - outreachSetId (Ascending)
  - changedAt (Descending)
```

Firestore will automatically prompt to create this index when first querying the change log.

### Key Functions

#### `toggleDetails(setId)`
Expands/collapses the detail row showing all LinkedIn messages

#### `openEditModal(setId)`
Opens the edit modal and populates it with current data
- Loads outreach set data
- Loads change history
- Displays modal

#### `closeEditModal()`
Closes the edit modal

#### `saveOutreachSet()`
Saves changes and creates change log entries
- Compares old vs new values
- Creates change log entry for each modified field
- Updates outreach_sets document
- Updates lastModifiedAt and lastModifiedBy
- Refreshes the display

#### `loadChangeLog(setId)`
Loads and displays change history for a specific outreach set

## Usage

### Viewing Message Content
1. Navigate to the campaign portal
2. Find the outreach set you want to view
3. Click the chevron icon (▼) in the "Details" column
4. View all LinkedIn messages and additional information

### Editing an Outreach Set
1. Click the "Edit" button (pencil icon) on any row
2. Modify any fields in the edit modal
3. Click "Save Changes"
4. Changes are immediately saved to the database

### Viewing Change History
1. Open the edit modal for any outreach set
2. Scroll down to the "Change History" section
3. View all past changes with timestamps and user information

## Security & Permissions
- Only users with access to the KBA folder can view and edit outreach sets
- All changes are attributed to the logged-in user's email
- Change log provides full audit trail

## Integration with HeyReach
- Changes to `PersonalizedConnectMessage` and `PersonalizedOutreachMessage*` fields update the values before they are sent to HeyReach
- The Railway backend reads from the `outreach_sets` collection when sending to HeyReach
- All edits are applied before the HeyReach integration executes

## Future Enhancements
Potential improvements:
- Bulk editing capabilities
- Change approval workflow
- Undo/revert functionality
- Export change log to CSV
- Email notifications on changes
- Real-time collaboration indicators

## Troubleshooting

### Changes not saving
- Check browser console for errors
- Verify user has proper authentication
- Ensure Firestore rules allow writes to `outreach_sets` and `outreach_set_changes`

### Change log not displaying
- Check if the Firestore composite index is created
- Verify the `outreach_set_changes` collection exists
- Check browser console for query errors

### Modal not closing
- Click the X button or click outside the modal
- Check browser console for JavaScript errors

## Support
For issues or questions, contact the development team or check the console logs for detailed error messages.

