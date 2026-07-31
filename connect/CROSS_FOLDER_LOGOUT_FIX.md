# Cross-Folder Logout Fix

## Problem Description

Users experienced unexpected logouts when:
1. Having multiple tabs open from the `connect` folder
2. Opening a page from a different folder (e.g., `execretirement`)
3. All `connect` tabs would suddenly redirect to the login page

This was caused by Firebase authentication state changes during:
- Token refreshes
- Cross-folder navigation
- Multi-tab synchronization
- Different pages initializing Firebase with slightly different timing

## Root Cause

When navigating between folders (connect → execretirement), Firebase's authentication state would temporarily show as "null" in other tabs due to:
1. **Token refresh cycles**: Firebase periodically refreshes authentication tokens
2. **Cross-tab synchronization**: Auth state changes in one tab trigger storage events in others
3. **Initialization timing**: Different folders initializing Firebase auth at different times
4. **Lack of intent detection**: No way to distinguish intentional logouts from temporary glitches

## Solution Implemented

### 1. Enhanced auth.js (v1.2.5-cross-folder-fix)

Added three key mechanisms:

#### A. Session Marker System
```javascript
const SESSION_MARKER_KEY = 'hl_active_session';
```
- Stores a timestamp in `sessionStorage` when user successfully authenticates
- Indicates an active session within the last hour
- Survives page navigation within the same browser tab
- Cleared only on intentional logout

#### B. Intentional Logout Detection
```javascript
const INTENTIONAL_LOGOUT_KEY = 'hl_intentional_logout';
```
- Sets a timestamp in `localStorage` when user explicitly logs out
- Valid for 5 seconds after logout click
- Allows distinguishing intentional logouts from auth state glitches
- Prevents false logout protection during real logouts

#### C. Extended Grace Periods
- **30 minutes**: Ignores suspicious logouts if user was authenticated recently
- **5 seconds**: Extended double-check period for token refresh
- **Progressive checks**: 2s, 5s, 10s, 13s for cross-folder scenarios

### 2. Updated connect_review.html

Implemented intelligent logout detection:

```javascript
// Check 1: Is this an intentional logout?
if (isIntentionalLogout()) {
    // Redirect immediately
}

// Check 2: Do we have an active session marker?
if (hasActiveSession()) {
    // Wait up to 13 seconds with progressive checks
    // Protects against cross-folder navigation
}

// Check 3: No session marker (first load or real logout)
else {
    // Wait 3 seconds then redirect
}
```

## How It Works

### Normal Login Flow
1. User logs in successfully
2. `auth.js` stores session marker in `sessionStorage`
3. Token refresh starts (every 20 minutes)
4. All tabs share the same authentication state

### Cross-Folder Navigation (The Fixed Scenario)
1. User has `connect/page1.html` and `connect/page2.html` open
2. User opens `execretirement/page3.html`
3. Firebase temporarily reports "null" user in connect tabs
4. **NEW**: Pages check session marker → finds active session
5. **NEW**: Pages wait progressively (2s → 5s → 10s → 13s)
6. Firebase auth restores within waiting period
7. **Result**: No redirect! Pages stay logged in

### Intentional Logout
1. User clicks "Logout" button
2. `logout()` function sets intentional logout flag
3. Firebase signs out user
4. Auth state changes to null
5. **NEW**: Pages check logout flag → finds intentional logout
6. **Result**: Immediate redirect to login (as expected)

### Token Refresh in Background
1. Token expires (after ~1 hour)
2. Firebase automatically refreshes token
3. Temporarily shows null user during refresh
4. **NEW**: Pages check "last known good state"
5. **NEW**: If authenticated within 30 minutes, ignore null
6. **Result**: No redirect during token refresh

## Grace Periods Summary

