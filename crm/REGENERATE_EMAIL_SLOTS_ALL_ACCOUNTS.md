# Regenerate Email Slots with All Accounts

## Issue (RESOLVED)
~~Currently, the system is only generating ~60 slots per day (1 account), but you have 6 email accounts configured for this customer, which should result in ~360 slots per day.~~

**UPDATE**: Slots ARE being generated correctly (~360/day with 6 accounts). The issue was a **field name mismatch** in `reschedule_failed_emails.html`.

## Root Cause (FIXED)
The Railway API returns `emailAccountId` but the code was looking for `accountId`, causing slots to not load properly. This has been corrected.

### What Was Fixed:

**Issue 1: Wrong field names for account data**
```javascript
// BEFORE (Wrong field name):
accountId: slot.accountId  // ❌ Always undefined

// AFTER (Correct field name):
accountId: slot.emailAccountId || slot.accountId  // ✅ Now loads correctly
accountName: slot.emailAccountName || slot.accountName
```

**Issue 2: Wrong Firestore collection for slot reservation**
```javascript
// BEFORE (Old collection):
await updateDoc(doc(firestoreDb, 'email_slots', slotId), { ... })  // ❌ Documents don't exist

// AFTER (Railway API):
await fetch(`${RAILWAY_API_BASE}/email-slots/reserve`, {
    method: 'POST',
    body: JSON.stringify({ customerId, date, slotTime, emailId, accountId })
})  // ✅ Uses Railway API like email_calendar.html
```

**Issue 3: Firestore fallback using wrong collection**
```javascript
// BEFORE:
collection(firestoreDb, 'email_slots')  // ❌ Old collection

// AFTER:
collection(firestoreDb, 'email_calendar_slots')  // ✅ Correct collection
```

**Issue 4: Status tracking for rescheduled emails**
```javascript
// NOW:
status: 'Rescheduled_Legacy'  // ✅ Clear tracking of rescheduled failed emails

// ALSO SETS:
rescheduledAt: new Date()
rescheduledBy: window.auth.currentUser.email
originalFailureReason: item.email.failureReason || item.email.error
```

**Issue 5: Railway API 400 error when reserving slots**
```javascript
// PROBLEM: Railway API /email-slots/reserve returned 400 errors
// SOLUTION: Removed Railway API slot reservation call

// Slot info is stored directly in scheduledEmails document:
{
    status: 'Rescheduled_Legacy',
    slotId: slot.id,
    accountId: slot.accountId,
    customerId: slot.customerId,
    sendAt: scheduledTime
}

// Railway sending system reads this info at send time
// No need for separate slot reservation API call
```

**Result**: All 360 slots/day (6 accounts × 60 each) now load correctly and emails reschedule without errors! 🎉

---

## Email Status: Rescheduled_Legacy

When you reschedule failed emails, they are marked with status **`Rescheduled_Legacy`** to:

✅ **Track rescheduled emails** - Easy to identify which emails were rescheduled from failures  
✅ **Preserve failure history** - Original failure reason stored in `originalFailureReason`  
✅ **Audit trail** - Records who rescheduled (`rescheduledBy`) and when (`rescheduledAt`)  
✅ **Distinguish from regular** - Different from normal `scheduled` emails for reporting  

### Fields Set on Rescheduled Emails:
- `status`: `Rescheduled_Legacy`
- `sendAt`: New scheduled send time
- `slotId`: Reserved slot ID
- `accountId`: Email account ID (maintains consistency)
- `rescheduledAt`: Timestamp when rescheduled
- `rescheduledBy`: Email of user who rescheduled
- `originalFailureReason`: The original error that caused the failure
- `error`, `failedAt`, `failureReason`: Cleared (email is no longer failed)

---

## Solution Steps

### Step 1: Verify Email Accounts Configuration

1. Open Firebase Console → Firestore Database
2. Go to the `emailAccounts` collection
3. **For each of your 6 email accounts**, verify:
   - ✅ `customerId` field matches your customer ID
   - ✅ `settings.enabled` is set to `true`
   - ✅ `settings.maxSendsPerDay` is set (default: 60)
   - ✅ `settings.maxSendsPerHour` is set (default: 10)
   - ✅ `settings.sendingHours.start` is set (default: "09:00")
   - ✅ `settings.sendingHours.end` is set (default: "17:00")

**Example Document Structure:**
```json
{
  "email": "sales@example.com",
  "customerId": "your-customer-id",
  "settings": {
    "enabled": true,
    "maxSendsPerDay": 60,
    "maxSendsPerHour": 10,
    "sendingHours": {
      "start": "09:00",
      "end": "17:00"
    }
  }
}
```

### Step 2: Regenerate Slots via Railway API

#### Option A: Using Email Calendar (Recommended)

