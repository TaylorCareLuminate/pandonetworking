# LinkedIn Account Authentication for Message Uploads

## Overview
The LinkedIn message upload system now uses **email-based authentication** to ensure messages are correctly associated with the right LinkedIn account, customer, and BDR.

## How It Works

### 1. **Admin Configuration** (`email_controls.html`)
Administrators configure LinkedIn accounts with two critical new fields:

- **LinkedIn Profile URL**: The actual LinkedIn profile URL for the account owner (e.g., `https://www.linkedin.com/in/taylorkentdavis`)
- **BDR Email**: The email address of the person who can upload messages for this account (e.g., `taylor@healthluminate.com`)

### 2. **User Authentication** (`manage_my_linkedin_data.html`)
When a user logs in to upload messages:

1. **Email Detection**: System detects the logged-in user's email
2. **Account Query**: Queries `linkedin_accounts` collection for accounts where `bdrEmail` matches the user's email
3. **Access Control**:
   - ✅ **If matched**: User can upload messages for their configured LinkedIn account(s)
   - ❌ **If not matched**: Upload is disabled with error message

### 3. **CSV Processing**
When a CSV file is uploaded:

1. **Profile URL Extraction**: System scans the first 10 messages to find the user's LinkedIn profile URL (from `SENDER PROFILE URL` or `RECIPIENT PROFILE URLS` columns)
2. **Account Matching**: Compares extracted profile URL against the user's configured LinkedIn accounts
3. **Validation**: Ensures the CSV actually belongs to one of the user's accounts
4. **Association**: Links all conversations to the correct:
   - `linkedInAccountId`
   - `customerId`
   - `customerName`

### 4. **Data Storage**
Each uploaded conversation is stored with:

```javascript
{
  // Upload metadata
  source: 'user_uploaded',
  uploadedBy: user.uid,
  uploadedByEmail: user.email,
  uploadedAt: Timestamp,
  
  // CRITICAL: Account association
  customerId: 'customer_xxx',
  customerName: 'Company Name',
  linkedInAccountId: 'linkedin_xxx',
  accountName: 'Account Name',
  
  // Conversation data
  conversationId: 'linkedin_conv_id',
  leadProfileUrl: 'https://www.linkedin.com/in/lead',
  leadFirstName: 'John',
  leadLastName: 'Doe',
  messageCount: 25,
  lastMessage: '...',
  lastMessageAt: Timestamp,
  lastMessageSender: 'ME' | 'CORRESPONDENT',
  
  // Raw messages
  rawData: {
    messages: [...]
  }
}
```

## Admin Setup Process

### Step 1: Configure LinkedIn Account
1. Go to **Email Controls** (`admin/email_controls.html`)
2. Navigate to **LinkedIn Accounts** section
3. Click **Add LinkedIn Account** or **Edit** existing account
4. Fill in:
   - **Account Name**: Display name (e.g., "Taylor Davis - LinkedIn")
   - **Customer**: Select customer
   - **BDR Leader**: Select BDR (optional)
   - **LinkedIn Profile URL**: `https://www.linkedin.com/in/yourprofile` ⭐ **NEW**
   - **BDR Email**: `user@company.com` ⭐ **NEW**
   - **Activity Limits**: Connections/messages per day
   - **PhantomBuster Cookie**: Session cookie
   - **Status**: Active/Inactive
5. Click **Save**

### Step 2: Verify Configuration
- The account will display:
  - LinkedIn Profile URL (clickable link)
  - BDR Email
  - Other account details

## User Upload Process

### Step 1: Login
- User logs in with their email (must match `bdrEmail` in configuration)

### Step 2: Verification
- System automatically checks if user's email has any configured LinkedIn accounts
- **Success**: Shows configured account(s) and enables upload
- **Failure**: Shows error message and disables upload

### Step 3: Upload CSV
1. User uploads their LinkedIn `messages.csv` file
2. System extracts LinkedIn profile URL from CSV
3. System matches profile URL to user's configured account(s)
4. System processes and stores messages with correct associations

### Step 4: View Messages
- Messages appear in HeyReach Inbox (`heyreach_inbox.html`)
- Properly filtered by customer and LinkedIn account
- Tagged as `source: 'user_uploaded'` for easy identification

## Security & Access Control

### Ensures Proper Association
- ✅ Messages are linked to the correct `linkedInAccountId`
- ✅ Messages are linked to the correct `customerId`
- ✅ Messages appear in the right account's inbox
- ✅ Prevents cross-account message leakage

