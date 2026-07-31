# Multi-Tab Simultaneous Logout Fix

**Date**: January 24, 2026  
**Version**: auth.js v1.2.4-multitab-fix  
**Status**: ✅ FIXED

## Problem Reported

Users were experiencing **simultaneous logouts across all tabs** when multiple connect folder pages were open:
- Having several tabs open at the same time
- All tabs would suddenly redirect to login page at the same time
- Session would appear to expire even though user was actively using the system

## Root Cause Identified

The issue was in the **cross-tab authentication synchronization** logic in `auth.js`:

### The Problem Flow:

1. **Token Refresh Triggered**: Every 20 minutes, each tab refreshes its Firebase auth token
2. **Storage Event Fired**: Firebase updates `localStorage` when refreshing the token
3. **All Tabs React**: The storage event listener in other tabs detects this change
4. **False Logout Detection**: The old logic couldn't distinguish between:
   - A token update (oldValue → newValue) ✅ Should be IGNORED
   - An actual logout (oldValue → null) ❌ Should trigger logout sync

5. **Race Condition**: The 500ms delay wasn't always enough for Firebase to settle
6. **Cascade Effect**: One false logout triggered all tabs to log out

### Why Previous Fixes Weren't Enough:

The previous implementation (v1.2.3) had:
- ✅ 30-minute grace period in main auth state check
- ✅ 5-minute grace period in cross-tab sync
- ❌ But still reacted to **every** storage event, including token updates
- ❌ Short delays (500ms) weren't sufficient for Firebase to settle

## Solution Implemented

### Key Fix: Smart Storage Event Detection

The storage event listener now **intelligently detects** the type of change:

```javascript
const isActualLogout = event.oldValue && !event.newValue;  // Key removed = logout
const isLogin = !event.oldValue && event.newValue;         // Key added = login
const isTokenUpdate = event.oldValue && event.newValue;    // Key updated = token refresh

if (isTokenUpdate) {
  // IGNORE - this is just a token refresh, not a login/logout
  console.log('🔄 Token refresh detected in another tab (ignoring)');
  return;
}
```

### Additional Improvements:

1. **Increased Delays**:
   - Initial delay: 500ms → **1000ms** (give Firebase more time to settle)
   - Logout verification: 0ms → **1500ms additional** delay to confirm

2. **Longer Grace Period**:
   - Cross-tab sync grace: 5 minutes → **10 minutes**
   - This prevents false logouts during any Firebase hiccups

3. **Double Verification for Logout**:
   - First check after 1000ms: Is user still logged out?
   - Second check after 2500ms total: Confirm logout is real
   - Only then proceed with logout across tabs

## Files Modified

### `HealthLuminateSite/js/auth.js`

**Version**: 1.2.3-stable → **1.2.4-multitab-fix**

**Changes**:
- Lines 992-1090: Completely rewrote cross-tab storage event listener
- Added detection logic for token updates vs actual login/logout
- Increased delays and grace periods
- Added double-verification for logout events

## How It Works Now

### Scenario 1: Token Refresh in Another Tab
```
Tab 1: Refreshes token at 10:00 AM
  ↓
Firebase: Updates localStorage with new token
  ↓
Tab 2-5: Detect storage change
  ↓
New Logic: "This is a token update (oldValue & newValue both exist)"
  ↓
Result: ✅ IGNORE - No action taken, all tabs stay logged in
```

### Scenario 2: Actual Logout in Another Tab
```
Tab 1: User clicks logout
  ↓
Firebase: Removes auth key from localStorage (newValue = null)
  ↓
Tab 2-5: Detect storage change
  ↓
New Logic: "This is an actual logout (oldValue exists, newValue is null)"
  ↓
Wait 1000ms: Check if auth.currentUser still null
  ↓
Wait another 1500ms: Double-verify logout is real
  ↓
Result: ✅ All tabs log out (correct behavior)
```