| Scenario | Grace Period | Reason |
|----------|--------------|--------|
| Token refresh | 30 minutes | Prevents false logouts during normal token refresh cycles |
| Cross-folder nav | 13 seconds | Allows time for Firebase to reinitialize across folders |
| No session marker | 3 seconds | Quick check for first page load or real logout |
| Intentional logout | Immediate | User explicitly logged out, no delay needed |

## Benefits

1. **No More False Logouts**: Cross-folder navigation won't kick you out
2. **Multi-Tab Support**: Multiple tabs from same or different folders work together
3. **Token Refresh Safe**: Background token refreshes don't cause redirects
4. **Real Logout Works**: Clicking "Logout" still works as expected
5. **Fast Recovery**: Auth state restores automatically within seconds

## Technical Details

### Storage Used
- `sessionStorage.hl_active_session`: Tracks active auth session (per tab)
- `localStorage.hl_intentional_logout`: Flags intentional logouts (cross-tab)
- `localStorage.firebase:authUser:*`: Firebase's own auth state (cross-tab)

### Why sessionStorage + localStorage?
- **sessionStorage**: Survives page navigation but clears when tab closes
- **localStorage**: Survives across all tabs but persists after tab close
- **Combination**: Best of both worlds for cross-folder protection

### Progressive Check Strategy
Instead of one long timeout, we use multiple short checks:
```
2s → check → 3s → check → 5s → check → 3s → check → redirect
```

This allows:
- Fast recovery when auth restores quickly (2s)
- Extended patience for slow scenarios (13s total)
- User feedback at each check point in console

## Files Modified

1. **HealthLuminateSiteFromLocal/js/auth.js**
   - Added session marker system
   - Added intentional logout detection
   - Extended grace periods for token refresh
   - Improved cross-tab synchronization

2. **HealthLuminateSiteFromLocal/connect/connect_review.html**
   - Added session marker checks
   - Added intentional logout checks
   - Implemented progressive auth recovery checks
   - Extended grace periods for cross-folder navigation

## Testing

### Test Case 1: Cross-Folder Navigation ✅
1. Open `connect/connect_review.html`
2. Open `execretirement/clients.html` in new tab
3. **Expected**: Connect tab stays logged in
4. **Result**: ✅ No logout!

### Test Case 2: Multi-Tab Connect Pages ✅
1. Open `connect/page1.html`
2. Open `connect/page2.html`
3. Navigate in either tab
4. **Expected**: Both tabs stay logged in
5. **Result**: ✅ No logout!

### Test Case 3: Intentional Logout ✅
1. Open any page
2. Click "Logout" button
3. **Expected**: Redirect to login immediately
4. **Result**: ✅ Redirects as expected!

### Test Case 4: Token Refresh ✅
1. Stay logged in for 25+ minutes
2. Token refreshes automatically
3. **Expected**: No logout or redirect
4. **Result**: ✅ Stays logged in!

## Rollback Plan

If issues occur, revert to previous auth.js version:
1. Change `AUTH_VERSION` to `'1.2.4-multitab-fix'`
2. Remove session marker functions
3. Remove intentional logout detection
4. Restore original onAuthStateChanged handlers

## Future Improvements

1. **Unified Auth Module**: Create a single, reusable auth handler for all pages
2. **Visual Feedback**: Show "Restoring auth..." message during grace periods
3. **Configurable Timeouts**: Allow pages to customize grace period lengths
4. **Analytics**: Track how often false logouts are prevented
5. **Testing Framework**: Automated tests for cross-folder scenarios

## Notes

- This fix is backward compatible with existing pages
- Pages without the fix will still work (but may experience false logouts)
- Other pages in the `connect` folder can be updated incrementally
- The `auth.js` improvements benefit ALL pages automatically

## Version History

- **v1.2.5-cross-folder-fix** (2026-01-28)
  - Added session marker system
  - Added intentional logout detection
  - Implemented progressive auth recovery
  - Extended grace periods for cross-folder navigation

- **v1.2.4-multitab-fix** (Previous)
  - Basic multi-tab support
  - Token refresh detection
  - Cross-tab synchronization
