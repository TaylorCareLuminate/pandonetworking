# BDR Message Deletion Filters

## Overview

The BDR Review Settings page now includes granular filtering options for deleting unreviewed messages. Instead of deleting all messages at once, admins can now be selective based on message type and age.

## Location

**File:** `connect/bdr_review_settings.html`

**Access:** HealthLuminate admins only

## Features

### Message Type Filters

When clicking "Delete Messages" for a BDR, you can now select which types of messages to delete:

#### 1. **Messages from Internet Research** 🌐
- Messages generated from web scraping/research
- Identified by `source: 'internet'`, `'research'`, or `'web'`
- Or `messageType` containing 'internet' or 'research'

#### 2. **Connection Request Messages** 👤➕
- Messages intended to accompany LinkedIn connection requests
- Identified by `messageType: 'connection'` or `'connection_request'`
- Or `isConnectionRequest: true`
- Or `source: 'connection'`

#### 3. **Messages to Current Connections** 💬
- Messages for people already connected on LinkedIn
- Identified by `messageType: 'current_connection'` or `'existing_connection'`
- Or `isCurrentConnection: true`
- Or `source: 'current_connection'`

### Age Filters

Select messages based on when they were generated:

#### 1. **Generated more than 2 weeks ago** 📅❌
- Messages older than 14 days
- Useful for clearing out stale content

#### 2. **Generated in past 2 weeks** 📅✅
- Messages created within the last 14 days
- Useful for clearing recent batches that need regeneration

### Default Behavior

- **All checkboxes are checked by default** - delete all message types and ages
- **At least one checkbox must be selected in each category** to proceed
- Messages without specific source/type metadata are included in all type categories by default

## How It Works

### Step-by-Step Process

1. **Click "Delete Messages"** button for a BDR
   - Button shows total unreviewed message count
   - Button is disabled if count is 0

2. **Filter Panel Expands**
   - Shows message type checkboxes
   - Shows age filter checkboxes
   - All filters are pre-checked by default

3. **Select Filters**
   - Uncheck any categories you want to preserve
   - Must have at least one type filter and one age filter selected

4. **Click "Delete Selected Messages"**
   - System counts matching messages
   - Shows confirmation dialog with:
     - Number of messages to delete
     - Selected message types
     - Selected age ranges
     - Warning that deletion is permanent

5. **Confirm Deletion**
   - Messages are permanently removed from database
   - Success message shows count of deleted messages
   - Message count updates automatically
   - Filter panel closes

## Message Detection Logic

### Date Parsing

The system handles multiple date field formats:
- `createdAt`, `created_at`, or `timestamp` fields
- Firestore Timestamp objects (with `toDate()` method)
- Unix timestamps (seconds-based)
- ISO date strings
- Date objects

If no date is found, the message is included if ANY age filter is selected.

### Type Detection Priority

Messages are categorized based on these fields (in order):
1. `source` field (lowercase comparison)
2. `messageType` or `message_type` field
3. Boolean flags (`isConnectionRequest`, `isCurrentConnection`)
4. If none are set: included in ALL type categories by default

### Safety Checks

The system **NEVER** deletes messages that are:
- Already marked as `deleted: true`
- Already reviewed (`reviewed: true`)
- In `approved` review status
- In `pending_customer_review` status

## UI Components

### Expandable Interface

```
┌─────────────────────────────────────────────┐
│ 🗑️ Unreviewed Messages                      │
│ [15] unreviewed messages in queue           │
│                    [Delete Messages] Button  │
├─────────────────────────────────────────────┤
│ Select Messages to Delete:                  │
│                                              │
│ ┌─ Message Type ──────────────────────┐    │
│ │ ☑ Messages from Internet Research    │    │
│ │ ☑ Connection Request Messages         │    │
│ │ ☑ Messages to Current Connections     │    │
│ └──────────────────────────────────────┘    │
│                                              │
│ ┌─ Message Age ───────────────────────┐    │
│ │ ☑ Generated more than 2 weeks ago    │    │
│ │ ☑ Generated in past 2 weeks           │    │
│ └──────────────────────────────────────┘    │
│                                              │
│ [Delete Selected Messages] [Cancel]         │
└─────────────────────────────────────────────┘
```

### Visual Design

- **Yellow/orange theme** for the message management section
- **Expandable panel** - hidden by default, toggles on button click
- **White background** for filter sections
- **Icons** for each filter option for quick visual scanning
- **Responsive layout** - works on mobile and desktop

## Use Cases

### Clear Old Research Messages Only

