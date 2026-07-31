# BDR Message Deletion - Quick Reference Guide

## 🎯 Quick Start

1. Go to **BDR Review Settings** page
2. Find the BDR with unreviewed messages
3. Click **"Delete Messages"** button
4. Select your filters (all checked by default)
5. Click **"Delete Selected Messages"**
6. Confirm the action

## 📋 Filter Cheat Sheet

### Message Types

| Filter | What It Deletes | When to Use |
|--------|----------------|-------------|
| 🌐 **Internet Research** | Messages from web scraping/research | Poor quality data, need re-scrape |
| 👤➕ **Connection Requests** | Messages for new connection invites | Strategy changed, wrong tone |
| 💬 **Current Connections** | Messages for existing connections | Campaign focus shifted |

### Message Age

| Filter | What It Deletes | When to Use |
|--------|----------------|-------------|
| 📅❌ **Older than 2 weeks** | Messages 14+ days old | Clear stale backlog |
| 📅✅ **Past 2 weeks** | Messages 0-14 days old | Delete recent test batches |

## 🔥 Common Scenarios

### Scenario 1: Clear All Old Messages
**Goal:** Fresh start, delete everything older than 2 weeks

```
✅ Internet Research
✅ Connection Requests  
✅ Current Connections
✅ Older than 2 weeks
❌ Past 2 weeks
```

### Scenario 2: Delete Recent Test Batch
**Goal:** Remove today's test messages to regenerate

```
✅ Internet Research
✅ Connection Requests
✅ Current Connections
❌ Older than 2 weeks
✅ Past 2 weeks
```

### Scenario 3: Clean Up Research Only
**Goal:** Delete old research messages, keep connection messages

```
✅ Internet Research
❌ Connection Requests
❌ Current Connections
✅ Older than 2 weeks
✅ Past 2 weeks
```

### Scenario 4: Remove All Connection Requests
**Goal:** Delete all connection request messages (any age)

```
❌ Internet Research
✅ Connection Requests
❌ Current Connections
✅ Older than 2 weeks
✅ Past 2 weeks
```

## ⚠️ Safety Features

**Protected Messages:**
- ✅ Approved messages (cannot delete)
- ✅ Messages in customer review (cannot delete)
- ✅ Already deleted messages (skipped)
- ✅ Reviewed messages (skipped)

**Required Selections:**
- At least ONE message type must be checked
- At least ONE age filter must be checked

## 🎨 Visual Guide

```
┌─────────────────────────────────────────┐
│ BDR: John Smith                          │
│ 📊 15 unreviewed messages                │
│                    [Delete Messages] ←── Click here
├─────────────────────────────────────────┤
│ ↓ Panel expands ↓                        │
│                                           │
│ Message Type:                            │
│ ☑ 🌐 Internet Research                   │
│ ☑ 👤➕ Connection Requests                │
│ ☑ 💬 Current Connections                 │
│                                           │
│ Message Age:                             │
│ ☑ 📅❌ Older than 2 weeks                │
│ ☑ 📅✅ Past 2 weeks                       │
│                                           │
│ [Delete Selected] [Cancel]               │
└─────────────────────────────────────────┘
```

## 🔍 How Messages Are Identified

### By Type

**Internet Research:**
- `source: 'internet'`, `'research'`, or `'web'`
- `messageType` contains 'internet' or 'research'

**Connection Requests:**
- `messageType: 'connection'` or `'connection_request'`
- `isConnectionRequest: true`

**Current Connections:**
- `messageType: 'current_connection'`
- `isCurrentConnection: true`

### By Age

- **Two weeks ago cutoff:** Calculated at deletion time
- **Date fields checked:** `createdAt`, `created_at`, `timestamp`
- **No date?** Included if any age filter is selected

## 💡 Pro Tips

1. **Start Small:** Delete for one BDR first to verify
2. **Check Counts:** Total message count updates after deletion
3. **All Default:** By default, ALL filters are checked (deletes everything)
4. **Be Selective:** Uncheck categories you want to KEEP
5. **Confirmation:** Always shows what will be deleted before confirming
6. **Console Logs:** Open browser console for detailed filtering info

## ❌ Troubleshooting

### "No messages match the selected filters"
- Filters too restrictive
- Try checking more boxes
- Verify messages exist in database

### "Please select at least one..."
- All checkboxes in a category are unchecked
- Must select at least one type AND one age filter

### Messages still showing after deletion
- Refresh the page
- Check if they're approved/in review (protected)
- Verify correct BDR email association

## 📱 Mobile Friendly

The interface is fully responsive:
- Filters stack vertically on small screens
- Buttons adapt to screen width
- Touch-friendly checkboxes and buttons

## ⏱️ Performance

- **Fast:** Deletion typically completes in 1-3 seconds
- **Batch:** All matching messages deleted simultaneously
- **Auto-refresh:** Counts update automatically after deletion
- **No downtime:** Other users unaffected during deletion

## 🔗 Related Actions

After deleting messages:
1. **Generate New Messages:** Re-run campaigns with updated parameters
2. **Review Settings:** Adjust BDR review mode if needed
3. **Check Queue:** Verify remaining messages in review queue
4. **Update Templates:** Modify message templates before regenerating

## 📞 Quick Support

**Can't find the page?**
- Must be HealthLuminate admin
- URL: `/connect/bdr_review_settings.html`

**Filters not working?**
- Check browser console for errors
- Verify CLEmail wrapper is loaded
- Try refreshing the page

**Accidentally deleted messages?**
- Deletion is permanent
- No undo available
- Regenerate messages if needed

---

**Last Updated:** January 2026  
**Feature Version:** 1.0  
**Page:** `connect/bdr_review_settings.html`


