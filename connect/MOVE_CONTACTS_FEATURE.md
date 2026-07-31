# Move Contacts Between BDRs Feature

## Overview
Added functionality to `prospect_contacts.html` to allow administrators to move or copy prospect contacts between BDRs.

## Location
- **File**: `HealthLuminateSiteFromLocal/connect/prospect_contacts.html`
- **Access**: Admin users only (requires admin role in Firebase)

## Features

### 1. **Move Contacts Button**
- Located in the Admin BDR Selector section
- Green button labeled "Move Contacts Between BDRs"
- Only visible to admin users

### 2. **Move Contacts Modal**
The modal provides the following options:

#### Source Selection
- **Source BDR Dropdown**: Select the BDR from which to transfer contacts
- **Live Contact Count**: Automatically displays the number of available contacts for the selected source BDR

#### Transfer Configuration
- **Number of Contacts**: Enter how many contacts to transfer
- **Operation Type**: 
  - **Move**: Deletes contacts from source and creates them in target(s)
  - **Copy**: Keeps contacts in source and duplicates to target(s)

#### Target Selection
- **Multiple Target BDRs**: Check one or more BDRs to receive the contacts
- **Distribution Method** (only shown when multiple targets selected):
  - **Split evenly**: Divides contacts among selected BDRs
    - Example: 100 contacts to 2 BDRs = 50 contacts each
  - **Give full count to each**: Duplicates the full amount to each BDR
    - Example: 100 contacts to 2 BDRs = 100 contacts each (200 total)

#### Summary Display
- Real-time summary shows:
  - Source BDR name
  - Operation type (move/copy)
  - Target BDR name(s)
  - Distribution details

## How It Works

### Random Selection
- Contacts are randomly selected from the source BDR's contact list
- This ensures fair distribution without bias

### Database Operations
1. **Query Source**: Retrieves all contacts for the source BDR from Firebase
2. **Random Selection**: Randomly selects the specified number of contacts
3. **Create Copies**: Creates new contact records for target BDR(s) with:
   - Updated `userEmail` and `bdrEmail` fields
   - Added `transferredFrom` field (source BDR email)
   - Added `transferredAt` timestamp
   - Added `originalId` field (original contact ID)
4. **Delete Original** (if Move operation): Removes contacts from source BDR

### Batch Processing
- Uses Firebase batch writes (500 records per batch) for efficiency
- Handles large transfers gracefully

## Usage Example

### Scenario: Split 100 contacts to 2 BDRs
1. Select source BDR: "John Doe"
2. Enter contact count: 100
3. Select operation: "Move"
4. Check target BDRs: "Jane Smith" and "Bob Johnson"
5. Distribution: "Split evenly"
6. Result: 50 contacts to Jane, 50 to Bob, 100 deleted from John

### Scenario: Copy 50 contacts to 3 BDRs
1. Select source BDR: "John Doe"
2. Enter contact count: 50
3. Select operation: "Copy"
4. Check target BDRs: "Jane Smith", "Bob Johnson", "Alice Williams"
5. Distribution: "Give full count to each"
6. Result: 50 contacts to Jane, 50 to Bob, 50 to Alice, original 50 remain with John (150 new copies created)

## Safety Features

1. **Admin-Only Access**: Only users with admin role can access this feature
2. **Validation**:
   - Ensures source BDR is selected
   - Ensures valid contact count
   - Ensures at least one target BDR is selected
   - Prevents source BDR from being a target
   - Warns if source has fewer contacts than requested
3. **Confirmation Dialog**: Requires user confirmation before executing transfer
4. **Error Handling**: Comprehensive error handling with user-friendly messages
5. **Loading States**: Visual feedback during processing

## Technical Details

### Firebase Collection
- Collection: `prospect_contacts`
- Query field: `userEmail` (indexed)

### New Fields Added to Transferred Contacts
- `transferredFrom`: Email of source BDR
- `transferredAt`: Timestamp of transfer
- `originalId`: ID of the original contact record

### Functions Added
- `openMoveContactsModal()`: Opens the modal and initializes form
- `closeMoveContactsModal()`: Closes modal and resets form
- `populateTargetBdrs()`: Populates target BDR checkboxes
- `onTargetBdrChange()`: Handles target selection changes
- `updateSourceContactCount()`: Fetches and displays source BDR contact count
- `updateMoveSummary()`: Updates the summary display
- `executeMoveContacts()`: Executes the move/copy operation

## Testing Checklist

- [ ] Button appears for admin users only
- [ ] Modal opens with all BDRs populated
- [ ] Source contact count updates when BDR is selected
- [ ] Distribution method appears/disappears based on target selection
- [ ] Summary updates in real-time
- [ ] Move operation deletes from source and creates in target
- [ ] Copy operation keeps source and creates in target
- [ ] Split distribution divides contacts correctly
- [ ] Duplicate distribution creates full copies for each target
- [ ] Error handling works for invalid inputs
- [ ] Page reloads data after successful transfer

## Future Enhancements (Optional)

1. **Filter by Category**: Allow filtering which contacts to transfer based on category
2. **Custom Selection**: Let admin manually select specific contacts instead of random
3. **Undo Functionality**: Allow reverting recent transfers
4. **Transfer History**: Log all transfers in a separate collection
5. **Scheduled Transfers**: Set up automatic transfers on a schedule
6. **Balance Check**: Automatically balance contact counts across all BDRs
