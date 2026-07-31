# Long-Running Work Logout Fix

## Problem
The `prospect_organizations.html` page was immediately redirecting to login when auth state changed to null, even temporarily. This prevented long-running background work (like scanning hundreds of organizations) from completing.

## Solution Implemented
Added **EXTREMELY AGGRESSIVE** logout protection specifically designed for pages with long-running background work.

### Key Features

#### 1. **12-Hour Session Marker**
- Pages mark sessions as active in `sessionStorage`
- Session is considered valid for **12 HOURS** (not 1 hour like other pages)
- This allows work to run overnight or throughout the day

#### 2. **Progressive 60-Second Wait**
When auth becomes null but an active session exists:
- ⏳ Wait 5 seconds → check if auth restored
- ⏳ Wait 10 more seconds → check again
- ⏳ Wait 15 more seconds → check again  
- ⏳ Wait 15 more seconds → final check
- ✅ Total: **Up to 60 seconds** of patient waiting

This handles:
- Firebase token refreshes (typically resolve in 2-5 seconds)
- Cross-folder navigation (typically resolve in 5-15 seconds)
- Network hiccups (may take up to 30 seconds)
- Heavy browser load (may take up to 60 seconds)

#### 3. **30-Second Fallback**
Even without an active session marker:
- Still waits 30 seconds before redirecting
- Catches edge cases like browser refreshes or cold starts

#### 4. **Intentional Logout Detection**
- Immediate redirect if user clicked "Logout"
- No waiting period for intentional logouts

## How Auth.js Helps

The shared `auth.js` (v1.2.5) provides additional protection:
- Centralized token refresh every 45 minutes
- 4-hour grace period for suspicious logouts
- Cross-tab synchronization
- Ignores token refresh storage events

## Code Location

**File**: `HealthLuminateSiteFromLocal/connect/prospect_organizations.html`
**Lines**: ~815-925 (onAuthStateChanged handler)

## Testing

To verify the fix works:

1. **Open the page** and select a BDR
2. **Start a long-running job** (e.g., "Research All LinkedIn URLs" for 200+ companies)
3. **Open another tab** to a different folder (e.g., `/execretirement`)
4. **Wait and observe** - the prospect_organizations page should:
   - Log warnings about null auth state
   - Wait patiently (up to 60 seconds)
   - Restore auth automatically
   - Continue running the background job

### What You Should See in Console

```
⚠️ Auth state changed to null - checking if this is temporary...
🛡️ Active session detected (valid for 12 HOURS) - waiting patiently for auth to restore...
⏳ Still waiting... (attempt 1/4)
✅ Auth restored after 5s (attempt 1/4)
```

## Why This Works for Long-Running Work

1. **Token Refresh Tolerance**: Firebase tokens refresh every ~50 minutes. The 12-hour session marker ensures we don't mistake refreshes for logouts.

2. **Cross-Tab Tolerance**: Opening pages in other folders temporarily disrupts auth state. The 60-second progressive wait handles this gracefully.

3. **Network Tolerance**: Heavy API calls (like scanning hundreds of companies) can slow the browser. The extended waits prevent false logouts during legitimate work.

4. **Background Work Continuity**: Long-running server jobs (5-60 minutes) can complete without the page logging out mid-process.

## Cost of This Approach

**Tradeoff**: Slower logout detection
- Real logouts take up to 60 seconds to redirect
- Acceptable because data isn't highly sensitive (per user requirement)
- Intentional logouts still redirect immediately

**Benefit**: Work completion
- Background jobs finish successfully
- No more interrupted scans
- No more lost progress

## Pages Using This Protection

Currently applied to:
- ✅ `prospect_organizations.html` (NEW - this fix)
- ✅ `connect_review.html` (previous fix)

### Recommended for Pages With:
- Long-running API calls (>5 minutes)
- Background processing jobs
- Batch operations (100+ items)
- Server-side work that can't be interrupted

### NOT Recommended for Pages With:
- Sensitive financial data
- Payment processing
- Admin configuration changes
- User account management

## Related Documents

- `CROSS_FOLDER_LOGOUT_FIX.md` - Original cross-folder navigation fix
- `AUTH_SESSION_STABILITY_FIX.md` - Auth.js session stability improvements
- `MULTI_TAB_FIX_QUICK_REFERENCE.md` - Multi-tab logout protection

## Version History

- **v1.0** (2026-01-28): Initial implementation for prospect_organizations.html
  - 12-hour session marker
  - 60-second progressive wait
  - 30-second fallback for no session
  - Intentional logout detection