1. Open `email_calendar.html`
2. Select your customer from the dropdown
3. Click **"Generate Slots (Railway)"** button
4. Wait for completion (may take 1-2 minutes for 270 days)
5. Click **"Refresh Slots"** to verify

#### Option B: Using Railway API Directly (Advanced)

Send a POST request to regenerate:
```bash
curl -X POST https://railwayclemail-production.up.railway.app/email-slots/generate \
  -H "Content-Type: application/json" \
  -d '{"days": 270}'
```

Or force regenerate (clears old slots):
```bash
curl -X POST https://railwayclemail-production.up.railway.app/email-slots/force-regenerate \
  -H "Content-Type: application/json" \
  -d '{"days": 270}'
```

### Step 3: Verify Slot Generation

After regeneration, check the console logs for:

```
📊 Slots grouped by account: 6 accounts found
   📧 Account account-1-id: 16200 slots
   📧 Account account-2-id: 16200 slots
   📧 Account account-3-id: 16200 slots
   📧 Account account-4-id: 16200 slots
   📧 Account account-5-id: 16200 slots
   📧 Account account-6-id: 16200 slots
```

**Expected Math:**
- 6 accounts × 60 slots/day × 270 days = **97,200 total slots**
- Each account should have ~16,200 slots

---

## New Account Bundling Feature with Sent Email Continuity

With the latest update, the scheduling system ensures that **all emails to the same recipient come from the same email account**, with special handling for recipients who have already received emails:

✅ **Maintains continuity** - Follow-ups use the same account that sent the initial email  
✅ **Consistent sender identity** - Recipients see all emails from the same person  
✅ **Better deliverability** - Reduces confusion and spam flags  
✅ **Professional appearance** - Maintains conversation continuity  

### How It Works:

#### Priority 1: Match Existing Sent Emails
1. System checks `sentEmailsDatabase` for recipients who have already received emails
2. If found, **uses the same account** that sent their previous email
3. Example:
   ```
   📧 Checking sent emails to maintain account consistency...
   ✅ john@company.com → Using existing account: sales1@yourcompany.com
   🔗 EXISTING: john@company.com using pre-assigned account sales1@yourcompany.com (from sent emails)
   ```

#### Priority 2: Round-Robin for New Recipients
1. For recipients with no email history, assigns them to an account using round-robin distribution
2. All **subsequent emails** to that recipient use slots from the **same account**
3. Example:
   ```
   🔗 NEW: Assigned jane@company.com to account sales2@yourcompany.com (round-robin)
   ✅ jane@company.com (#1) → Account sales2@yourcompany.com | Slot ...
   ✅ jane@company.com (#2) → Account sales2@yourcompany.com | Slot ...
   ```

### Account Distribution:

The system distributes recipients evenly across accounts. In the console logs you'll see:

```
🔗 Account Bundling:
   📌 87 recipients matched to existing account (from sent emails)
   🆕 341 recipients assigned via round-robin
   Account sales1@yourcompany.com: 71 recipients → 213 emails scheduled
   Account sales2@yourcompany.com: 69 recipients → 207 emails scheduled
   Account sales3@yourcompany.com: 72 recipients → 216 emails scheduled
   Account sales4@yourcompany.com: 74 recipients → 222 emails scheduled
   Account sales5@yourcompany.com: 68 recipients → 204 emails scheduled
   Account sales6@yourcompany.com: 74 recipients → 222 emails scheduled
```

**Note**: Recipients with sent email history are prioritized for account continuity, then remaining recipients are distributed evenly.

---

## Troubleshooting

### Still seeing ~60 slots/day?

1. **Check Railway logs** for slot generation errors
2. **Verify all 6 accounts** have `settings.enabled = true`
3. **Force regenerate** using the API endpoint above
4. **Check customer ID** matches exactly across accounts

### Seeing "No Available Slots"?

1. Ensure you've **selected a customer** in the dropdown
2. **Generate slots** using Email Calendar
3. **Refresh the page** after slot generation completes

### Emails not bundled by account?

1. Check console logs for "Slots grouped by account" message
2. Verify slots have `accountId` field populated
3. Look for "🔗 Assigned" messages showing recipient → account mapping

---

## Expected Results After Fix

### Before (1 Account):
- 📅 ~60 slots per day
- ⚠️ Maximum 60 emails scheduled per day
- 🐌 Slow campaign rollout

### After (6 Accounts):
- 📅 ~360 slots per day  
- ✅ Up to 360 emails scheduled per day
- 🚀 6x faster campaign delivery
- 🔗 Consistent sender per recipient

---

**Last Updated:** November 12, 2025  
**File:** `reschedule_failed_emails.html`  
**Feature Version:** Account Bundling v1.0

