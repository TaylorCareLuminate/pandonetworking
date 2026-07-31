# Sent Messages - Visual Guide

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HEALTHCONNECT HEADER                             │
│  [Logo] HealthConnect    [Dashboard] [Me▼] [Network▼] [Admin▼]    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  📧  Sent Messages & Results                                        │
│  Track your sent connection requests and messages,                  │
│  and see who replied or accepted                                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬────────────┬──────────────┐
│ 📅 Time Range: Last 30 days ▼│  🔄 Refresh │ 💾 Export CSV│
└──────────────────────────────┴────────────┴──────────────┘

┌─────────────┬─────────────┬─────────────┬─────────────┐
│📧 Messages  │👤 Connection│✅ Connections│💬 Replies   │
│   Sent      │  Requests   │  Accepted   │  Received   │
│   ───       │   ───       │   ───       │   ───       │
│    42       │    18       │     12      │     8       │
└─────────────┴─────────────┴─────────────┴─────────────┘

┌─────────────────────────────────────────────────────────┐
│ [All: 60] [Messages: 42] [Connections: 18]             │
│ [With Replies: 8] [Accepted: 12]                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 📨 Sent Items                          Updated: 2:34 PM             │
├────────┬──────┬────────┬─────────┬─────────┬──────────────┤
│Contact │ Type │Date    │Message  │Status   │Last Activity │
│        │      │Sent    │         │         │              │
├────────┼──────┼────────┼─────────┼─────────┼──────────────┤
│John    │📧Msg │Dec 15  │Hi John, │💬Replied│2h ago        │
│Smith   │      │2:15 PM │I saw... │         │              │
│CTO     │      │        │[hover]  │🟢       │              │
│Acme Co │🔗LI  │        │         │         │              │
├────────┼──────┼────────┼─────────┼─────────┼──────────────┤
│Sarah   │👤Conn│Dec 14  │Would    │✅Accepted│1d ago       │
│Johnson │      │10:30 AM│love to..│         │              │
│VP Sales│      │        │[hover]  │🟢       │              │
│TechCo  │🔗LI  │        │         │         │              │
├────────┼──────┼────────┼─────────┼─────────┼──────────────┤
│Mike    │📧Msg │Dec 13  │Great    │⚠️Pending│-            │
│Brown   │      │3:45 PM │meeting..│         │              │
│Director│      │        │[hover]  │🟡       │              │
│BigCorp │🔗LI  │        │         │         │              │
└────────┴──────┴────────┴─────────┴─────────┴──────────────┘
```

## Color Coding

### Summary Cards
```
┌─────────────┐
│📧 Messages  │ ← Green border (#10b981)
│   Sent      │
│    42       │
└─────────────┘

┌─────────────┐
│👤 Connection│ ← Blue border (#0077b5)
│  Requests   │
│    18       │
└─────────────┘

┌─────────────┐
│✅ Connections│ ← Light green (#22c55e)
│  Accepted   │
│    12       │
└─────────────┘

┌─────────────┐
│💬 Replies   │ ← Purple border (#8b5cf6)
│  Received   │
│     8       │
└─────────────┘
```

### Status Badges

```
🟢 ✅ Accepted     ← Green background (#dcfce7)
                    Dark green text (#166534)

🟣 💬 Replied      ← Purple background (#ede9fe)
                    Dark purple text (#5b21b6)

🟡 ⚠️ Pending     ← Yellow background (#fef3c7)
                    Dark yellow text (#92400e)
```

### Type Badges

```
📧 Message         ← Light green (#d1fae5)
                    Dark green (#065f46)

👤 Connection      ← Light blue (#dbeafe)
                    Dark blue (#1e40af)
```

## Interactive Elements

### 1. Time Range Dropdown
```
┌──────────────────────────┐
│ 📅 Time Range:           │
│ ┌──────────────────────┐ │
│ │ Last 7 days          │ │
│ │ Last 14 days         │ │
│ │ Last 30 days     ✓   │ │
│ │ Last 60 days         │ │
│ │ Last 90 days         │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

### 2. Filter Tabs (Active State)
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ All      │  │ Messages │  │Connections│
│ (60)     │  │ (42)     │  │ (18)     │
└──────────┘  └──────────┘  └──────────┘
 ← Blue fill    White fill    White fill
```

### 3. Message Preview (Hover)
```
┌─────────────────────────────┐
│ Hi John, I saw your post    │ ← Message cell
│ about AI trends and...      │
└─────────────────────────────┘
        ↓ Hover
┌─────────────────────────────────────────┐
│ Hi John, I saw your post about AI      │
│ trends and thought you'd be interested │
│ in our new platform. We help companies │
│ implement AI solutions 10x faster.     │
│ Would love to chat!                    │
└─────────────────────────────────────────┘
          Dark tooltip box
```

### 4. Contact LinkedIn Link
```
┌──────────────┐
│ John Smith   │
│ CTO          │
│ Acme Corp    │
│ 🔗 LinkedIn  │ ← Click to open profile
└──────────────┘
```

## Responsive Mobile View

```
┌─────────────────────┐
│ HEADER (collapsed)  │
└─────────────────────┘

┌─────────────────────┐
│ 📧 Sent Messages    │
└─────────────────────┘

┌──────────────────────────┐
│ 📅 Time Range:           │
│ [Last 30 days ▼]         │
└──────────────────────────┘

┌───────────┬───────────┐
│🔄 Refresh │💾 Export  │
└───────────┴───────────┘

┌──────────┬──────────┐
│📧 Msgs   │👤 Conns  │
│  42      │  18      │
└──────────┴──────────┘
┌──────────┬──────────┐
│✅Accept  │💬 Replies│
│  12      │   8      │
└──────────┴──────────┘

┌─────────────────────┐
│[All: 60]            │
│[Messages: 42]       │
│[Connections: 18]    │
│[With Replies: 8]    │
│[Accepted: 12]       │
└─────────────────────┘

┌─────────────────────┐
│ Contact: John Smith │
│ Type: 📧 Message    │
│ Sent: Dec 15, 2 PM  │
│ Status: 💬 Replied  │
├─────────────────────┤
│ Contact: Sarah J.   │
│ Type: 👤 Connection │
│ Sent: Dec 14, 10 AM │
│ Status: ✅ Accepted │
└─────────────────────┘
```

## Empty State

```
┌─────────────────────────────────────────────┐
│                                             │
│                    📭                       │
│                                             │
│    No sent messages found in the           │
│    selected time range                     │
│                                             │
│    Try expanding the time range or         │
│    sending some messages!                  │
│                                             │
└─────────────────────────────────────────────┘
```

## Loading State

```
┌─────────────────────────────────────────────┐
│                                             │
│                   ⏳                        │
│            (spinning circle)                │
│                                             │
│    Loading sent messages and results...    │
│                                             │
└─────────────────────────────────────────────┘
```

## Example Workflows

### Workflow 1: Find Pending Follow-Ups

```
1. User arrives at page
   ↓
2. Sees summary: "8 messages sent, 2 replied"
   ↓
3. Clicks "All" tab (already selected)
   ↓
4. Scans for 🟡 "Pending" badges
   ↓
5. Finds 3 messages > 5 days old
   ↓
6. Clicks LinkedIn icon for each
   ↓
7. Sends follow-up messages
```

### Workflow 2: Analyze Performance

```
1. Select "Last 7 days" from dropdown
   ↓
2. Note numbers:
   - 15 messages sent
   - 5 replies received
   ↓
3. Calculate: 5/15 = 33% reply rate
   ↓
4. Click "Export CSV"
   ↓
5. Open in Excel
   ↓
6. Create pivot table by day/type
   ↓
7. Identify best performing days
```

### Workflow 3: Check Connection Requests

```
1. Click "Connections" filter tab
   ↓
2. See only connection requests
   ↓
3. Click "Accepted" sub-filter
   ↓
4. Review which connection notes worked
   ↓
5. Click "Pending" filter
   ↓
6. Follow up on old requests
```

## Visual Indicators

### Status Dots
```
🟢 Green dot  = Success (replied/accepted)
🟡 Yellow dot = Pending (no response yet)
🔴 Red dot    = Error (not used currently)
```

### Activity Recency
```
"Just now"   = < 1 minute ago
"5m ago"     = 5 minutes
"2h ago"     = 2 hours
"3d ago"     = 3 days
"Dec 15"     = Older than 7 days
```

### Message Preview Length
```
Short message:  "Thanks for connecting!"
Medium message: "Hi John, I saw your recent post about..."
Long message:   "Hi John, I saw your recent post... [hover for more]"
                 ↑ Truncated at 80 characters
```

## Accessibility Features

### Screen Reader Labels
- Summary cards announce: "Messages Sent: 42"
- Status badges announce: "Status: Replied"
- Links announce: "Open LinkedIn profile for John Smith"

### Keyboard Navigation
- Tab through filter tabs
- Enter to select filter
- Tab through table rows
- Click LinkedIn links with Enter

### High Contrast
- All badges have strong color contrast
- Status dots are supplemented with icons
- Text meets WCAG AA standards

## Print View

When user prints the page:

```
SENT MESSAGES & RESULTS
Generated: December 19, 2024

SUMMARY
- Messages Sent: 42
- Connection Requests: 18
- Connections Accepted: 12
- Replies Received: 8

RECENT ACTIVITY
1. John Smith (CTO, Acme Corp) - Message - Dec 15 - Replied
2. Sarah Johnson (VP Sales, TechCo) - Connection - Dec 14 - Accepted
3. Mike Brown (Director, BigCorp) - Message - Dec 13 - Pending
[...]

Page 1 of 3
```

---

## Design Philosophy

### Clean & Scannable
- White space prevents crowding
- Color coding aids quick identification
- Icons supplement text

### Action-Oriented
- Clear CTAs (Refresh, Export)
- LinkedIn links always accessible
- Filters change view instantly

### Data-Dense But Digestible
- Summary cards = quick overview
- Table = detailed information
- Tooltips = additional context

### Professional Appearance
- Gradient header matches brand
- Consistent with other HealthConnect pages
- Enterprise-ready aesthetics

---

**The goal**: Users should be able to answer "Who should I follow up with?" in under 10 seconds. 🎯




