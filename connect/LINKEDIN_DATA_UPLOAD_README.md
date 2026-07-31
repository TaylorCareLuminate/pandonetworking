# LinkedIn Data Upload & Management System

## Overview
This system allows users to upload their LinkedIn message history (exported from LinkedIn) and merge it with existing HeyReach inbox data. The uploaded data is tagged as `user_uploaded` so it can be easily identified and deleted if needed.

## File Location
- **Frontend Page**: `HealthLuminateSite/connect/manage_my_linkedin_data.html`
- **Data Storage**: Firebase Firestore `heyreach_inbox` collection

## How to Use

### Step 1: Download Your LinkedIn Messages

1. **Sign in to LinkedIn** on a desktop browser
2. Click your **profile picture** → **Settings & Privacy**
3. Select **Data privacy** from the left menu
4. Look for **"Get a copy of your data"**
5. Choose **"Messages"** (or select specific data types)
6. Click **"Request archive"** (may need to re-enter password)
7. **Wait** for email with download link (can take up to 48 hours)
8. **Download the ZIP file** and extract it
9. Locate the **`messages.csv`** file in the extracted folder

### Step 2: Upload to HealthLuminate

1. Navigate to `https://healthluminate.com/connect/manage_my_linkedin_data.html`
2. Click the upload area or drag and drop your `messages.csv` file
3. Wait for processing (automatic):
   - File is parsed
   - Messages are grouped by conversation
   - Data is merged with existing inbox
4. View statistics and processing logs
5. Uploaded data appears in "My Uploaded Data" section

### Step 3: View Merged Messages

1. Go to the HeyReach Inbox (`heyreach_inbox.html`)
2. Your uploaded messages are now integrated with HeyReach messages
3. Look for conversations with older dates (beyond 3 months)

### Step 4: Delete Uploaded Data (Optional)

1. In `manage_my_linkedin_data.html`, scroll to "My Uploaded Data"
2. Click **Delete** next to any upload batch
3. Confirm deletion
4. Data is removed from the inbox

## Technical Details

### CSV Format
The LinkedIn export `messages.csv` has the following columns:
- `CONVERSATION ID` - Unique identifier for conversation thread
- `CONVERSATION TITLE` - (often empty)
- `FROM` - Sender name
- `SENDER PROFILE URL` - LinkedIn profile URL of sender
- `TO` - Recipient name(s)
- `RECIPIENT PROFILE URLS` - LinkedIn profile URL(s) of recipient(s)
- `DATE` - Timestamp in "YYYY-MM-DD HH:MM:SS UTC" format
- `SUBJECT` - (often empty)
- `CONTENT` - Message text
- `FOLDER` - (e.g., INBOX)
- `ATTACHMENTS` - (usually empty)

### Data Storage Structure
Uploaded conversations are stored in Firestore with:

```javascript
{
  // Upload metadata
  source: 'user_uploaded',
  uploadedBy: 'user_uid',
  uploadedAt: Timestamp,
  
  // Conversation info
  conversationId: 'unique_conversation_id',
  leadProfileUrl: 'https://www.linkedin.com/in/...',
  
  // Message stats
  messageCount: 15,
  lastMessage: "...",
  lastMessageAt: Timestamp,
  lastMessageSender: 'account' | 'lead',
  
  // Raw messages
  rawData: {
    messages: [
      {
        createdAt: Timestamp,
        body: "Message content",
        sender: 'ME' | 'CORRESPONDENT',
        from: "Name",
        to: "Name"
      },
      // ... more messages
    ]
  },
  
  // Sync metadata
  syncedAt: Timestamp,
  lastSyncAt: Timestamp
}
```

### Document ID Format
- User uploaded data: `user_uploaded_{userId}_{conversationId}`
- HeyReach synced data: `{customerId}_{linkedInAccountId}_{conversationId}`

### Querying User Uploaded Data
To find all data uploaded by a user:

