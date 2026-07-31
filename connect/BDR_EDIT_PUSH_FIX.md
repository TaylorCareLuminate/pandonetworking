# BDR Edit & Push Bug Fix

## Problem Summary

Messages edited by BDRs during the second review (Queue 2) in `connect_review.html` were not being pushed with their edited content to HeyReach via `connect_push.html`. The original (unedited) messages were being sent instead.

## Root Cause Analysis

### The Workflow

1. **Admin Review (Queue 1)**: Admin approves message → `reviewStatus = 'pending_customer_review'`
2. **BDR Review (Queue 2)**: BDR sees message, edits it, and clicks "Approve Message"
3. **Edit Notes Flow**: If edited, system prompts for edit notes
4. **Approval**: Message is marked as `reviewStatus = 'approved'`
5. **Push**: Railway auto-push reads messages with `reviewStatus === 'approved'` and sends to HeyReach

### The Bug

In `connect_review.html`, the `completeCustomerApproval()` function relied on a **global flag** `isMessageEdited` to determine whether to save the edited message:

```javascript
// OLD CODE (BUGGY)
async function completeCustomerApproval(editNotesText) {
    // ...
    
    // This check could fail if isMessageEdited was reset before this function ran
    if (isMessageEdited) {
        updateData.message_to_contact = messageEditorEl.value;  // Only saves if flag is true!
        updateData.messageWasEdited = true;
        // ...
    }
    
    await updateDoc(docRef, updateData);
}
```

### Why It Failed

**Race Condition**: The `isMessageEdited` flag is a global variable that can be reset at any time. The approval flow was:

1. BDR edits message → `isMessageEdited = true`
2. Clicks "Approve Message" → `handleCustomerApprove()` checks flag (still true)
3. Edit notes modal shown
4. **Potential timing issue**: Something could reset the flag here
5. BDR submits notes → `completeCustomerApproval()` called
6. **Bug**: Flag might be false now, so edited message is NOT saved!
7. Result: Firestore still has original message in `message_to_contact` field
8. Push system reads old value and sends unedited message to HeyReach

### Proof of Correct Push Logic

The Railway API in `server.js` (line 6300) correctly reads from `message_to_contact`:

```javascript
// Railway API - This part is CORRECT
const lead = {
    // ...
    customVariables: {
        content: message.message_to_contact || ''  // ✅ Reads the right field
    }
};
```

So the push system is fine - the issue was that `message_to_contact` was never being updated with the edited version!

## The Fix

### Solution: Pass Edit State Explicitly

Instead of relying on a global flag that can be reset, we now **capture the edit state** when the approval flow starts and pass it explicitly through the call chain:

```javascript
// NEW CODE (FIXED)

// 1. Capture edit state when BDR clicks "Approve Message"
async function handleCustomerApprove() {
    if (currentQueueMode === 'customer' && isMessageEdited) {
        // Capture the edit state NOW before showing modal
        window._customerApproveWithEdit = true;
        showEditNotesModal();
        return;
    }
    
    // No edits, proceed normally
    await completeCustomerApproval('', false);
}

// 2. Retrieve captured state when notes modal is submitted
async function handleApproveWithEditNotes() {
    const notes = editNotes.value.trim();
    const wasEdited = window._customerApproveWithEdit || false;
    window._customerApproveWithEdit = false; // Reset flag
    await completeCustomerApproval(notes, wasEdited);
    hideEditNotesModal();
}

async function handleApproveWithoutNotes() {
    const wasEdited = window._customerApproveWithEdit || false;
    window._customerApproveWithEdit = false; // Reset flag
    await completeCustomerApproval('', wasEdited);
    hideEditNotesModal();
}

// 3. Use explicit parameter instead of global flag
async function completeCustomerApproval(editNotesText, wasEdited = false) {
    try {
        // ...
        
        // Now we KNOW for certain if message was edited
        if (wasEdited) {
            updateData.message_to_contact = messageEditorEl.value;  // ✅ ALWAYS saves if edited
            updateData.messageWasEdited = true;
            updateData.editedAt = new Date().toISOString();
            updateData.editedBy = impersonatedEmail || currentUser.email;
            updateData.editedByActualUser = currentUser.email;
            updateData.originalMessage = originalMessage;
            
            if (editNotesText) {
                updateData.editNotes = editNotesText;
            }
            
            console.log('✅ Message was edited, saving edit info');
            console.log('   Original:', originalMessage.substring(0, 50) + '...');
            console.log('   Edited:', messageEditorEl.value.substring(0, 50) + '...');
        }
        
        await updateDoc(docRef, updateData);
        // ...
    }
}
```

