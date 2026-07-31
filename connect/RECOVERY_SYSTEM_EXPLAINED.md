# Recovery System Explained

## 🔍 How It Works

### 1. Post Tracking System
Every post in `scrapped_linkedin_posts` has a tracking flag:
```javascript
{
  scrapedBy: "ellen@everex.ai",
  classification: "worthy",        // or "not_worthy", "not_applicable"
  messageGenerated: false,         // ← KEY TRACKING FLAG
  messageGeneratedAt: null,
  recoveryNote: null
}
```

### 2. Recovery Process
When you run recovery (`/api/connect/recover-worthy-posts`):

**Step 1: Find unprocessed posts**
```javascript
WHERE scrapedBy == bdrEmail
  AND classification == 'worthy'
  AND messageGenerated == false  // ← Only posts that haven't been processed
```

**Step 2: Generate messages**
- Creates message in `connect_queue` with all required fields
- See `MESSAGE_RECOVERY_COMPLETE_FIX.md` for full field list

**Step 3: Mark post as processed**
```javascript
UPDATE post SET {
  messageGenerated: true,          // ← Prevents re-processing
  messageGeneratedAt: new Date(),
  recoveryNote: 'Generated during post recovery'
}
```

### 3. Why Reset Is Needed
Once `messageGenerated = true`, recovery **skips that post**. To re-process posts (e.g., to fix field names), you need to reset the flag.

## 🔄 Reset Endpoint

### Purpose
Clear `messageGenerated` flags so posts can be re-recovered with corrected field structure.

### Endpoint
`POST /api/connect/reset-post-recovery-flags`

### What It Does
```javascript
// 1. Find processed posts
WHERE scrapedBy == bdrEmail
  AND classification == 'worthy'
  AND messageGenerated == true

// 2. Reset each post
UPDATE post SET {
  messageGenerated: false,         // ← Allow re-processing
  messageGeneratedAt: DELETE,      // Remove old timestamp
  recoveryNote: DELETE,            // Remove old note
  resetAt: new Date(),             // Track when reset
  resetNote: 'Reset for re-recovery with corrected field names'
}
```

### Result
- All worthy posts are marked as "unprocessed"
- Recovery endpoint will process them again
- New messages will have correct field structure

## 📋 Complete Workflow

### Scenario: Fix Ellen's Messages
Ellen's 368 messages have wrong field names (showing "Unknown Contact", etc.)

**Step 1: Delete Old Messages**
- Go to Firebase → `connect_queue`
- Filter: `account_email == "drellenpt@gmail.com"` AND `source == "Recovered Worthy Post"`
- Delete all matches

**Step 2: Reset Tracking Flags**
- Go to `https://healthluminate.com/connect/reset_post_recovery.html`
- Select "Ellen Morello"
- Click "Reset Recovery Flags"
- Result: "Successfully reset 368 posts"

**Step 3: Re-run Recovery**
- Go to `https://healthluminate.com/connect/generate_messages.html`
- Click "Recovery" tab
- Select "Ellen Morello"
- Click "Recover Messages from Scraped Posts"
- Wait for completion

**Step 4: Verify**
- Go to `https://healthluminate.com/connect/fast_connect_review.html`
- Select "Ellen Morello"
- Messages now show correct names, titles, companies, and text

## 🎯 Key Points

1. **`messageGenerated` flag prevents re-processing** - This is by design to avoid duplicates
2. **Reset is safe** - It only changes tracking flags, doesn't delete post data
3. **Always delete old messages first** - Prevents duplicates when re-running recovery
4. **Recovery is idempotent** - Running recovery multiple times on the same posts (after reset) generates identical messages

## 🛠️ Technical Files

| File | Purpose |
|------|---------|
| `server.js` (line ~27296) | Reset endpoint implementation |
| `server.js` (line ~26880) | Recovery endpoint implementation |
| `reset_post_recovery.html` | Frontend UI for reset |
| `generate_messages.html` | Frontend UI for recovery (existing) |

## 📖 Related Documentation
- `RESET_RECOVERY_GUIDE.md` - Complete step-by-step guide
- `MESSAGE_RECOVERY_COMPLETE_FIX.md` - Field structure details
- `MESSAGE_GENERATION_RECOVERY_GUIDE.md` - Original recovery feature docs
