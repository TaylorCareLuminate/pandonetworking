# HeyReach Inbox System

## Overview

The HeyReach Inbox system provides a comprehensive solution for monitoring and managing LinkedIn conversations across all HeyReach accounts. It consists of a frontend interface for viewing conversations and a backend system that automatically syncs inbox messages every hour.

## Components

### 1. Frontend: `heyreach_inbox.html`

A modern, responsive web interface that displays all HeyReach inbox conversations.

**Features:**
- **Real-time Conversation Display**: Shows all conversations with lead information, last message, and status
- **Conversation Threading**: Click any conversation to view full message history in a modal with:
  - Complete message thread showing back-and-forth communication
  - Visual distinction between lead messages and account messages
  - Detailed lead information (company, position, email, LinkedIn profile)
  - Timestamps for each message
  - Message sender identification with avatars
  - **Copy to Clipboard**: Export formatted conversation summary with rich text colors:
    - **Rich Text Mode** (Word, Google Docs, Outlook, Slack):
      - LEAD messages in purple/blue with light purple background
      - YOUR messages in green with light green background
      - Colored avatars with initials
      - Beautiful formatted layout with colored sections
    - **Plain Text Mode** (Notepad, text editors):
      - LEAD messages use `│` box borders
      - YOUR messages use `║` box borders
      - Automatic fallback for plain text environments
    - Includes contact info, campaign details, and timestamps
    - Works everywhere - smart detection of rich text support
- **Manual Sync Trigger**: Button to manually trigger inbox sync and view Railway backend logs
- **Advanced Filtering**: Filter by customer, account, status (read/unread), and search
- **Statistics Dashboard**: Shows total conversations, unread count, accounts, and campaigns
- **Test Mode Badge**: Indicates the page is in test/development mode
- **Pagination**: Handles large numbers of conversations efficiently
- **CSV Export**: Export conversations data for analysis
- **Real-time Updates**: Uses Firebase listeners to automatically refresh when new data arrives

**Access URL:**
```
https://yourdomain.com/crm/heyreach_inbox.html
```

### 2. Backend Service: `heyreach_inbox_service.js`

A Node.js service that handles all inbox synchronization logic.

**Key Methods:**
- `syncAllInboxes()`: Syncs inbox for all customers with HeyReach integration
- `syncCustomerInbox(customer)`: Syncs inbox for a specific customer
- `getAllConversations()`: Fetches all conversations with pagination support
- `getConversationsPage()`: Gets a single page of conversations from HeyReach API
- `storeConversation()`: Stores/updates conversations in Firestore
- `getInboxStats()`: Calculates inbox statistics
- `getConversations(filters)`: Retrieves conversations from Firestore with filters

### 3. Backend API Endpoints

#### POST `/heyreach/inbox/sync`
Manually triggers inbox sync across all HeyReach accounts.

**Response:**
```json
{
  "success": true,
  "results": {
    "customers": 5,
    "totalConversations": 250,
    "newConversations": 15,
    "updatedConversations": 235,
    "errors": [],
    "logs": ["..."]
  }
}
```

#### GET `/heyreach/inbox/conversations`
Retrieves conversations from Firestore with optional filters.

**Query Parameters:**
- `customerId`: Filter by customer ID
- `accountId`: Filter by LinkedIn account ID
- `campaignId`: Filter by campaign ID
- `seen`: Filter by read status (true/false)
- `limit`: Maximum number of results (default: 1000)

**Response:**
```json
{
  "success": true,
  "conversations": [...],
  "count": 250
}
```

