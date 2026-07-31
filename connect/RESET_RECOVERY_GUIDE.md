# Reset & Re-recover Messages - Complete Guide

## 🎯 Purpose
When messages were recovered with incorrect field names (showing "Unknown Contact", "No Message Available", etc.), this guide shows you how to cleanly reset and re-recover them with the correct field structure.

## 📋 How Recovery Tracking Works

### The Recovery System
1. **Scrapped Posts**: Stored in `scrapped_linkedin_posts` collection
   - Each post has fields: `classification`, `scrapedBy`, `messageGenerated`
   - Posts are marked as `worthy`, `not_worthy`, or `not_applicable`

2. **Recovery Endpoint**: `/api/connect/recover-worthy-posts`
   - Finds posts where:
     - `scrapedBy == bdrEmail`
     - `classification == 'worthy'`
     - `messageGenerated == false` ← **Key tracking flag!**
   - Generates messages from those posts
   - Marks each post with:
     - `messageGenerated: true`
     - `messageGeneratedAt: <timestamp>`
     - `recoveryNote: 'Generated during post recovery'`

3. **The Problem**: Once `messageGenerated = true`, recovery won't process that post again

## ✅ Complete Fix Process

### Step 1: Delete Old Messages (RECOMMENDED)
Go to Firebase Console:
1. Open `connect_queue` collection
2. Apply filters:
   - `account_email == "drellenpt@gmail.com"` (Ellen's LinkedIn email)
   - `source == "Recovered Worthy Post"`
3. Select all matching messages
4. Delete them

**Why delete?** This ensures you start fresh with clean data and avoid duplicate messages.

### Step 2: Reset Recovery Flags
Go to: `https://healthluminate.com/connect/reset_post_recovery.html`

1. Select the BDR (e.g., "Ellen Morello")
2. Click "Reset Recovery Flags"
3. Confirmation will show how many posts were reset (e.g., "368 posts")

**What this does:**
- Finds all worthy posts where `messageGenerated = true`
- Sets `messageGenerated = false`
- Removes `messageGeneratedAt` and `recoveryNote`
- Adds `resetAt` timestamp for tracking

### Step 3: Re-run Recovery
Go to: `https://healthluminate.com/connect/generate_messages.html`

1. Click "Recovery" tab
2. Select the BDR (e.g., "Ellen Morello")
3. Click "Recover Messages from Scraped Posts"
4. Wait for completion (~368 posts)

**What this generates:**
All messages will now have the CORRECT fields:
- ✅ `message_to_contact` (not `message_text`)
- ✅ `contactFirstName`, `contactLastName` (parsed from name)
- ✅ `contactTitle`, `contactCompany` (from post author)
- ✅ `uploaded_date` (required for queries)
- ✅ All other required metadata

### Step 4: Verify in Fast Connect Review
Go to: `https://healthluminate.com/connect/fast_connect_review.html`

1. Select the BDR
2. Messages should now display correctly:
   - ✅ Full contact name (not "Unknown Contact")
   - ✅ Job title & company (not "Unknown Position at Unknown Company")
   - ✅ Complete message text (not "No Message Available")

## 🔄 Alternative: Fix Without Deleting

If you prefer to fix existing messages without deleting them:

### Option A: Migration Script
Go to: `https://healthluminate.com/connect/fix_recovered_messages.html`

This will:
- Convert `message_text` → `message_to_contact`
- Parse `prospect_name` → `contactFirstName` + `contactLastName`
- Add missing title/company fields
- Add `uploaded_date` where missing

**Limitation**: This fixes field names but keeps old post data. Clean re-recovery is still recommended.

### Option B: Manual Cleanup + Reset + Recovery
1. Manually delete old messages in Firebase Console
2. Use `reset_post_recovery.html` to reset flags
3. Use `generate_messages.html` Recovery tab to regenerate

## 🛠️ Technical Details

### Backend Endpoints

#### `/api/connect/reset-post-recovery-flags`
**Purpose**: Clear `messageGenerated` flags to allow re-recovery

**Request:**
```json
{
  "bdrEmail": "ellen@everex.ai"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reset 368 posts - they can now be re-recovered",
  "postsReset": 368,
  "bdrEmail": "ellen@everex.ai"
}
```

**What it does:**
```javascript
// Finds posts
WHERE scrapedBy == bdrEmail
  AND classification == 'worthy'
  AND messageGenerated == true

// Updates each post
SET messageGenerated = false
DELETE messageGeneratedAt
DELETE recoveryNote
ADD resetAt = now()
ADD resetNote = 'Reset for re-recovery with corrected field names'
```

#### `/api/connect/recover-worthy-posts`
**Purpose**: Generate messages from worthy posts

**Query:**
```javascript
WHERE scrapedBy == bdrEmail
  AND classification == 'worthy'
  AND messageGenerated == false  // ← Only processes unprocessed posts
```

**Creates messages with:**
- Full contact name fields (first/last)
- Job title and company
- Correct message field name (`message_to_contact`)
- All required timestamps
- All required metadata

**Marks posts after generation:**
```javascript
SET messageGenerated = true
SET messageGeneratedAt = now()
SET recoveryNote = 'Generated during post recovery'
```

### Frontend Pages

1. **`reset_post_recovery.html`**
   - Simple UI to trigger flag reset
   - Shows count of posts reset
   - Loads active BDRs from Firebase

2. **`generate_messages.html`** (Recovery tab)
   - Triggers recovery endpoint
   - Shows progress and results
   - Already exists, no changes needed

3. **`fix_recovered_messages.html`**
   - Migration script to fix field names
   - Adds missing fields to existing messages
   - Alternative to deleting and re-recovering

## 📊 Expected Results

### Before Fix
```
Unknown Contact
Unknown Position at Unknown Company
Message: No Message Available
```

### After Fix
```
Dan Rootenberg
CEO at Spear Physical Therapy
Message: "Just saw your post about the holiday party vibes at Spear Physical Therapy. 
Love how you shared the team's energy and heart. So inspiring Thanks for that post."
```

## ⚠️ Important Notes

1. **Don't skip Step 1**: Deleting old messages prevents duplicates and ensures clean data
2. **Wait for deployment**: After code changes, wait ~1 minute for Railway to deploy
3. **One BDR at a time**: Process one BDR completely before moving to the next
4. **Check Firebase**: Verify old messages are deleted before re-running recovery
5. **Monitor logs**: Check Railway logs if recovery seems stuck or fails

## 🚀 Quick Reference

| Task | URL |
|------|-----|
| Delete messages | Firebase Console → `connect_queue` |
| Reset flags | `https://healthluminate.com/connect/reset_post_recovery.html` |
| Re-run recovery | `https://healthluminate.com/connect/generate_messages.html` (Recovery tab) |
| Fix existing | `https://healthluminate.com/connect/fix_recovered_messages.html` |
| Verify | `https://healthluminate.com/connect/fast_connect_review.html` |

## ✅ Files Updated

### Backend
- `RailwayCLemail/server.js`:
  - New endpoint: `/api/connect/reset-post-recovery-flags` (lines ~27296-27385)
  - Enhanced: `/api/connect/recover-worthy-posts` (lines ~26880-26940)
  - Enhanced: `/api/connect/migrate-recovered-messages` (lines ~27122-27230)

### Frontend
- `HealthLuminateSiteFromLocal/connect/reset_post_recovery.html` (NEW)
- `HealthLuminateSiteFromLocal/connect/fix_recovered_messages.html` (updated)

### Documentation
- `MESSAGE_RECOVERY_COMPLETE_FIX.md` - Field fix details
- `RESET_RECOVERY_GUIDE.md` - This file
