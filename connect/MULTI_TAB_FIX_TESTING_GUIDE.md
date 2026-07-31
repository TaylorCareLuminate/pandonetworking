# Multi-Tab Logout Fix - Testing Scenarios

**Version**: auth.js v1.2.4-multitab-fix  
**Purpose**: Verify the fix is working correctly

---

## 🧪 Test Scenario 1: Normal Multi-Tab Usage

### Setup:
1. Open 5 different connect pages in separate tabs:
   - Tab 1: `index.html` (Dashboard)
   - Tab 2: `connect_review.html`
   - Tab 3: `sent_messages.html`
   - Tab 4: `prospect_contacts.html`
   - Tab 5: `generate_messages.html`

2. Open browser console (F12) in at least 2 tabs to monitor logs

### Expected Behavior:

**On page load (each tab):**
```
✅ Expected console output:
🔄 Auth script loading... (v1.2.4-multitab-fix)
🛡️ Enhanced with centralized token refresh and resilience
👥 Cross-tab authentication synchronization enabled (FIXED: token refresh detection)
🔧 FIX: Storage event now ignores token updates, only reacts to actual login/logout
...
✅ [Global] Token refresh interval started (every 20 minutes)
```

**After 20 minutes (automatic token refresh):**

In the tab where token refreshes:
```
✅ Expected:
🔄 [Global] Auth token refreshed successfully
```

In all other tabs:
```
✅ Expected:
🔄 Token refresh detected in another tab (ignoring - not a logout)
```

```
❌ Should NOT see:
⚠️ User logged out in another tab
❌ Logout confirmed
(redirect to login page)
```

### Result:
✅ **PASS**: All tabs remain logged in and functional  
❌ **FAIL**: Any tab redirects to login page

---

## 🧪 Test Scenario 2: Manual Token Refresh Test

### Setup:
1. Open 3 tabs with connect pages
2. Open console in all 3 tabs

### Steps:
1. In Tab 1 console, run:
   ```javascript
   window.refreshAuthToken()
   ```

2. Watch Tab 2 and Tab 3 consoles

### Expected Behavior:

**Tab 1 (where you ran the command):**
```
✅ Expected:
🔄 [Global] Auth token refreshed successfully
```

**Tab 2 & Tab 3:**
```
✅ Expected:
🔄 Token refresh detected in another tab (ignoring - not a logout)
```

**All tabs:**
```
✅ Expected:
- Remain logged in
- No redirect to login page
- Continue functioning normally
```

### Result:
✅ **PASS**: Other tabs ignore the token refresh  
❌ **FAIL**: Other tabs log out or redirect

---

## 🧪 Test Scenario 3: Actual Logout Sync (Should Still Work)

### Setup:
1. Open 3 tabs with connect pages
2. Open console in Tab 2 and Tab 3

### Steps:
1. In Tab 1, click the logout button (or navigate to logout)

2. Watch Tab 2 and Tab 3

### Expected Behavior:

**Tab 2 & Tab 3 console:**
```
✅ Expected (within 2-3 seconds):
🔄 User logged out in another tab, synchronizing...
⏳ Waiting additional time to confirm logout is real...
❌ Logout confirmed after extended verification
⏹️ [Cross-tab sync] Stopping token refresh
```

**Tab 2 & Tab 3 behavior:**
```
✅ Expected:
- Redirect to login page (after 2-3 second delay)
```

### Result:
✅ **PASS**: Other tabs log out and redirect within 2-3 seconds  
❌ **FAIL**: Tabs stay logged in or immediate redirect (should have delay)

---

## 🧪 Test Scenario 4: Long-Term Multi-Tab Test

### Setup:
1. Open 5+ tabs with different connect pages
2. Leave them open for 1+ hour
3. Periodically check them (every 15-20 minutes)

### Expected Behavior:

**Throughout the hour:**
```
✅ Expected:
- All tabs remain logged in
- Can interact with any tab at any time
- Console shows successful token refreshes
- Console shows "ignoring" messages in other tabs
- No unexpected redirects to login
```

**After 1 hour:**
```
✅ Expected:
- All 5+ tabs still logged in and functional
- At least 3 token refresh cycles completed (20, 40, 60 minutes)
- Zero false logouts
```

