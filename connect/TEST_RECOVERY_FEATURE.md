# Test Recovery Feature - Quick Guide

## 🎯 New Feature: Test Recovery (5 Messages)

Added a "Test Recovery" button that generates only 5 messages so you can verify they're displaying correctly before running a full recovery.

## 📍 Where to Find It

Go to: `https://healthluminate.com/connect/generate_messages.html`
- Click the "Recovery" tab
- You'll now see TWO buttons:
  1. **Test Recovery (5 messages)** - Generate 5 messages only
  2. **Recover ALL Messages** - Generate all available messages

## ✅ How to Use

### Step 1: Test Recovery
1. Go to `generate_messages.html` → Recovery tab
2. Select the BDR (e.g., "Ellen Morello")
3. Click **"Test Recovery (5 messages)"**
4. Wait ~30 seconds for 5 messages to generate

### Step 2: Verify Messages
1. Go to `https://healthluminate.com/connect/fast_connect_review.html`
2. Select the same BDR
3. Check that the 5 messages display correctly:
   - ✅ Contact names visible (not "Unknown Contact")
   - ✅ Job titles & companies visible (not "Unknown Position")
   - ✅ Full message text visible (not "No Message Available")

### Step 3: Full Recovery
If test messages look good:
1. Go back to `generate_messages.html` → Recovery tab
2. Click **"Recover ALL Messages"**
3. Wait for all messages to generate (~368 for Ellen)

## 🔧 Technical Details

### Backend Changes
- `/api/connect/recover-worthy-posts` now accepts optional `limit` parameter
- When `limit` is provided, recovery stops after generating that many messages
- Posts are still marked as `messageGenerated: true` after processing

### Frontend Changes
- Added "Test Recovery (5 messages)" button
- Updated `recoverScrapedPosts()` function to accept `testMode` parameter
- Test mode sends `{ bdrEmail, limit: 5 }` to backend
- Results display shows "Test Mode Complete" with link to Fast Connect Review

### Example Request
**Test Recovery:**
```json
{
  "bdrEmail": "ellen@everex.ai",
  "limit": 5
}
```

**Full Recovery:**
```json
{
  "bdrEmail": "ellen@everex.ai"
}
```

## 📋 Complete Workflow

### After Field Fixes
1. **Delete old messages** in Firebase Console (optional but recommended)
2. **Reset recovery flags** at `reset_post_recovery.html`
3. **Test recovery** - Generate 5 messages
4. **Verify in Fast Connect Review** - Check they look correct
5. **Full recovery** - Generate all remaining messages
6. **Final verification** - Confirm all messages display properly

## ⚠️ Important Notes

1. **Test messages count toward total**: The 5 test messages will be marked as processed, so they won't be regenerated during full recovery
2. **Posts are marked after generation**: Even in test mode, posts that are processed are marked with `messageGenerated: true`
3. **Use reset if needed**: If you want to re-test with the same posts, use `reset_post_recovery.html` to clear the flags first

## 🎉 Benefits

- **Faster verification**: No need to wait for all 368 messages to check if fields are correct
- **Lower risk**: Test with just 5 messages before committing to full recovery
- **Quick iteration**: If something is wrong, you can fix it and re-test quickly
- **Saves time**: ~30 seconds for 5 messages vs. several minutes for all messages

## 📊 Expected Results

### Test Recovery Success:
```
✅ Test Recovery Complete!
Posts Processed: 5
Messages Generated: 5
Skipped (Duplicates): 0

🎯 Test Mode Complete!
Please check Fast Connect Review to verify the 5 test messages 
are displaying correctly before running full recovery.
```

### Full Recovery Success:
```
✅ Recovery Complete
Posts Processed: 368
Messages Generated: 368
Skipped (Duplicates): 0
```

## 🔗 Related Pages

- **Test Recovery**: `generate_messages.html` (Recovery tab)
- **Verify Messages**: `fast_connect_review.html`
- **Reset Flags**: `reset_post_recovery.html`
- **Migration**: `fix_recovered_messages.html`

## ✅ Files Updated

### Backend
- `RailwayCLemail/server.js`:
  - Line ~26623: Added `limit` parameter support
  - Line ~26806: Added limit check in processing loop

### Frontend
- `HealthLuminateSiteFromLocal/connect/generate_messages.html`:
  - Line ~1018: Added "Test Recovery (5 messages)" button
  - Line ~2911: Updated `recoverScrapedPosts()` to support test mode
  - Line ~3234: Added event listener for test button
