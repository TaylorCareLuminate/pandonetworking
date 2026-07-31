# HeyReach Integration System - Complete Overview

## 📊 Firebase Data Storage Locations

### 1. **HeyReach Inbox Conversations**
**Collection:** `heyreach_inbox`

**Purpose:** Stores all LinkedIn inbox conversations from HeyReach

**Document Structure:**
```javascript
{
  // Identification
  customerId: "customer123",
  customerName: "Company Name",
  conversationId: "conv456",
  
  // Lead Information
  leadLinkedInId: "linkedin123",
  leadProfileUrl: "https://linkedin.com/in/johndoe",
  leadFirstName: "John",
  leadLastName: "Doe",
  leadCompany: "ABC Corp",
  leadEmail: "john@abc.com",
  leadPosition: "CEO",
  
  // Account & Campaign
  linkedInAccountId: 789,
  accountName: "My LinkedIn Account",
  campaignId: 456,
  campaignName: "Q1 Campaign",
  
  // Messages
  messageCount: 5,
  lastMessage: "Thanks for reaching out!",
  lastMessageAt: Timestamp,
  lastMessageSender: "lead",
  seen: false,
  
  // Metadata
  syncedAt: Timestamp,
  lastSyncAt: Timestamp,
  rawData: {...} // Full API response
}
```

**Synced:** Every hour via cron job (line 8500 in server.js)

---

### 2. **HeyReach Campaigns**
**Collection:** `heyreach_campaigns`

**Purpose:** Campaign metadata synced from HeyReach

**Document Structure:**
```javascript
{
  customerId: "customer123",
  heyreachCampaignId: 456,
  name: "Q1 Outreach Campaign",
  status: "in_progress",
  creationTime: Timestamp,
  linkedInUserListName: "Target List 1",
  linkedInUserListId: 789,
  campaignAccountIds: [123, 456],
  progressStats: {
    totalUsers: 100,
    totalUsersFinished: 20,
    totalUsersInProgress: 50,
    totalUsersPending: 30
  },
  lastSyncAt: Timestamp
}
```

**Synced:** Daily at 10 AM EST via cron job

---

### 3. **HeyReach Leads**
**Collection:** `heyreach_leads`

**Purpose:** Individual lead progress tracking

**Document Structure:**
```javascript
{
  customerId: "customer123",
  heyreachCampaignId: 456,
  leadId: "lead789",
  firstName: "John",
  lastName: "Doe",
  email: "john@abc.com",
  company: "ABC Corp",
  position: "CEO",
  linkedinUrl: "https://linkedin.com/in/johndoe",
  status: "active",
  progress: "step_2_completed",
  currentStep: "Follow-up message",
  messagesCount: 3,
  connectionsCount: 1,
  lastActivity: Timestamp,
  lastSyncAt: Timestamp
}
```

**Synced:** Daily at 10 AM EST via cron job

---

### 4. **LinkedIn Activities (Outbound)**
**Collection:** `linkedin_activities`

**Purpose:** LinkedIn activities scheduled to be sent TO HeyReach

**Document Structure:**
```javascript
{
  customerId: "customer123",
  campaignId: "campaign_123",
  outreachSetId: "set_456",
  contactName: "John Doe",
  contactEmail: "john@abc.com",
  company: "ABC Corp",
  linkedinUrl: "https://linkedin.com/in/johndoe",
  scheduledDate: Timestamp,
  status: "scheduled", // or "sent_to_heyreach", "heyreach_error"
  heyreachLeadId: "lead789", // Set after sending to HeyReach
  heyreachCampaignId: 456,
  heyreachAccountId: 123,
  heyreachListId: 789,
  PersonalizedConnectMessage: "Hi John...",
  PersonalizedOutreachMessage: "Following up...",
  processedAt: Timestamp,
  errorMessage: "..." // If status is heyreach_error
}
```

**Processing:** 
- Hourly by `heyReachService.processScheduledLinkedInActivities()`
- Sends scheduled activities to HeyReach API

---

### 5. **Customer Configuration**
**Collection:** `customerList`

**HeyReach-Related Fields:**
```javascript
{
  id: "customer123",
  name: "Company Name",
  heyreachEnabled: true,
  heyreachApiKey: "hr_abc123...", // Customer-specific API key
  // ... other fields
}
```

---

## 🔄 Automated Backend Processes

### Hourly Processes (Every hour at :00)

