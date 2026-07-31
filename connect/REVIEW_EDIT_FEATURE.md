# Review Edit & Send Feature

## Overview
Added functionality to `review_review.html` to allow administrators to edit rejected messages and send them directly, bypassing both review queues.

## Changes Made

### 1. UI Components Added

#### CSS Styles
- **Edit Message Section**: New styling for the message editor interface
- **Edit Message Textarea**: Styled textarea for message editing
- **Character Counter**: Real-time character count with color warnings
  - Normal: default color
  - Warning: 250+ characters (yellow)
  - Danger: 300+ characters (red)
- **Action Buttons**: "Send Edited Message" and "Cancel" buttons with appropriate styling

#### HTML Elements
- **Edit Message Section** (`editMessageSection`): Hidden by default, shown when editing
  - Textarea for message editing
  - Character counter display
  - Send and Cancel buttons
- **Rejected Action Section** (`rejectedActionSection`): Shows "Edit & Send This Message" button for rejected messages

### 2. JavaScript Functionality

#### New Variables
- `currentEditingReviewId`: Tracks which review is currently being edited

#### New Functions

**`showEditInterface()`**
- Displays the edit interface for rejected messages
- Pre-fills the textarea with the original message
- Hides the action button section
- Shows the edit section

**`updateCharCount()`**
- Updates character count display in real-time
- Applies color-coded warnings:
  - Green/default: < 250 characters
  - Yellow warning: 250-299 characters
  - Red danger: 300+ characters

**`sendEditedMessage()`**
- Validates the edited message
- Confirms with the user before sending
- Updates Firestore document with:
  - Original message backup
  - New edited message
  - Edit metadata (editedAt, editedBy, etc.)
  - Clears rejection status
  - Approves for both queues (AI and customer)
  - Sets `readyToSend: true` for immediate sending
  - Sets `bypassedQueues: true` to skip review processes
  - Sets `adminOverride: true` with reason
- Refreshes the UI after successful update

**`cancelEdit()`**
- Cancels editing and returns to the detail view
- Hides edit section, shows action buttons

**Updated `closeModal()`**
- Resets editing state when modal is closed
- Clears `currentEditingReviewId`

**Updated `showDetail()`**
- Sets `currentEditingReviewId` when opening a review
- Shows "Edit & Send" button only for rejected messages

#### Event Listeners Added
- `editRejectedBtn.click`: Shows edit interface
- `editMessageTextarea.input`: Updates character count
- `sendEditedBtn.click`: Sends edited message
- `cancelEditBtn.click`: Cancels editing

### 3. Firestore Update Structure

When sending an edited rejected message, the following fields are updated:

```javascript
{
  // Preserve original before editing
  originalMessage: review.message_to_contact,
  
  // Update to new message
  message_to_contact: editedMessage,
  
  // Edit tracking
  messageWasEdited: true,
  editedFromRejection: true,
  editedAt: now,
  editedBy: currentUser.email,
  
  // Clear rejection status
  rejected: false,
  rejectedAt: null,
  rejectionComments: "[Originally rejected: ...]",
  
  // Auto-approve for both queues
  approvedInQueue1: true,
  aiApprovedAt: now,
  aiApprovedBy: 'admin_override',
  customerApprovedAt: now,
  customerApprovedBy: currentUser.email,
  
  // Mark for immediate sending
  readyToSend: true,
  bypassedQueues: true,
  adminOverride: true,
  adminOverrideReason: 'Edited from rejected message and approved for immediate sending'
}
```

## User Flow

1. **View Rejected Messages**
   - Admin opens the review audit page
   - Filters for rejected messages (optional)
   - Clicks "View" on a rejected message

2. **Edit Message**
   - In the detail modal, rejection comments are displayed
   - Click "Edit & Send This Message" button
   - Edit interface appears with the original message
   - User edits the message in the textarea
   - Character count updates in real-time

3. **Send Edited Message**
   - Click "Send Edited Message"
   - Confirmation dialog appears
   - Upon confirmation, message is updated in Firestore
   - Message is marked for immediate sending, bypassing both queues
   - Success notification appears
   - Modal closes and table refreshes

4. **Cancel**
   - Click "Cancel" to return to detail view without changes

## Queue Bypass Logic

The edited message bypasses both queues by setting:
- `approvedInQueue1: true` - Bypasses AI review queue
- `customerApprovedAt: [timestamp]` - Bypasses BDR review queue
- `readyToSend: true` - Marks as ready for immediate sending
- `bypassedQueues: true` - Flags that queues were bypassed
- `adminOverride: true` - Indicates admin intervention

This ensures the message goes directly to the sending process without requiring re-review.

## Security Features

- **Admin-Only Access**: Only users with @healthluminate.com or @careluminate.com email domains can access this page
- **Authentication Required**: User must be logged in via Firebase Auth
- **Confirmation Dialog**: User must confirm before sending to prevent accidental sends
- **Audit Trail**: All edits are tracked with timestamps and user emails

## Testing Checklist

- [ ] Rejected messages show "Edit & Send This Message" button
- [ ] Edit interface appears when clicking the button
- [ ] Original message is pre-filled in textarea
- [ ] Character count updates in real-time
- [ ] Character count colors change at 250 and 300 characters
- [ ] Empty messages are rejected with error
- [ ] Unchanged messages show warning
- [ ] Confirmation dialog appears before sending
- [ ] Message is successfully updated in Firestore
- [ ] Message appears as edited (not rejected) after sending
- [ ] Success notification appears
- [ ] Modal closes and table refreshes after successful send
- [ ] Cancel button returns to detail view without changes
- [ ] Modal close button resets editing state

## Future Enhancements

- Add message templates for common edits
- Show diff between original and edited message in confirmation
- Add bulk edit capability for multiple rejected messages
- Add scheduling capability for edited messages
- Add preview of how message will appear in LinkedIn
