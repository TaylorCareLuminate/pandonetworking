# LinkedIn Message Scheduling - Quick Start Guide 🚀

## Where to Find Everything

### 1. Schedule Messages (review_replies.html)
**URL:** `/connect/review_replies.html`

**Location:** Scroll to bottom → "Connected But No Reply" section

**What You'll See:**
```
┌─────────────────────────────────────────────────────────────┐
│  Connected But No Reply                                      │
│  ─────────────────────────────────────────────────────────  │
│                                                               │
│  [Load Contacts] [Export CSV] [Schedule Messages (0)]        │
│  [Select All] [Hide Wrong Contacts (0)]                      │
│                                                               │
│  ┌──────────────────────────────────────────────────┐ ☑     │
│  │ 👤 John Doe         [linkedin icon]              │       │
│  │ 📋 VP of Marketing                               │       │
│  │ 🏢 Acme Corp                                     │       │
│  │ 📅 Connected: Jan 15, 2026                       │       │
│  │ 💬 You messaged them, no reply yet               │       │
│  │                                                   │       │
│  │ [Send Message] [Mark Wrong Contact]              │       │
│  └──────────────────────────────────────────────────┘       │
│                                                               │
│  ┌──────────────────────────────────────────────────┐ ☑     │
│  │ 👤 Jane Smith       [linkedin icon]              │       │
│  │ ... (more contacts)                              │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 2. View Message Queue (linkedin_message_slots.html)
**URL:** `/connect/linkedin_message_slots.html`

**What You'll See:**
```
┌─────────────────────────────────────────────────────────────┐
│  🗓️ LinkedIn Message Slots                                   │
│  Manage and monitor scheduled LinkedIn messages              │
│  ─────────────────────────────────────────────────────────  │
│                                                               │
│  📊 Stats:                                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Total: 15  │ │ Pending: 12│ │ Sent: 3    │ │ Avail:35 │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
│                                                               │
│  Filters: [All BDRs ▼] [All Statuses ▼] [Feb 6, 2026]       │
│                                                               │
│  Timeline for Thursday, February 6, 2026:                    │
│  ─────────────────────────────────────────────────────────  │
│  8:00 AM  ┌─────────────────────┐                            │
│           │ ⏰ 8:15 AM [PENDING]│                            │
│           │ 💼 John Doe          │                            │
│           │ Hi John, I noticed...│                            │
│           │ 👤 max.hanner@...    │                            │
│           └─────────────────────┘                            │
│                                                               │
│  9:00 AM  ┌─────────────────────┐                            │
│           │ ⏰ 9:30 AM [PENDING]│                            │
│           │ ... (more messages) │                            │
│           └─────────────────────┘                            │
│  ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Usage

### 📝 Scheduling Messages

**Step 1: Load Contacts**
1. Go to `/connect/review_replies.html`
2. Scroll to bottom "Connected But No Reply" section
3. Click **[Load Contacts]** button
4. Wait for contacts to load

**Step 2: Select Contacts**
- **Option A:** Click checkbox on each contact you want to message
- **Option B:** Click **[Select All]** to select all at once

**Step 3: Write & Schedule**
1. Click **[Schedule Messages (X)]** button
2. Modal opens with:
   - **Date picker** (defaults to tomorrow)
   - **Message text area**
   - **Slot availability indicator**
3. Enter your message
4. Select date (or keep default tomorrow)
5. Review slot availability
6. Click **[Schedule Messages]**

**Step 4: Confirm**
- System shows confirmation with details
- Messages are now in queue!

### 📊 Monitoring Queue

**View All Scheduled Messages:**
1. Go to `/connect/linkedin_message_slots.html`
2. See dashboard with:
   - Total slots for today
   - Pending messages count
   - Successfully sent count
   - Available slots remaining

**Filter Messages:**
- Filter by BDR (dropdown)
- Filter by status (pending/sent/failed)
- Filter by date (date picker)

**View Message Details:**
- Click any message card
- See full message text
- See recipient info
- See status and timestamps
- Delete if needed (only pending messages)

---

## 🎯 Pro Tips

### Best Practices