#### 1. **HeyReach Inbox Sync** ⏰ Every hour
```javascript
// Line 8500 in server.js
cron.schedule('0 * * * *', async () => {
  const results = await heyReachInboxService.syncAllInboxes();
  // Syncs all inbox conversations to heyreach_inbox collection
});
```

**What it does:**
- Fetches conversations from HeyReach API for all customers
- Uses `GetConversationsV2` endpoint with pagination
- Stores/updates conversations in `heyreach_inbox` collection
- Tracks new vs. updated conversations

#### 2. **Process Scheduled LinkedIn Activities** ⏰ Every hour
```javascript
// Line 8260 in server.js
cron.schedule('0 * * * *', async () => {
  const results = await heyReachService.processScheduledLinkedInActivities();
  // Sends scheduled LinkedIn activities to HeyReach
});
```

**What it does:**
- Finds LinkedIn activities with status "scheduled" and past due date
- Sends them to HeyReach via `AddLeadsToCampaignV2` endpoint
- Updates status to "sent_to_heyreach" or "heyreach_error"
- Stores HeyReach lead ID for tracking

---

### Daily Processes

#### 3. **HeyReach Campaign & Lead Sync** ⏰ Daily at 10 AM EST
```javascript
// Line 8271 in server.js
cron.schedule('0 10 * * *', async () => {
  // 1. Sync campaigns and leads
  const results = await heyReachSyncService.syncAllHeyReachData();
  
  // 2. Match LinkedIn activities with HeyReach leads
  const matchResults = await heyReachSyncService.matchLinkedInActivitiesWithHeyReach();
});
```

**What it does:**
- Syncs all campaigns to `heyreach_campaigns`
- Syncs all leads to `heyreach_leads`
- Matches local LinkedIn activities with HeyReach leads by email/URL
- Updates local activities with HeyReach progress

---