```
✅ Messages from Internet Research
❌ Connection Request Messages
❌ Messages to Current Connections
✅ Generated more than 2 weeks ago
❌ Generated in past 2 weeks
```

### Delete All Recent Connection Requests

```
❌ Messages from Internet Research
✅ Connection Request Messages
❌ Messages to Current Connections
❌ Generated more than 2 weeks ago
✅ Generated in past 2 weeks
```

### Clear Everything Older Than 2 Weeks

```
✅ Messages from Internet Research
✅ Connection Request Messages
✅ Messages to Current Connections
✅ Generated more than 2 weeks ago
❌ Generated in past 2 weeks
```

### Fresh Start - Delete Recent Test Messages

```
✅ Messages from Internet Research
✅ Connection Request Messages
✅ Messages to Current Connections
❌ Generated more than 2 weeks ago
✅ Generated in past 2 weeks
```

## Technical Details

### Database Fields Used

```javascript
// Message identification
- account_email or accountEmail (BDR identification)
- deleted (skip if true)
- reviewed (skip if true)
- reviewStatus (skip if 'approved' or 'pending_customer_review')

// Type classification
- source (string: 'internet', 'research', 'web', 'connection', 'current_connection')
- messageType or message_type (string: various types)
- isConnectionRequest (boolean)
- isCurrentConnection (boolean)

// Date fields
- createdAt, created_at, or timestamp (Timestamp, Date, or string)
```

### LinkedIn Email Association

The system checks messages under BOTH:
- BDR's primary authentication email
- Associated LinkedIn email (from `linkedin_email_associations` collection)

This ensures all messages are found regardless of which email was used when generating them.

### Logging

Detailed console logging includes:
- Filter selections
- Each message evaluation
- Final count of messages to delete
- Deletion results

## Error Handling

### Validation Errors

- **"Please select at least one message type to delete"**
  - All type checkboxes are unchecked
  - Solution: Check at least one type filter

- **"Please select at least one age filter"**
  - Both age checkboxes are unchecked
  - Solution: Check at least one age filter

- **"No messages match the selected filters"**
  - Filters are too restrictive
  - No messages in database match criteria
  - Solution: Adjust filters or check if messages exist

### Database Errors

If deletion fails:
- Error message displays with details
- Transaction is not committed
- Database state remains unchanged
- User can retry with same or different filters

## Best Practices

### Before Deleting

1. **Check message counts** - verify the total unreviewed count
2. **Review filter logic** - understand what will be deleted
3. **Start conservative** - delete small batches first
4. **Test with one BDR** - before applying to multiple BDRs

### When to Use Each Filter

**Delete Internet Messages:**
- Research data was poor quality
- Source URLs were incorrect
- Re-scraping with better parameters

**Delete Connection Messages:**
- Connection strategy changed
- Messages don't match new tone
- Re-generating with updated templates

**Delete Current Connection Messages:**
- Relationship status changed
- Messages are no longer relevant
- Campaign focus shifted

**Delete Old Messages:**
- Clearing backlog before fresh start
- Information is outdated
- Prospects have moved companies

**Delete Recent Messages:**
- Test batch needs regeneration
- Template had errors
- Need to re-run with corrections

## Troubleshooting

### Messages Not Deleting

1. **Check review status** - approved messages are protected
2. **Verify BDR email** - ensure correct account association
3. **Check date fields** - message might not have creation date
4. **Review console logs** - detailed info on filtering

### Wrong Messages Deleted

1. **Verify filter selections** - ensure checkboxes were correct
2. **Check confirmation dialog** - shows what will be deleted
3. **Review message metadata** - ensure proper type/source fields

### Count Doesn't Update

1. **Refresh the page** - force reload of message counts
2. **Check other tabs** - ensure not viewing stale data
3. **Verify deletion completed** - check console for errors

## Future Enhancements

Possible additions:
- Campaign-based filtering
- Prospect-based filtering (by company, industry, etc.)
- Custom date range selection
- Preview messages before deletion
- Bulk operations across multiple BDRs
- Deletion history/audit log
- Undo deleted messages (soft delete option)

## Related Features

- **BDR Review Modes** - Configure how BDRs review messages
- **Queue Management** - View and edit messages in queue
- **Message Status Tracking** - Monitor message lifecycle
- **LinkedIn Email Associations** - Link auth emails to LinkedIn accounts

## Support

For issues or questions:
1. Check browser console for detailed logs
2. Verify user has admin permissions
3. Ensure CLEmail wrapper is functioning
4. Contact development team with error details


