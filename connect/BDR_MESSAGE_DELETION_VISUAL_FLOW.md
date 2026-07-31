# BDR Message Deletion - Visual Flow Diagram

## 🎯 Complete Flow

```
┌────────────────────────────────────────────────────────────┐
│                  BDR Review Settings Page                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ BDR: Sarah Johnson                                   │   │
│  │ 📧 sarah.johnson@company.com                        │   │
│  │                                                       │   │
│  │ 📊 Unreviewed Messages: [25]                        │   │
│  │                                    [Delete Messages] │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼ CLICK                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔽 Delete Options Panel (Expanded)                  │   │
│  │                                                       │   │
│  │ ┌─────────────────────────────────────────────┐     │   │
│  │ │ Message Type:                                │     │   │
│  │ │ ☑ 🌐 Messages from Internet Research         │     │   │
│  │ │ ☑ 👤➕ Connection Request Messages            │     │   │
│  │ │ ☑ 💬 Messages to Current Connections         │     │   │
│  │ └─────────────────────────────────────────────┘     │   │
│  │                                                       │   │
│  │ ┌─────────────────────────────────────────────┐     │   │
│  │ │ Message Age:                                 │     │   │
│  │ │ ☑ 📅❌ Generated more than 2 weeks ago       │     │   │
│  │ │ ☑ 📅✅ Generated in past 2 weeks              │     │   │
│  │ └─────────────────────────────────────────────┘     │   │
│  │                                                       │   │
│  │ [Delete Selected Messages]  [Cancel]                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼ CLICK DELETE                     │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│               Filtering Process (Backend)                   │
│                                                              │
│  Step 1: Load all unreviewed messages for BDR              │
│  ├─ Primary Email: sarah.johnson@company.com               │
│  └─ LinkedIn Email: sjohnson@linkedin.com                  │
│                                                              │
│  Step 2: Apply Safety Filters (Automatic)                  │
│  ├─ ❌ Skip if deleted = true                              │
│  ├─ ❌ Skip if reviewed = true                             │
│  ├─ ❌ Skip if reviewStatus = 'approved'                   │
│  └─ ❌ Skip if reviewStatus = 'pending_customer_review'    │
│                                                              │
│  Step 3: Apply Type Filters (User Selected)                │
│  ┌────────────────────────────────────────────┐            │
│  │ IF Internet Research checked:               │            │
│  │   Include if source = 'internet'/'research' │            │
│  │   OR messageType contains 'internet'        │            │
│  └────────────────────────────────────────────┘            │
│  ┌────────────────────────────────────────────┐            │
│  │ IF Connection Requests checked:             │            │
│  │   Include if messageType = 'connection'     │            │
│  │   OR isConnectionRequest = true             │            │
│  └────────────────────────────────────────────┘            │
│  ┌────────────────────────────────────────────┐            │
│  │ IF Current Connections checked:             │            │
│  │   Include if messageType = 'current_conn'   │            │
│  │   OR isCurrentConnection = true             │            │
│  └────────────────────────────────────────────┘            │
│                                                              │
│  Step 4: Apply Age Filters (User Selected)                 │
│  ┌────────────────────────────────────────────┐            │
│  │ Calculate: Two weeks ago = Now - 14 days   │            │
│  │                                              │            │
│  │ IF "Older than 2 weeks" checked:            │            │
│  │   Include if createdAt < twoWeeksAgo        │            │
│  │                                              │            │
│  │ IF "Past 2 weeks" checked:                  │            │
│  │   Include if createdAt >= twoWeeksAgo       │            │
│  └────────────────────────────────────────────┘            │
│                                                              │
│  Step 5: Count Matching Messages                           │
│  Result: [12] messages match filters                       │
│                                                              │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                   Confirmation Dialog                       │
│                                                              │
│  ⚠️ Are you sure you want to PERMANENTLY DELETE             │
│  12 messages for Sarah Johnson?                             │
│                                                              │
│  Message Types: Internet Research, Connection Requests     │
│  Age: older than 2 weeks                                   │
│                                                              │
│  ⚠️ This will REMOVE them from the database entirely.       │
│  Use this when you plan to re-run the messages.            │
│                                                              │
│              [OK]                [Cancel]                   │
└────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
              [Cancel]         [OK / Confirm]
                    │               │
                    ▼               ▼
            ┌─────────────┐  ┌─────────────────────────────┐
            │ No action   │  │ Permanent Deletion          │
            │ Panel stays │  │ ├─ Delete from database     │
            │ open        │  │ ├─ Update message counts    │
            └─────────────┘  │ ├─ Refresh display          │
                             │ └─ Close delete panel       │
                             │                              │
                             │ ✅ Success Message:          │
                             │ "Successfully PERMANENTLY    │
                             │  DELETED 12 messages for     │
                             │  Sarah Johnson!"             │
                             └─────────────────────────────┘
```