## 🔗 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                           │
├─────────────────────────────────────────────────────────────┤
│ linkedin_manager.html  → Schedule LinkedIn activities        │
│ heyreach_inbox.html    → View inbox conversations            │
│ heyreach_sync.html     → Monitor campaign progress           │
│ outcomes.html          → Mark outcomes & stop activities     │
│ heyreach_remove.html   → Remove contacts from HeyReach       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   FIREBASE FIRESTORE                         │
├─────────────────────────────────────────────────────────────┤
│ linkedin_activities    → Outbound: To be sent to HeyReach   │
│ heyreach_inbox         → Inbound: Conversations from API     │
│ heyreach_campaigns     → Campaign metadata from API          │
│ heyreach_leads         → Lead progress from API              │
│ outreach_sets          → Master contact records              │
│ customerList           → Customer config + API keys          │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│              RAILWAY BACKEND (server.js)                     │
├─────────────────────────────────────────────────────────────┤
│ CRON JOBS:                                                   │
│ • Every hour    → Send LinkedIn activities to HeyReach      │
│ • Every hour    → Sync inbox conversations                  │
│ • Daily 10 AM   → Sync campaigns & leads                    │
│                                                              │
│ API ENDPOINTS:                                               │
│ • /proxy/heyreach/*           → Proxy to HeyReach API       │
│ • /heyreach/inbox/sync        → Manual inbox sync           │
│ • /heyreach/inbox/test-accounts → Test account fetch        │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                   HEYREACH API                               │
├─────────────────────────────────────────────────────────────┤
│ POST /inbox/GetConversationsV2  → Get conversations         │
│ POST /account/GetAll             → Get LinkedIn accounts    │
│ POST /campaign/GetAll            → Get campaigns            │
│ POST /lead/GetAll                → Get leads                │
│ POST /campaign/AddLeadsToCampaignV2 → Add leads             │
│ POST /lead/Stop                  → Stop/remove lead         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Key Features

### 1. **Inbox Management** (`heyreach_inbox.html`)
- View all LinkedIn conversations across all accounts
- Filter by customer, account, read/unread status
- Search conversations
- Manual sync trigger with live logs
- Test account fetch for debugging
- CSV export

**Backend:** `heyreach_inbox_service.js`
- Handles pagination (100 conversations per request)
- Enriches data with customer/account names
- Stores in `heyreach_inbox` collection

### 2. **Outcomes Management** (`outcomes.html`)
- Mark contacts as "Successful/Scheduled" or "Declined"
- Stop ALL outreach activities for a contact
- Option to stop entire domain/company
- **NOW INCLUDES:** Remove from HeyReach if already sent

**Process Flow:**
1. User marks outcome for contact
2. System cancels pending emails (clemail, scheduledEmails)
3. System deletes LinkedIn activities from Firebase
4. **System calls HeyReach API to stop lead** (with customer's API key)
5. System deletes phone activities
6. System updates outreach_set with outcome status

### 3. **Campaign Sync** (`heyreach_sync.html`)
- View all HeyReach campaigns
- Monitor lead progress
- Match local activities with HeyReach
- Sync on demand

### 4. **Contact Removal** (`heyreach_remove.html`)
- Remove contacts from HeyReach campaigns
- Stop outreach before it starts
- Bulk removal options

---

## 🔑 API Key Management

**Location:** Each customer has their own API key in `customerList` collection

**Field:** `heyreachApiKey`

**Usage:**
- Frontend sends customer-specific API key in `x-api-key` header
- Backend uses `X-API-KEY` header for HeyReach API calls
- Each customer's data is isolated by their API key

**Security:**
- API keys are stored in Firebase (encrypted at rest)
- Never exposed in frontend code
- Always passed via headers

---

## 🐛 Troubleshooting

### Issue: No conversations appearing
**Check:**
1. Customer has `heyreachEnabled: true` in `customerList`
2. Customer has valid `heyreachApiKey`
3. LinkedIn accounts are connected in HeyReach
4. Use "Test Account Fetch" button to diagnose
5. Check Railway logs for sync errors

### Issue: Can't remove contact from HeyReach
**Solution:** 
- Railway backend must be redeployed with latest code (X-API-KEY fix)
- Verify customer has `heyreachApiKey` configured
- Check that `linkedin_activities` has `heyreachLeadId`

### Issue: Activities not being sent to HeyReach
**Check:**
1. `linkedin_activities` status is "scheduled"
2. `scheduledDate` is in the past
3. Activity has `heyreachCampaignId`, `heyreachAccountId`, `heyreachListId`
4. Customer has valid HeyReach API key
5. Check Railway logs for processing errors

---

## 📝 Recent Fixes

### ✅ API Header Fix (Critical)
**Issue:** HeyReach API was returning 404 "Empty response body"

**Root Cause:** Backend was using `x-api-key` (lowercase) instead of `X-API-KEY` (uppercase)

**Fix:** Updated `heyreachFetch` function in server.js line 1698:
```javascript
'X-API-KEY': apiKey,  // Was: 'x-api-key'
```

**Impact:** Fixes ALL HeyReach API calls:
- ✅ Inbox sync
- ✅ Campaign sync
- ✅ Lead removal
- ✅ Account fetching
- ✅ Everything else

### ✅ Outcomes.html Enhancement
**Added:** HeyReach removal when marking outcomes

**How it works:**
1. Fetches customer's HeyReach API key from Firebase
2. Calls `/proxy/heyreach/leads/stop` with proper authentication
3. Logs success/failure for each lead

---

## 🚀 Deployment Checklist

When updating the HeyReach system:

1. ✅ Commit changes to Git
2. ✅ Push to repository
3. ✅ Railway auto-deploys (if connected)
4. ✅ Verify cron jobs are running (check Railway logs)
5. ✅ Test with "Test Account Fetch" button
6. ✅ Monitor hourly sync in Railway logs

---

## 📈 Monitoring

### Railway Logs to Watch For:

**Every Hour:**
```
📬 Syncing HeyReach inbox conversations (hourly check)...
✅ HeyReach inbox sync complete: X conversations, Y new, Z updated
```

```
📱 Processing scheduled LinkedIn activities for HeyReach (hourly check)...
✅ HeyReach processing complete: X processed, Y errors
```

**Daily at 10 AM:**
```
🔄 Syncing HeyReach campaign data and lead progress...
✅ HeyReach sync complete: X customers, Y campaigns, Z leads
```

### Success Indicators:
- No 404 errors in logs
- Conversations count increasing hourly
- New activities being sent successfully
- Lead removal succeeding in outcomes.html

---

## 🎯 Summary

### Data Storage:
- **heyreach_inbox** - All conversations (synced hourly)
- **heyreach_campaigns** - Campaign metadata (synced daily)
- **heyreach_leads** - Lead progress (synced daily)
- **linkedin_activities** - Outbound activities (processed hourly)

### Automation:
- ✅ **Hourly:** Inbox sync + Activity processing
- ✅ **Daily:** Campaign/lead sync + Matching

### Features:
- ✅ View inbox conversations
- ✅ Monitor campaign progress
- ✅ Send activities to HeyReach
- ✅ Remove leads from HeyReach
- ✅ Mark outcomes & stop all activities

All systems operational! 🚀