#### GET `/heyreach/inbox/stats`
Returns inbox statistics including unread count, customer breakdown, etc.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalConversations": 250,
    "unreadConversations": 15,
    "customerStats": {...},
    "accountStats": {...},
    "lastSyncTime": "2024-01-01T12:00:00.000Z"
  }
}
```

### 4. Automated Sync Job

A cron job runs every hour (at the top of the hour) to automatically sync all inbox conversations:

```javascript
cron.schedule('0 * * * *', async () => {
  console.log('📬 Syncing HeyReach inbox conversations (hourly check)...');
  const results = await heyReachInboxService.syncAllInboxes();
  console.log(`✅ HeyReach inbox sync complete: ${results.totalConversations} conversations`);
});
```

## Data Structure

### Firestore Collection: `heyreach_inbox`

Each document represents a conversation and includes:

**Note on Message Threading**: The system attempts to extract full message history from the `rawData` field stored in each conversation. It checks multiple possible structures:
- `rawData.messages[]` - Primary message array
- `rawData.conversationMessages[]` - Alternative message array
- Falls back to `lastMessage` if no message array is found

The frontend displays all messages in chronological order with proper sender identification.

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
  
  // Account Information
  linkedInAccountId: 789,
  accountName: "My LinkedIn Account",
  
  // Campaign Information
  campaignId: 456,
  campaignName: "Outreach Campaign Q1",
  
  // Message Information
  messageCount: 5,
  lastMessage: "Thanks for reaching out!",
  lastMessageAt: Timestamp,
  lastMessageSender: "lead",
  
  // Status
  seen: false,
  
  // Metadata
  syncedAt: Timestamp,
  lastSyncAt: Timestamp,
  rawData: {...} // Full conversation data from API
}
```

## HeyReach API Integration

The system uses the HeyReach API's `GetConversationsV2` endpoint:

**Endpoint:** `POST https://api.heyreach.io/api/public/inbox/GetConversationsV2`

**Request Body:**
```json
{
  "filters": {
    "linkedInAccountIds": [123, 456],
    "campaignIds": [],
    "searchString": "",
    "leadLinkedInId": "",
    "leadProfileUrl": "",
    "seen": null
  },
  "offset": 0,
  "limit": 100
}
```

**Pagination:**
The service automatically handles pagination by making multiple requests with increasing offsets until all conversations are fetched (max 10,000 to prevent infinite loops).

## Setup and Configuration

### Prerequisites

1. **HeyReach API Key**: Each customer must have:
   - `heyreachApiKey` field in their `customerList` document
   - `heyreachEnabled: true` flag

2. **Firebase Setup**: The system uses Firestore for data storage

3. **Railway Backend**: Deployed at `https://railwayclemail-production.up.railway.app`

### Environment Variables

No additional environment variables are needed beyond existing HeyReach configuration.

### Firestore Indexes

No special indexes are required. The system uses simple queries that work with automatic indexes.

## Usage Guide

### For End Users

1. **Access the Inbox**: Navigate to `/crm/heyreach_inbox.html`

2. **View Conversations**: 
   - All conversations are displayed with lead info, last message, and timestamp
   - Unread conversations are highlighted with a red border
   - Use pagination to navigate through large sets of conversations
   - Click on any conversation card to view the full message thread

3. **View Conversation Details**:
   - Click any conversation to open a detailed modal view
   - See complete message history with all back-and-forth messages
   - Lead messages appear on the left (blue/purple), your messages on the right (green)
   - View full lead information including LinkedIn profile link
   - **Copy Conversation**: Click the "Copy" button to export formatted summary to clipboard
     - **Paste into rich text editors** (Word, Google Docs, Outlook, Slack, Teams):
       - LEAD messages appear in purple/blue gradient with light purple background
       - YOUR messages appear in green with light green background
       - Colored circular avatars with initials
       - Professional formatted layout with colored info boxes
     - **Paste into plain text** (Notepad, terminal, code editors):
       - LEAD messages use `│` box borders with 💬 icon
       - YOUR messages use `║` box borders with 🎯 icon
       - Automatic fallback maintains readability
     - Includes full contact info, campaign details, and all messages with timestamps
   - Close modal by clicking the X, pressing Escape, or clicking outside the modal

4. **Filter Conversations**:
   - Select a customer to view only their conversations
   - Filter by account to see conversations from specific LinkedIn accounts
   - Use status filter to show only unread or read conversations
   - Search by name, company, or message content

5. **Manual Sync**:
   - Click "Sync Inbox Now" to manually trigger a sync
   - View Railway backend logs in the logs section
   - Monitor sync progress and results

6. **Export Data**:
   - Click "Export CSV" to download conversations for analysis

### For Developers

#### Testing the Backend Directly

**Manual Sync:**
```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/inbox/sync \
  -H "Content-Type: application/json"
```

**Get Conversations:**
```bash
curl "https://railwayclemail-production.up.railway.app/heyreach/inbox/conversations?customerId=abc123&limit=50"
```

**Get Stats:**
```bash
curl "https://railwayclemail-production.up.railway.app/heyreach/inbox/stats"
```