## 📊 Message Classification Logic

```
FOR EACH message in connect_queue:
    
    ┌─ STEP 1: Email Match ─────────────────────────────┐
    │ Does account_email match BDR?                      │
    │ ├─ Check primary email                             │
    │ └─ Check linked LinkedIn email                     │
    │                                                     │
    │ If NO match → SKIP this message                    │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ YES
    ┌─ STEP 2: Safety Check ────────────────────────────┐
    │ Is message protected?                              │
    │ ├─ deleted = true? → SKIP                         │
    │ ├─ reviewed = true? → SKIP                        │
    │ ├─ reviewStatus = 'approved'? → SKIP              │
    │ └─ reviewStatus = 'pending_customer_review'? SKIP │
    │                                                     │
    │ If ANY protection → SKIP this message             │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ NOT PROTECTED
    ┌─ STEP 3: Type Classification ────────────────────┐
    │ What TYPE is this message?                        │
    │                                                     │
    │ Check source field:                                │
    │ ├─ 'internet', 'research', 'web' → Internet      │
    │ ├─ 'connection' → Connection Request             │
    │ └─ 'current_connection' → Current Connection     │
    │                                                     │
    │ Check messageType field:                           │
    │ ├─ 'connection', 'connection_request' → Conn Req │
    │ ├─ 'current_connection', 'existing...' → Current │
    │ └─ Contains 'internet'/'research' → Internet     │
    │                                                     │
    │ Check boolean flags:                               │
    │ ├─ isConnectionRequest = true → Connection       │
    │ └─ isCurrentConnection = true → Current          │
    │                                                     │
    │ No type info? → Included in ALL type filters     │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ TYPE DETERMINED
    ┌─ STEP 4: Type Filter Match ──────────────────────┐
    │ Does message type match selected filters?         │
    │                                                     │
    │ IF message is Internet Research:                   │
    │   └─ "Internet Research" checkbox checked? → ✓    │
    │                                                     │
    │ IF message is Connection Request:                  │
    │   └─ "Connection Requests" checkbox checked? → ✓  │
    │                                                     │
    │ IF message is Current Connection:                  │
    │   └─ "Current Connections" checkbox checked? → ✓  │
    │                                                     │
    │ If NO match → SKIP this message                   │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ TYPE MATCHES
    ┌─ STEP 5: Age Classification ─────────────────────┐
    │ How OLD is this message?                           │
    │                                                     │
    │ Find date field:                                   │
    │ ├─ createdAt                                       │
    │ ├─ created_at                                      │
    │ └─ timestamp                                       │
    │                                                     │
    │ Parse date:                                        │
    │ ├─ Firestore Timestamp → .toDate()                │
    │ ├─ Unix timestamp → new Date(seconds * 1000)      │
    │ ├─ ISO string → new Date(string)                  │
    │ └─ Already Date object → use as-is                │
    │                                                     │
    │ Compare to cutoff:                                 │
    │ ├─ messageDate < (now - 14 days) → OLD            │
    │ └─ messageDate >= (now - 14 days) → RECENT        │
    │                                                     │
    │ No date found? → Included if ANY age filter set   │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ AGE DETERMINED
    ┌─ STEP 6: Age Filter Match ───────────────────────┐
    │ Does message age match selected filters?           │
    │                                                     │
    │ IF message is OLD (>2 weeks):                      │
    │   └─ "Older than 2 weeks" checkbox checked? → ✓   │
    │                                                     │
    │ IF message is RECENT (≤2 weeks):                   │
    │   └─ "Past 2 weeks" checkbox checked? → ✓         │
    │                                                     │
    │ If NO match → SKIP this message                   │
    └────────────────────────────────────────────────────┘
                        │
                        ▼ AGE MATCHES
    ┌─ STEP 7: Mark for Deletion ──────────────────────┐
    │ ✓ Message MATCHES all filters                     │
    │ └─ Add to deletion list                            │
    └────────────────────────────────────────────────────┘
```

## 🔄 Complete Example Walkthrough

### Scenario: BDR with 25 messages