```javascript
const q = query(
  collection(db, 'heyreach_inbox'),
  where('source', '==', 'user_uploaded'),
  where('uploadedBy', '==', currentUser.uid)
);
```

### Merging Strategy
1. **Group by Conversation ID**: All messages with the same `CONVERSATION ID` are grouped together
2. **Identify Participants**: Extract profile URLs from sender and recipient fields
3. **Sort Messages**: Messages are sorted chronologically within each conversation
4. **Store in Firestore**: Each conversation is stored as a separate document with all messages in `rawData.messages[]`
5. **Non-Destructive**: Uses `{ merge: true }` to avoid overwriting existing data

### Integration with HeyReach Inbox
The uploaded data seamlessly integrates with the existing `heyreach_inbox.html` page:

1. **Same Collection**: Stored in `heyreach_inbox` collection
2. **Same Structure**: Follows the same data structure as HeyReach synced data
3. **Distinguishable**: Tagged with `source: 'user_uploaded'` field
4. **Filterable**: Can be filtered in/out of inbox view if needed
5. **Real-time**: Changes appear immediately via Firestore real-time listeners

## Features

### ✅ Implemented
- ✅ CSV file upload (drag & drop or click)
- ✅ CSV parsing with quote/comma handling
- ✅ Conversation grouping and sorting
- ✅ Batch write to Firestore (efficient)
- ✅ Progress indicator
- ✅ Upload statistics (messages, conversations, date range)
- ✅ Processing logs (real-time)
- ✅ View all uploaded data
- ✅ Delete uploaded data (individual batches)
- ✅ User authentication check
- ✅ File size validation (50MB max)
- ✅ File type validation (.csv only)

### 🔮 Potential Enhancements
- Intelligent matching with existing HeyReach conversations (merge if same participant)
- Export merged conversation data back to CSV
- Bulk delete all uploaded data
- Search/filter uploaded data by date range or participant
- Duplicate detection (warn if same conversation already uploaded)
- Support for other LinkedIn export formats (JSON, etc.)

## Security & Privacy

### Authentication Required
- Users must be logged in to upload data
- Only authenticated users can access the page
- Redirects to login if not authenticated

### Data Ownership
- Each upload is tagged with `uploadedBy: user_uid`
- Users can only see and delete their own uploaded data
- Firestore security rules should enforce user-level access

### Data Deletion
- Users can delete their uploaded data at any time
- Deletion is permanent and cannot be undone
- Only affects data with `source: 'user_uploaded'` tag

## Troubleshooting

### Problem: "File size exceeds 50MB limit"
**Solution**: Your messages.csv file is too large. Try:
1. Split the file into smaller chunks (by date range)
2. Request a smaller date range from LinkedIn
3. Contact support to increase the limit

### Problem: "Please upload a CSV file"
**Solution**: Make sure you're uploading the `messages.csv` file, not a ZIP file or other format.

### Problem: "No uploaded data yet"
**Solution**: 
1. Check if the upload completed successfully (look for success message)
2. Refresh the page
3. Check browser console for errors

### Problem: Messages not appearing in inbox
**Solution**:
1. Go to `heyreach_inbox.html` and refresh
2. Check date filters (uploaded messages may be older than visible range)
3. Verify the upload completed successfully (check logs)

## Support
If you encounter issues:
1. Check the processing logs for error messages
2. Verify the CSV file is in the correct format
3. Check browser console for JavaScript errors
4. Contact technical support with error details

## Future Integration with HeyReach API
Currently, this system operates independently of the HeyReach API. The messages you upload will coexist with HeyReach-synced data. If HeyReach later provides an API to access historical messages, we can:

1. Merge uploaded data with newly available API data
2. Deduplicate messages across both sources
3. Mark API-sourced messages differently than user uploads
4. Maintain historical user uploads even after API integration

## Version History
- **v1.0** (2025-11-03): Initial release
  - CSV upload and parsing
  - Firestore integration
  - Basic data management (view, delete)
  - Upload statistics and logs