**Timing:**
- ✅ Schedule for tomorrow, not same day
- ✅ Let system spread messages 8 AM - 6 PM MT
- ❌ Don't schedule all 50 slots every single day

**Message Quality:**
- ✅ Keep under 300 characters
- ✅ Personalize when possible
- ✅ Check for typos before scheduling
- ❌ Don't send generic spam

**Monitoring:**
- ✅ Check dashboard daily
- ✅ Watch for failed messages
- ✅ Learn from what gets responses
- ✅ Adjust strategy based on results

### Common Scenarios

**Scenario 1: Quick Follow-Up to Many Contacts**
```
1. Load contacts
2. Select All
3. Write: "Hi [name], just following up on my last message..."
4. Schedule for tomorrow
5. Done! All messages queued.
```

**Scenario 2: Targeted Campaign**
```
1. Load contacts
2. Manually select only VPs/Directors
3. Write personalized exec-level message
4. Schedule for tomorrow
5. Monitor responses in dashboard
```

**Scenario 3: Fix a Mistake**
```
1. Go to linkedin_message_slots.html
2. Find the pending message
3. Click to view details
4. Click [Delete Message]
5. Go back to review_replies.html
6. Schedule corrected version
```

---

## 🔍 Troubleshooting

### "Schedule Messages button is disabled/grayed out"
- **Cause:** No contacts selected
- **Fix:** Check at least one contact box

### "Only X slots available, but you've selected Y contacts"
- **Cause:** Too many messages for that day (limit 50/day/BDR)
- **Fix:** 
  - Choose a different date, OR
  - Deselect some contacts, OR
  - Delete some pending messages for that date

### "Message not showing in dashboard"
- **Cause:** Wrong date filter
- **Fix:** Change date filter to match when you scheduled

### "Message marked as SKIPPED"
- **Cause:** System detected you already sent this exact message to this contact
- **Fix:** This is working as intended! Duplicate prevention.

### "Message marked as FAILED"
- **Cause:** Error sending to HeyReach API
- **Fix:** 
  - Check Railway logs
  - Verify HeyReach API key is valid
  - Contact admin if persists

---

## 🚨 Important Notes

### Duplicate Detection
The system **automatically prevents** sending the same message twice:
- Checks all past conversations
- Matches exact message text
- Matches exact LinkedIn profile
- If duplicate found: marks as SKIPPED

### Rate Limiting
Built-in protections:
- Max 50 messages per BDR per day
- Messages spread across 10 hours
- 2-second delay between sends
- LinkedIn won't flag as spam

### Editing Messages
- ⚠️ **Cannot edit after scheduling**
- Must DELETE pending message
- Then create new one with corrections

### Message Status Flow
```
PENDING → (Railway checks) → SENT ✅
                          → FAILED ❌
                          → SKIPPED ⚠️
```

---

## 📱 Mobile Usage

All interfaces work on mobile:
- Checkboxes are tap-friendly
- Modals are responsive
- Dashboard timeline scrolls horizontally
- Filters are touch-optimized

---

## 🎨 Visual Indicators

**Status Colors:**
- 🟡 **Yellow/Pending** - Waiting to send
- 🟢 **Green/Sent** - Successfully delivered
- 🔴 **Red/Failed** - Error occurred
- ⚪ **Gray/Skipped** - Duplicate detected

**Button States:**
- **Solid purple** - Ready to use
- **Faded purple** - Disabled (no selections)
- **Red** - Wrong contact actions
- **Green** - Export/download actions

---

## 🏁 Quick Reference

| Action | Page | Button/Location |
|--------|------|----------------|
| Schedule messages | review_replies.html | Bottom section → [Schedule Messages] |
| View queue | linkedin_message_slots.html | Main dashboard |
| Select contacts | review_replies.html | Checkboxes on cards |
| Delete pending | linkedin_message_slots.html | Click message → [Delete] |
| Check slots available | linkedin_message_slots.html | Top stats cards |
| Filter by date | linkedin_message_slots.html | Date picker in filters |

---

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Check Railway logs (admin only)
3. Check Firestore `linkedin_message_queue` collection
4. Contact Taylor Davis

---

**Happy Scheduling! 🚀**