### Scenario 3: False Logout During Token Refresh
```
Tab 1: Token refresh starts
  ↓
Firebase: Temporarily shows no user (brief glitch)
  ↓
Tab 2-5: Detect potential logout
  ↓
New Logic: "User was authenticated 2 minutes ago (within 10-min grace)"
  ↓
Result: ✅ IGNORE - Protection against false logout
  ↓
After 1000ms: Firebase settles, user is back
  ↓
Result: ✅ All tabs stay logged in
```

## Testing the Fix

### Before the Fix:
1. Open 5 tabs with different connect pages
2. Wait ~20 minutes for token refresh
3. ❌ **All tabs suddenly redirect to login page**

### After the Fix:
1. Open 5 tabs with different connect pages
2. Wait ~20 minutes for token refresh
3. ✅ **All tabs stay logged in**
4. ✅ Console shows: "Token refresh detected in another tab (ignoring)"

### To Verify It's Working:

1. **Open Browser Console** (F12)
2. **Open multiple connect pages** in different tabs
3. **Watch the console logs**:
   - You should see: `🔄 [Global] Auth token refreshed successfully` every 20 minutes
   - In other tabs: `🔄 Token refresh detected in another tab (ignoring)`
   - You should NOT see: `⚠️ User logged out in another tab`

4. **Test actual logout**:
   - Manually log out in one tab
   - Other tabs should log out after ~2.5 seconds (correct behavior)

## Technical Details

### Storage Event Properties Used:

- `event.key`: The localStorage key that changed
- `event.oldValue`: Previous value (or null if key was added)
- `event.newValue`: New value (or null if key was removed)

### Firebase Auth Keys:

Firebase stores auth state in keys like:
- `firebase:authUser:[API_KEY]:[APP_NAME]`

When Firebase refreshes a token:
- ✅ Key remains (oldValue exists)
- ✅ Value is updated with new token (newValue exists)
- ❌ **Previous logic reacted to this as potential logout**

When user actually logs out:
- ✅ Key is removed (oldValue exists)
- ✅ No new value (newValue is null)
- ✅ **New logic correctly identifies this as logout**

## Benefits

1. **No More False Logouts**: Token refreshes are completely ignored
2. **Better Resilience**: Multiple layers of protection against false positives
3. **True Cross-Tab Sync**: Actual logins/logouts still sync correctly
4. **Improved User Experience**: Users can keep multiple tabs open indefinitely

## Backward Compatibility

✅ **Fully backward compatible**
- All existing pages continue to work without changes
- Page-specific token refresh still works (doesn't conflict)
- All connect folder pages benefit automatically

## Version History

- **v1.2.1**: Added cross-tab sync (November 2025)
- **v1.2.2**: Added centralized token refresh (December 2025)
- **v1.2.3**: Increased grace periods
- **v1.2.4**: **Fixed false logout on token refresh (January 2026)** ← Current

## Debug Utilities

Use these in browser console to monitor auth state:

```javascript
// Check if token refresh is active
window.authDebug.tokenRefreshActive()  // Returns true/false

// Check failure count
window.authDebug.failureCount()  // Returns number

// Manually refresh token
window.refreshAuthToken()

// Check current auth state
window.getCurrentAuthState()
```

## If Issues Persist

If you still experience logouts after this fix:

1. **Check browser console** for error messages
2. **Verify auth.js version**: Should show v1.2.4-multitab-fix on page load
3. **Check token refresh active**: Run `window.authDebug.tokenRefreshActive()` (should return true)
4. **Look for other issues**:
   - Network connectivity problems
   - Firebase account issues
   - Browser localStorage being cleared by extensions

## Notes

- The centralized token refresh in auth.js runs every 20 minutes
- Firebase tokens expire after ~60 minutes
- The 10-minute grace period provides a safety buffer
- Multiple tabs can safely refresh tokens without interfering with each other

