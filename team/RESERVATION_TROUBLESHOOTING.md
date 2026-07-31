# Reservation System Troubleshooting Guide

## Issue Report
Users on Mac are experiencing issues where clicking the "Reserve" button does nothing when trying to make reservations.

## Changes Made to Fix the Issue

### 1. Enhanced Error Logging
Added comprehensive console logging throughout the reservation flow:
- All functions now log when they're called and what parameters they receive
- Each validation step logs its result
- Success and failure paths are clearly logged
- Stack traces are logged for all errors

### 2. Fixed Event Handler Issue
**This was likely the main issue!**

The original code used the global `event` variable to find the clicked button:
```javascript
const button = event?.target?.closest('button');
```

This doesn't work reliably across all browsers, especially Safari on Mac. The fix:
- Updated all onclick handlers to pass `this` and `event` explicitly
- Functions now accept `buttonElement` and `evt` parameters
- Fallback logic handles cases where either might be undefined

Before:
```html
<button onclick="makeReservation('forecast-id')">
```

After:
```html
<button onclick="makeReservation('forecast-id', this, event)">
```

### 3. Improved User Feedback
- All buttons now show a spinner while processing
- Buttons are disabled during processing to prevent double-clicks
- Buttons are re-enabled after operation completes
- Clear error messages are shown to the user
- Alert messages appear at the top of the page for all operations

### 4. Better Error Handling
- Added global error handler to catch unhandled errors
- Added unhandled promise rejection handler
- All async operations now have proper try-catch blocks
- Error messages include details and suggestions

### 5. Diagnostic Tools
Added a "Run Diagnostics" button that shows:
- Current user login status
- Team member data status
- Browser and platform information
- Safari/Mac detection
- Number of campaigns, forecasts, and reservations loaded
- Database initialization status
- Function registration status

### 6. Enhanced Initialization Logging
The page now logs every step of the initialization process:
- Auth system availability
- User authentication status
- Team member data loading
- Campaign/forecast/reservation loading
- Event listener setup
- Filter application

## How to Diagnose the Issue

### Step 1: Ask the User to Run Diagnostics
1. Have them open the page: `/team/reserve-calls.html`
2. Click the "Run Diagnostics" button (orange button at the top)
3. Share the diagnostic report popup and console output

### Step 2: Check Browser Console
Ask the user to:
1. Open Developer Tools (F12 or Cmd+Option+I on Mac)
2. Go to the Console tab
3. Refresh the page
4. Look for errors marked with 🚨 or ❌
5. Try to make a reservation
6. Share any console output

### Step 3: Look for Common Issues

#### Issue: Not Logged In
**Symptoms:**
- Console shows: `⚠️ No authenticated user found`
- Diagnostic report shows: `NOT LOGGED IN`

**Solution:**
- User needs to log in first
- After logging in, they may need to refresh the page

#### Issue: Team Member Data Not Loaded
**Symptoms:**
- Console shows: `⚠️ No team member record found for this user`
- Diagnostic report shows: `NOT LOADED` for Team Member

**Solution:**
- The user's email needs to be added to the `teamMembers` collection in Firestore
- Contact admin to add their profile

#### Issue: Firebase Not Initialized
**Symptoms:**
- Console shows: `❌ Firebase initialization error`
- Diagnostic report shows: `DB Initialized: No`

**Solution:**
- Check if the auth scripts are loading: `../js/auth.js` and `../js/folder-protection.js`
- Check browser console for 404 errors on script files
- Check for CORS errors

#### Issue: Safari Privacy Settings
**Symptoms:**
- Safari on Mac
- Console shows privacy-related warnings
- Diagnostic report shows: `Safari on Mac detected`

**Solution:**
- Check Safari Preferences → Privacy
- Ensure "Prevent cross-site tracking" is not blocking Firebase
- Try in a different browser to confirm it's Safari-specific
- May need to whitelist Firebase domains

### Step 4: Specific Debugging

When the user clicks "Reserve", the console should show:
```
🔵 makeReservation called for forecast: [forecast-id]
🔵 Current user: [email]
🔵 Team member data: [object]
🔵 Button element: [HTMLButtonElement]
🔵 Reserved calls input: [number]
📝 Making reservation: {forecastId, reservedCalls, userEmail}
✅ Reservation created with ID: [doc-id]
```

If you don't see this sequence, look for where it stops:
- If nothing appears: onclick handler not firing (browser issue)
- If stops after "Current user": login issue
- If stops after "Team member data": team member not found
- If stops after "Making reservation": Firebase write permission issue

## Testing the Fix

### Test Scenario 1: Fresh Load
1. Open page in fresh browser/incognito
2. Should see warning about not being logged in
3. Log in
4. Refresh page
5. Diagnostic should show user and team member loaded
6. Try making a reservation
7. Should see success message

### Test Scenario 2: Existing Reservation
1. Make a reservation
2. Page should update to show "Your Reservation" card
3. Try updating the number
4. Click "Update"
5. Should see success message
6. Try canceling
7. Should see confirmation dialog, then success message

### Test Scenario 3: Multiple Forecasts
1. Apply different filters
2. Make reservations for multiple forecasts
3. Statistics bar should update correctly
4. Refresh page
5. Reservations should persist

## Expected Console Output for Successful Reservation

```
🔵 makeReservation called for forecast: abc123
🔵 Current user: user@example.com
🔵 Team member data: {id: "tm123", name: "John Doe", email: "user@example.com"}
🔵 Button element: button.btn.btn-small.btn-primary
🔵 Reserved calls input: 5
🔵 Total reserved: 0 Expected: 10
📝 Making reservation: {forecastId: "abc123", reservedCalls: 5, userEmail: "user@example.com"}
✅ Reservation created with ID: res123
📝 Loading reservations...
✅ Reservations loaded: 1
```

## Browser-Specific Notes

### Safari on Mac
- May have stricter privacy settings
- Check for ITP (Intelligent Tracking Prevention) issues
- May need to allow cookies/storage for Firebase domain
- Try disabling "Prevent cross-site tracking" temporarily

### Chrome on Mac
- Should work without issues
- If problems persist, check extensions that might block scripts

### Firefox on Mac
- Check Enhanced Tracking Protection settings
- May need to whitelist Firebase domains

## Firestore Security Rules to Check

Ensure these collections have appropriate read/write rules:
- `teamMembers` - Read access for authenticated users
- `campaigns` - Read access for team members
- `callForecasts` - Read access for team members
- `callReservations` - Read/write access for team members to their own reservations

## Contact Information

If the issue persists after checking all the above:
1. Get the full diagnostic report
2. Get console output from page load
3. Get console output from attempting a reservation
4. Share browser version and macOS version
5. Try in a different browser to isolate the issue

## Quick Fix Checklist

- [ ] User is logged in
- [ ] User profile exists in `teamMembers` collection
- [ ] Page shows forecasts (data is loading)
- [ ] Diagnostic button shows all green checkmarks
- [ ] Console shows no red errors
- [ ] Button changes to spinner when clicked
- [ ] Success/error message appears after clicking