#### Monitoring Cron Jobs

Check Railway logs for hourly sync messages:
```
📬 Syncing HeyReach inbox conversations (hourly check)...
✅ HeyReach inbox sync complete: 250 conversations, 15 new, 235 updated
```

#### Debugging

1. **Frontend Logs**: Open browser console to see detailed logs
2. **Backend Logs**: Check Railway dashboard for service logs
3. **Firestore**: Inspect `heyreach_inbox` collection directly

## Error Handling

The system includes comprehensive error handling:

1. **Customer-Level Errors**: If one customer fails, others continue processing
2. **API Errors**: Logged with detailed error messages
3. **Rate Limiting**: Pagination prevents overwhelming the API
4. **Validation**: Checks for required fields and valid data

## Performance Considerations

1. **Pagination**: Fetches 100 conversations per request
2. **Batch Processing**: Processes all customers in sequence
3. **Real-time Updates**: Frontend uses Firebase listeners for instant updates
4. **Caching**: Stores conversations in Firestore to reduce API calls

## Future Enhancements

Potential improvements for the system:

1. **Reply Functionality**: Add ability to reply to messages directly from the interface
2. **Mark as Read/Unread**: Update seen status from the frontend
3. **Notifications**: Alert users of new unread messages
4. **Advanced Search**: Full-text search across all message content
5. **Conversation Assignment**: Assign conversations to team members
6. **Notes and Tags**: Add internal notes and tags to conversations
7. **Performance Metrics**: Track response times and engagement rates
8. **Message Attachments**: Display and download attachments within conversations

## Troubleshooting

### No Conversations Appearing

1. Check if customers have `heyreachEnabled: true` and valid `heyreachApiKey`
2. Verify LinkedIn accounts are properly configured in HeyReach
3. Check Railway logs for sync errors
4. Manually trigger sync from the frontend

### Sync Failing

1. Verify HeyReach API keys are valid
2. Check Railway service is running
3. Review error messages in logs
4. Test API connectivity directly

### Slow Performance

1. Reduce limit on conversations query
2. Add more specific filters
3. Check Firebase quotas and limits
4. Optimize indexes if needed

### Messages Not Showing in Thread

If you see "No messages found" when opening a conversation:

1. **Check rawData structure**: Open browser console and inspect the `rawData` field
2. **API format changed**: HeyReach may have updated their API response structure
3. **Update extraction logic**: Modify the `extractMessages()` function in `heyreach_inbox.html` to match new structure
4. **Verify sync**: Ensure the sync process is storing the full conversation data from HeyReach API

## Support

For issues or questions:
1. Check Railway logs for backend errors
2. Review browser console for frontend errors
3. Inspect Firestore data for inconsistencies
4. Contact development team with error details

## Changelog

### Version 1.2.0 (Rich Text Copy to Clipboard)
- **NEW**: Copy to Clipboard button in conversation modal with dual format support
- **NEW**: Rich HTML format for Word, Google Docs, Outlook, Slack, Teams, email
  - LEAD messages: Purple/blue gradient with light purple background
  - YOUR messages: Green with light green background
  - Colored circular avatars with initials
  - Professional formatted layout with colored info boxes
- **NEW**: Plain text format for Notepad, terminal, code editors
  - LEAD messages use `│` box borders with 💬 icon
  - YOUR messages use `║` box borders with 🎯 icon
- **NEW**: Automatic format detection - pastes rich text where supported, plain text elsewhere
- **NEW**: Exported summary includes contact info, campaign details, timestamps, and full message thread
- **IMPROVED**: Easy-to-scan format with clear visual distinction between speakers

### Version 1.1.0 (Conversation Threading Update)
- **NEW**: Click any conversation to view full message thread in modal
- **NEW**: Visual message threading showing back-and-forth communication
- **NEW**: Detailed lead information display in conversation modal
- **NEW**: Message sender identification with avatars
- **NEW**: Formatted timestamps for each message
- **IMPROVED**: Hover effects on conversation cards for better UX
- **IMPROVED**: Modal closes with Escape key or click outside

### Version 1.0.0 (Initial Release)
- Frontend interface for viewing conversations
- Backend service for inbox sync
- Automated hourly sync via cron job
- Filtering and search capabilities
- CSV export functionality
- Real-time updates via Firebase
- Manual sync trigger with log display

