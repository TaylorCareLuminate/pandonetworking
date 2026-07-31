 # Phone Calls Page - Debugging Changes (January 2, 2026)

## Issues Reported

1. **Same Company Warning Showing Incorrect Company**: System was showing "Recent calls to Sagent Behavioral Health" when the current contact is from Porter Starke
2. **Recall Last Call Not Working**: The "Return to Previous Call" button functionality wasn't working as expected

## Changes Made

### 1. Enhanced Company Matching Debugging (Issue #1)

**Problem**: The "Recent Calls to Same Company" warning was showing calls to a different company than the one currently displayed.

**Changes**:
- Added detailed logging before `getPreviousCallInfo()` is called to show all company-related fields in `currentCall` object
- Added debugging in the company matching logic to show:
  - The current company name being used for matching
  - The normalized company name
- Added validation check to detect mismatches between displayed company and company used for matching
- Updated the company calls warning to show the actual company name that was matched (instead of generic "Same Company")
- Added `companyNameUsedForMatching` to the return value of `getPreviousCallInfo()` for verification

**Code Locations**:
- Line ~7738: Added debugging before `getPreviousCallInfo()` call
- Line ~3136: Added company matching debugging
- Line ~7943: Added validation check and display of actual company name
- Line ~3257: Added `companyNameUsedForMatching` to return object

**Expected Debug Output**:
```
🔍 DEBUG - currentCall company fields: {
  companyName: "...",
  company: "...",
  contactData_company_name: "...",
  contactEmail: "...",
  contactName: "...",
  id: "..."
}
🏢 DEBUG - Checking for company-level calls. Current company: "..."
🏢 DEBUG - Normalized current company: "..."
⚠️ COMPANY MISMATCH DETECTED! (if there's a mismatch)
```

### 2. Enhanced Recall Last Call Debugging (Issue #2)

**Problem**: The "Return to Previous Call" button wasn't working, but unclear what the specific failure was.

**Changes**:
- Added comprehensive logging when `returnToPreviousCall()` is called
- Added debugging when `lastRecordedOutcome` is stored after recording an outcome
- Added event listener to track button clicks
- Added verification of button visibility state
- Added check for both `lastRecordedOutcome` and `recentCallsHistory` state

**Code Locations**:
- Line ~10589: Added event listener for button click tracking
- Line ~10605: Added logging at start of `returnToPreviousCall()`
- Line ~9307: Added logging when `lastRecordedOutcome` is stored
- Line ~9318: Added button visibility debugging

**Expected Debug Output**:
```
💾 Stored lastRecordedOutcome: {
  contactName: "...",
  outcome: "...",
  hasCallData: true
}
📚 Recent calls history updated: X calls in history
✅ RETURN BUTTON NOW VISIBLE
   Button visibility: block
   Button computed display: block
🖱️ Undo button clicked (via event listener)
🔄 returnToPreviousCall called
   lastRecordedOutcome: {...}
   recentCallsHistory length: X
```

## How to Use This Debugging

### For Issue #1 (Company Mismatch):

1. Make calls and advance to the next call
2. Watch console logs for the DEBUG lines showing company fields
3. If you see "⚠️ COMPANY MISMATCH DETECTED!", examine the logged data:
   - `displayedCompany`: What shows in the UI
   - `matchedCompany`: What was used for finding "recent calls to same company"
4. The warning box should now show the actual company name that was matched

### For Issue #2 (Recall Not Working):

1. Complete a call outcome
2. Check console for "💾 Stored lastRecordedOutcome" - confirms the data was saved
3. Check for "✅ RETURN BUTTON NOW VISIBLE" - confirms button was made visible
4. Check button visibility values - should both be "block"
5. Try clicking the "RETURN TO PREVIOUS CALL" button
6. Check console for:
   - "🖱️ Undo button clicked" - confirms the click event fired
   - "🔄 returnToPreviousCall called" - confirms the function was invoked
   - The logged `lastRecordedOutcome` value - should show the call data
7. If you see "❌ Cannot return - lastRecordedOutcome is null/undefined", this indicates the data was cleared unexpectedly

## Next Steps

1. **Test the changes** by making calls and observing the console output
2. **Report findings**:
   - For Issue #1: Share the company field values from the DEBUG logs
   - For Issue #2: Share whether the button click is detected and what the lastRecordedOutcome value is
3. **If issues persist**:
   - Capture full console logs from making a call through attempting to recall
   - Take screenshots of any error messages
   - Note the exact behavior (button not visible, button not clickable, button does nothing, error shown, etc.)

## Technical Notes

- The undo button should remain visible after loading the next call (line ~8061)
- The button is hidden only when: recording a new outcome or using the undo button
- Company matching normalizes names by removing "inc", "llc", etc. and non-alphanumeric characters
- Company cooldown period is 30 hours

## Files Modified

- `team/phone-calls.html` - All debugging changes in this file