### Multi-Level Validation
1. **Email Validation**: Only authorized emails can upload
2. **Profile URL Validation**: CSV must match configured LinkedIn profile
3. **Account Validation**: LinkedIn account must be active and configured
4. **Customer Validation**: User's account must be linked to a valid customer

### Error Messages
- **No LinkedIn accounts configured**: "No LinkedIn accounts are configured for your email (user@example.com). Please contact an administrator."
- **CSV doesn't match**: "Could not match CSV messages to any of your LinkedIn accounts. Expected profiles: [list]"
- **Not logged in**: Redirects to login page

## Benefits

### For Administrators
- ✅ Central control over who can upload what
- ✅ Clear audit trail (uploadedBy, uploadedByEmail)
- ✅ Prevents accidental misassociation
- ✅ Easy to add/remove upload permissions

### For Users (BDRs)
- ✅ Automatic account detection (no manual selection)
- ✅ Clear feedback on access status
- ✅ Simple upload process
- ✅ Confidence that messages are correctly associated

### For System
- ✅ Consistent data structure
- ✅ Proper customer/account filtering
- ✅ Audit trail for uploaded data
- ✅ Easy to identify and manage user-uploaded vs. API-synced data

## Document ID Format

Uploaded messages use the same format as HeyReach-synced data:
```
{customerId}_{linkedInAccountId}_{conversationId}
```

Example:
```
customer_1755204640454_linkedin_1234567890_2-YjU0MTkwZTQtY2M2MC00ODgzLTg2M2MtYTFhNWFmMGQ3YzBjXzEwMA==
```

This ensures consistency across all conversation data.

## Troubleshooting

### Problem: "No LinkedIn accounts configured"
**Solution**: Administrator needs to:
1. Go to Email Controls
2. Edit or create LinkedIn account
3. Add user's email to **BDR Email** field
4. Add LinkedIn profile URL to **LinkedIn Profile URL** field
5. Save

### Problem: "Could not match CSV messages"
**Possible Causes**:
- LinkedIn Profile URL in admin config doesn't match CSV
- User uploaded someone else's CSV file
- CSV is corrupted or in wrong format

**Solution**:
1. Check the LinkedIn Profile URL in admin config
2. Verify the CSV is from the correct LinkedIn account
3. Compare URLs in error message with configured URLs

### Problem: Messages not appearing in inbox
**Solution**:
1. Check customer filter in HeyReach Inbox
2. Check LinkedIn account filter
3. Verify upload completed successfully (check logs)
4. Refresh the page

## Database Schema Updates

### `linkedin_accounts` Collection
**New fields**:
- `linkedInProfileUrl` (string, required): LinkedIn profile URL of account owner
- `bdrEmail` (string, required): Email of authorized uploader

**Example document**:
```javascript
{
  id: "linkedin_1234567890",
  accountName: "Taylor Davis - LinkedIn",
  customerId: "customer_1755204640454",
  customerName: "Mentavi Health",
  bdrLeaderId: "bdr_123",
  
  // NEW FIELDS
  linkedInProfileUrl: "https://www.linkedin.com/in/taylorkentdavis",
  bdrEmail: "taylor@healthluminate.com",
  
  // Existing fields
  phantomBusterCookie: "...",
  connectionsPerDay: 20,
  messagesPerDay: 30,
  status: "active",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `heyreach_inbox` Collection
**Updated fields for user-uploaded data**:
```javascript
{
  source: "user_uploaded",  // Identifies as user-uploaded
  uploadedBy: "firebase_uid",
  uploadedByEmail: "user@example.com",
  uploadedAt: Timestamp,
  
  customerId: "customer_xxx",  // From matched LinkedIn account
  customerName: "Company Name",  // From matched LinkedIn account
  linkedInAccountId: "linkedin_xxx",  // From matched LinkedIn account
  accountName: "Account Name",  // From matched LinkedIn account
  
  // ... rest of conversation data
}
```

## Migration Guide

### For Existing LinkedIn Accounts
1. **Identify affected accounts**: All LinkedIn accounts in `linkedin_accounts` collection
2. **Update each account**:
   - Add `linkedInProfileUrl` from the account owner's actual LinkedIn profile
   - Add `bdrEmail` from the BDR/user who will upload messages
3. **Test upload**: Have each BDR test the upload process

### For Existing Uploaded Data
- No migration needed
- Existing uploaded data will continue to work
- New uploads will have proper association

## Version History
- **v2.0** (2025-11-03): Added email-based authentication with LinkedIn profile URL matching
- **v1.0** (2025-11-03): Initial release with manual profile detection

## See Also
- [Full Documentation](./LINKEDIN_DATA_UPLOAD_README.md)
- [Quick Start Guide](./QUICK_START.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)