```
BDR: Sarah Johnson
Primary Email: sarah.johnson@company.com
LinkedIn Email: sjohnson@linkedin.com
Total Unreviewed: 25 messages

User Selects:
  ✅ Internet Research
  ❌ Connection Requests  
  ❌ Current Connections
  ✅ Older than 2 weeks
  ❌ Past 2 weeks

───────────────────────────────────────────────────────────

System Evaluates Each Message:

Message #1:
  source: "internet"
  createdAt: "2025-12-15" (24 days ago)
  deleted: false
  reviewed: false
  ├─ Email match? ✓ (sarah.johnson@company.com)
  ├─ Protected? ✗ (not protected)
  ├─ Type match? ✓ (Internet = checked)
  └─ Age match? ✓ (>2 weeks = checked)
  → MARK FOR DELETION ✓

Message #2:
  source: "connection"
  createdAt: "2025-12-10" (29 days ago)
  ├─ Email match? ✓
  ├─ Protected? ✗
  ├─ Type match? ✗ (Connection = NOT checked)
  └─ Age match? (not evaluated)
  → SKIP (type doesn't match) ✗

Message #3:
  source: "internet"
  createdAt: "2026-01-05" (3 days ago)
  ├─ Email match? ✓
  ├─ Protected? ✗
  ├─ Type match? ✓ (Internet = checked)
  └─ Age match? ✗ (recent, but NOT checked)
  → SKIP (age doesn't match) ✗

Message #4:
  source: "internet"
  createdAt: "2025-12-20" (19 days ago)
  deleted: false
  reviewed: false
  ├─ Email match? ✓
  ├─ Protected? ✗
  ├─ Type match? ✓ (Internet = checked)
  └─ Age match? ✓ (>2 weeks = checked)
  → MARK FOR DELETION ✓

... (continues for all 25 messages)

───────────────────────────────────────────────────────────

Final Result:
  Total messages: 25
  Matched filters: 8
  Will delete: 8 messages

Confirmation shows:
  "Delete 8 messages for Sarah Johnson?"
  "Message Types: Internet Research"
  "Age: older than 2 weeks"
```

## 🎨 UI State Transitions

```
STATE 1: Initial (Delete Panel Hidden)
┌──────────────────────────────────┐
│ 📊 25 unreviewed messages         │
│          [Delete Messages] ←─────── Clickable
└──────────────────────────────────┘

                │ CLICK
                ▼

STATE 2: Expanded (Filters Visible)
┌──────────────────────────────────┐
│ 📊 25 unreviewed messages         │
│          [Delete Messages]        │
│ ┌─────────────────────────────┐  │
│ │ 🔽 Filters Expanded          │  │
│ │ [Checkboxes...]              │  │
│ │ [Delete Selected] [Cancel] ←──── Both clickable
│ └─────────────────────────────┘  │
└──────────────────────────────────┘

        │ CLICK DELETE          │ CLICK CANCEL
        ▼                       ▼

STATE 3: Confirmation       STATE 1: Closed
┌──────────────────┐       (Back to initial)
│ ⚠️ Confirm?       │
│ [OK] [Cancel]    │
└──────────────────┘
        │
        ▼ OK

STATE 4: Deleting
┌──────────────────────────────────┐
│ 🔄 Deleting messages...           │
└──────────────────────────────────┘

        │
        ▼

STATE 5: Success
┌──────────────────────────────────┐
│ ✅ Successfully deleted 8 messages│
│ 📊 17 unreviewed messages         │  ← Count updated
│          [Delete Messages]        │
└──────────────────────────────────┘
        (Panel closed automatically)
```

## 📱 Responsive Layout

### Desktop View (>768px)
```
┌───────────────────────────────────────────────────────┐
│ Message Type:  [all filters side by side]            │
│ ☑ Internet  ☑ Connection  ☑ Current Connections      │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Message Age:  [filters side by side]                  │
│ ☑ Older than 2 weeks  ☑ Past 2 weeks                 │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ [Delete Selected Messages]     [Cancel]               │
└───────────────────────────────────────────────────────┘
```

### Mobile View (<768px)
```
┌────────────────────────────────┐
│ Message Type:                   │
│ ☑ Internet Research             │
│ ☑ Connection Requests           │
│ ☑ Current Connections           │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Message Age:                    │
│ ☑ Older than 2 weeks            │
│ ☑ Past 2 weeks                  │
└────────────────────────────────┘

┌────────────────────────────────┐
│ [Delete Selected Messages]     │
│ [Cancel]                        │
└────────────────────────────────┘
```

---

**Visual Guide Version:** 1.0  
**Last Updated:** January 2026  
**Page:** `connect/bdr_review_settings.html`