### Result:
✅ **PASS**: All tabs work continuously for 1+ hour  
❌ **FAIL**: Any tabs log out unexpectedly

---

## 🧪 Test Scenario 5: Check Debug Utilities

### Setup:
1. Open any connect page
2. Open browser console

### Steps:

Run each command and verify output:

```javascript
// 1. Check version
// Look at console on page load, should see:
// "v1.2.4-multitab-fix"

// 2. Check if token refresh is active
window.authDebug.tokenRefreshActive()
// ✅ Expected: true

// 3. Check current auth state
window.getCurrentAuthState()
// ✅ Expected: { isLoggedIn: true, isVerified: true, ... }

// 4. Check failure count
window.authDebug.failureCount()
// ✅ Expected: 0

// 5. Check Firebase auth
window.auth.currentUser
// ✅ Expected: User object with email property

// 6. Test manual refresh
window.refreshAuthToken()
// ✅ Expected: "🔄 [Global] Auth token refreshed successfully"
```

### Result:
✅ **PASS**: All commands return expected values  
❌ **FAIL**: Any command returns unexpected value or error

---

## 🧪 Test Scenario 6: Network Interruption Recovery

### Setup:
1. Open 2 tabs with connect pages
2. Open console in both

### Steps:
1. In Chrome DevTools, go to Network tab
2. Set throttling to "Offline"
3. Wait 5 seconds
4. Set throttling back to "No throttling"
5. Wait 30 seconds

### Expected Behavior:

```
✅ Expected:
- Tabs remain logged in
- Token refresh may show errors during offline period
- Token refresh recovers after network restored
- No redirect to login (grace period protects against this)
```

### Result:
✅ **PASS**: Tabs stay logged in through network hiccup  
❌ **FAIL**: Tabs log out during or after network interruption

---

## 🧪 Test Scenario 7: Rapid Tab Opening

### Setup:
1. Start with no connect tabs open

### Steps:
1. Rapidly open 10 tabs with connect pages (within 30 seconds)
2. Open console in a few tabs

### Expected Behavior:

```
✅ Expected:
- All tabs load successfully
- All tabs show logged in state
- Token refresh starts in all tabs
- No cross-tab logout events
- All tabs functional
```

### Result:
✅ **PASS**: All 10 tabs open and work correctly  
❌ **FAIL**: Some tabs fail to load or log out

---

## 📊 Summary Checklist

Test all scenarios and check off:

- [ ] **Scenario 1**: Normal multi-tab usage (20+ min) - All tabs stay logged in
- [ ] **Scenario 2**: Manual token refresh - Other tabs ignore it
- [ ] **Scenario 3**: Actual logout - Syncs to other tabs correctly
- [ ] **Scenario 4**: Long-term test (1+ hour) - No false logouts
- [ ] **Scenario 5**: Debug utilities - All return correct values
- [ ] **Scenario 6**: Network interruption - Tabs stay logged in
- [ ] **Scenario 7**: Rapid tab opening - All tabs work

### If All Tests Pass:
✅ **The fix is working correctly!**

You can confidently:
- Keep multiple tabs open indefinitely
- Work across tabs without interruption
- Trust that real logouts will still sync properly

### If Any Test Fails:
❌ **There may be an issue**

Check:
1. Verify auth.js version is v1.2.4-multitab-fix (console on load)
2. Clear browser cache and reload
3. Check console for error messages
4. Verify no browser extensions are interfering
5. Check if ad blockers are blocking Firebase

---

## 🔍 Common Issues & Solutions

### Issue: Console shows old version
**Solution**: Clear cache, hard reload (Ctrl+Shift+R)

### Issue: Token refresh not active
**Solution**: Check if Firebase is blocked by network/firewall

### Issue: Still getting logouts
**Solution**: 
1. Verify version in console
2. Check for JavaScript errors
3. Check Network tab for failed Firebase requests

### Issue: Console not showing expected logs
**Solution**: Make sure console is set to show all levels (Verbose)

---

## 📝 Notes

- Test in your actual work environment (not incognito)
- Use real pages you normally work with
- Test during your normal work flow
- If possible, test on multiple browsers (Chrome, Edge, Firefox)

**Goal**: Verify you can work normally across multiple tabs without unexpected logouts.