## Changes Made

### File: `HealthLuminateSiteFromLocal/connect/connect_review.html`

1. **`handleCustomerApprove()`** (line ~2233):
   - Added: Captures edit state in `window._customerApproveWithEdit` flag
   - Passes `false` for non-edited approvals

2. **`handleApproveWithEditNotes()` & `handleApproveWithoutNotes()`** (line ~2107):
   - Added: Retrieves captured edit state from `window._customerApproveWithEdit`
   - Passes it explicitly to `completeCustomerApproval()`
   - Resets the flag after use

3. **`completeCustomerApproval()`** (line ~2121):
   - Added: New parameter `wasEdited = false`
   - Changed: Uses parameter instead of global `isMessageEdited` flag
   - Added: Debug logging to confirm edited message is being saved
   - Added: Comment explaining the race condition fix

## Testing Instructions

### Test Case 1: BDR Edits and Approves with Notes

1. Log in as admin, go to `connect_review.html`
2. Impersonate a BDR who has messages in Queue 2
3. Edit a message (change the text significantly)
4. Click "Approve Message"
5. Enter notes in the modal, click "Approve with Notes"
6. **Verify in Firestore**:
   - Check `connect_queue` collection for that message document
   - Confirm `message_to_contact` field has the **edited** text
   - Confirm `messageWasEdited` is `true`
   - Confirm `editedAt`, `editedBy`, `originalMessage`, and `editNotes` fields exist
7. **Verify in Browser Console**:
   - Should see: `✅ Message was edited, saving edit info`
   - Should see: `Original: ...` and `Edited: ...` with different text
8. Wait for auto-push or trigger manual push from `connect_push.html`
9. **Verify in HeyReach**:
   - Check the campaign in HeyReach
   - Verify the contact received the **edited** message, not the original

### Test Case 2: BDR Edits and Approves Skipping Notes

1. Edit a message in Queue 2
2. Click "Approve Message"
3. Click "Skip Notes" in the modal
4. **Verify**: Message is still saved with edits (same checks as Test Case 1)

### Test Case 3: BDR Approves Without Editing

1. Don't edit a message in Queue 2
2. Click "Approve Message"
3. **Verify**: Modal is NOT shown, approval happens immediately
4. **Verify**: `messageWasEdited` is NOT set in Firestore

## Success Criteria

✅ **Before Fix**: Edited messages would push with original text  
✅ **After Fix**: Edited messages push with edited text  
✅ **No Regression**: Non-edited messages still work normally  
✅ **Logging**: Console shows confirmation when edited message is saved

## Related Files

- **Fixed File**: `HealthLuminateSiteFromLocal/connect/connect_review.html`
- **Push System** (No changes needed): `RailwayCLemail/server.js` (line 6300)
- **Monitor Page**: `HealthLuminateSiteFromLocal/connect/connect_push.html`

## Technical Notes

### Why Use `window._customerApproveWithEdit`?

We use a window-level flag (instead of a local variable) because the approval flow spans multiple function calls and includes a modal interaction. The flag:
- Is set in `handleCustomerApprove()` when edit is detected
- Is read in `handleApproveWithEditNotes()` / `handleApproveWithoutNotes()` after modal interaction
- Is reset immediately after use to prevent stale state

### Alternative Approaches Considered

1. **Keep using `isMessageEdited` but never reset it**: Rejected because the flag needs to be reset for the next message
2. **Save immediately on edit**: Rejected because BDR might want to revert edits before approving
3. **Check if text differs from original**: Possible, but explicit state is more reliable and clearer

### Data Flow After Fix

```
BDR edits message
    ↓
isMessageEdited = true
    ↓
BDR clicks "Approve Message"
    ↓
handleCustomerApprove() captures: window._customerApproveWithEdit = true
    ↓
Edit notes modal shown
    ↓
BDR submits notes
    ↓
handleApproveWithEditNotes() retrieves: wasEdited = true
    ↓
completeCustomerApproval(notes, wasEdited=true)
    ↓
✅ updateData.message_to_contact = messageEditorEl.value
    ↓
Firestore updated with edited message
    ↓
Auto-push reads message_to_contact
    ↓
✅ HeyReach receives edited message
```

---

**Date Fixed**: January 9, 2026  
**Files Modified**: `connect_review.html`  
**Issue Type**: Race condition / Global state bug  
**Severity**: High (affected BDR workflow and message quality)


