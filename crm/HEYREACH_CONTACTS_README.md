# HeyReach Contacts System

## Overview

The HeyReach Contacts system provides a comprehensive solution for syncing and viewing all LinkedIn contacts from your HeyReach accounts' networks. It consists of a frontend interface for browsing contacts and a backend system that automatically syncs contacts every 2 hours.

## Components

### 1. Frontend: `heyreach_allcontacts.html`

A modern, responsive web interface that displays all contacts from LinkedIn accounts' networks.

**Features:**
- **Contact Display**: Shows all contacts with avatars, headlines, and key information
- **Advanced Filtering**: Filter by customer, account, and search by name/company
- **Statistics Dashboard**: Shows total contacts, accounts, and customers
- **Manual Sync Trigger**: Button to manually trigger contact sync and view Railway backend logs
- **CSV Export**: Export contacts data for analysis
- **Real-time Updates**: Uses Firebase listeners to automatically refresh when new data arrives
- **Pagination**: Handles large numbers of contacts efficiently (24 per page)
- **Responsive Design**: Works beautifully on desktop, tablet, and mobile

**Access URL:**
```
https://yourdomain.com/crm/heyreach_allcontacts.html
```

### 2. Backend Service: `heyreach_contacts_service.js`

A Node.js service that handles all contact synchronization logic.

**Key Methods:**
- `syncAllContacts()`: Syncs contacts for all customers with HeyReach integration
- `syncCustomerContacts(customer)`: Syncs contacts for a specific customer
- `getAllContactsForAccount()`: Fetches all contacts for a LinkedIn account with pagination
- `getContactsPage()`: Gets a single page of contacts from HeyReach API
- `storeContact()`: Stores/updates contacts in Firestore
- `getContactsStats()`: Calculates contact statistics
- `getContacts(filters)`: Retrieves contacts from Firestore with filters
- `searchContacts(searchTerm, filters)`: Searches contacts by name or company

### 3. Backend API Endpoints

#### POST `/heyreach/contacts/sync`
Manually triggers contact sync across all HeyReach accounts.

**Response:**
```json
{
  "success": true,
  "results": {
    "customers": 5,
    "totalContacts": 5000,
    "newContacts": 150,
    "updatedContacts": 4850,
    "errors": []
  }
}
```

#### GET `/heyreach/contacts`
Retrieves contacts from Firestore with optional filters.

**Query Parameters:**
- `customerId`: Filter by customer ID
- `accountId`: Filter by LinkedIn account ID
- `companyName`: Filter by company name
- `limit`: Maximum number of results (default: 1000)

**Response:**
```json
{
  "success": true,
  "contacts": [...],
  "count": 5000
}
```

#### GET `/heyreach/contacts/search`
Searches contacts by name, company, position, or headline.

**Query Parameters:**
- `q` or `search`: Search term (required)
- `customerId`: Filter by customer ID (optional)
- `accountId`: Filter by LinkedIn account ID (optional)

**Response:**
```json
{
  "success": true,
  "contacts": [...],
  "count": 150,
  "searchTerm": "software engineer"
}
```

#### GET `/heyreach/contacts/stats`
Returns contact statistics including total counts and breakdowns.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalContacts": 5000,
    "customerStats": {
      "customer123": {
        "name": "Company Name",
        "contacts": 1200,
        "accountCount": 3
      }
    },
    "accountStats": {
      "789": {
        "name": "John Doe",
        "contacts": 400
      }
    },
    "lastSyncTime": "2024-01-01T12:00:00.000Z"
  }
}
```

### 4. Automated Sync Job

A cron job runs every 2 hours to automatically sync all contacts:

```javascript
cron.schedule('0 */2 * * *', async () => {
  console.log('👥 Syncing HeyReach contacts (2-hour check)...');
  const results = await heyReachContactsService.syncAllContacts();
  console.log(`✅ HeyReach contacts sync complete: ${results.totalContacts} contacts`);
});
```

**Schedule:** Every 2 hours (at :00 minutes)

## Data Structure

### Firestore Collection: `heyreach_contacts`

Each document represents a contact and includes:

```javascript
{
  // Customer Information
  customerId: "customer123",
  customerName: "Company Name",
  
  // LinkedIn Account (the account that has this contact)
  linkedInAccountId: 789,
  accountName: "John Doe",
  accountEmail: "john@company.com",
  
  // Contact Information
  linkedInId: "abc123",
  profileUrl: "https://linkedin.com/in/janedoe",
  firstName: "Jane",
  lastName: "Doe",
  fullName: "Jane Doe",
  headline: "Senior Software Engineer at Tech Corp",
  imageUrl: "https://...",
  location: "San Francisco, CA",
  
  // Company Information
  companyName: "Tech Corp",
  companyUrl: "https://linkedin.com/company/techcorp",
  position: "Senior Software Engineer",
  
  // Additional Information
  about: "Passionate about...",
  connections: 500,
  followers: 1200,
  emailAddress: "jane@techcorp.com",
  
  // Metadata
  syncedAt: Timestamp,
  lastSyncAt: Timestamp,
  
  // Raw data from API
  rawData: {...}
}
```

## HeyReach API Integration

The system uses the HeyReach MyNetwork API endpoint to fetch all LinkedIn connections:

**Important:** HeyReach has different endpoints:
- `/api/public/lead/GetAll` - Returns only campaign leads (people contacted through campaigns)
- `/api/public/MyNetwork/GetMyNetworkForSender` - Returns all LinkedIn connections for a specific account

This system uses the **MyNetwork API** to get the complete LinkedIn network for each account.

**Note:** The endpoint uses PascalCase (MyNetwork, not mynetwork or my_network)

**Endpoint:** `POST https://api.heyreach.io/api/public/MyNetwork/GetMyNetworkForSender`

**Request Body:**
```json
{
  "pageNumber": 0,
  "pageSize": 100,
  "senderId": 1234
}
```

**Response:**
```json
{
  "totalCount": 5000,
  "items": [
    {
      "linkedin_id": "abc123",
      "profileUrl": "https://...",
      "firstName": "Jane",
      "lastName": "Doe",
      "headline": "Senior Software Engineer",
      "imageUrl": "https://...",
      "location": "San Francisco, CA",
      "companyName": "Tech Corp",
      "companyUrl": "https://...",
      "position": "Senior Software Engineer",
      "about": "Passionate about...",
      "connections": 500,
      "followers": 1200,
      "emailAddress": "jane@techcorp.com"
    }
  ]
}
```

**Pagination:**
The service automatically handles pagination by making multiple requests with increasing page numbers until all contacts are fetched (max 100 pages = 10,000 contacts per account).

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

The system uses simple queries that work with automatic indexes. However, for optimal performance with large datasets, you may want to create composite indexes:

```
Collection: heyreach_contacts
Fields: customerId (Ascending), lastSyncAt (Descending)

Collection: heyreach_contacts
Fields: linkedInAccountId (Ascending), lastSyncAt (Descending)
```

## Usage Guide

### For End Users

1. **Access the Contacts Page**: Navigate to `/crm/heyreach_allcontacts.html`

2. **View Contacts**: 
   - All contacts are displayed in a grid layout with avatars and key information
   - Click on any contact card to open their LinkedIn profile in a new tab
   - Use pagination to navigate through large sets of contacts

3. **Filter Contacts**:
   - Select a customer to view only their contacts
   - Filter by account to see contacts from specific LinkedIn accounts
   - Search by name, company, position, or headline

4. **Manual Sync**:
   - Click "Sync Contacts Now" to manually trigger a sync
   - View Railway backend logs in the logs section
   - Monitor sync progress and results

5. **Export Data**:
   - Click "Export CSV" to download contacts for analysis
   - CSV includes all contact information and metadata

### For Developers

#### Testing the Backend Directly

**Manual Sync:**
```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/contacts/sync \
  -H "Content-Type: application/json"
```

**Get Contacts:**
```bash
curl "https://railwayclemail-production.up.railway.app/heyreach/contacts?customerId=abc123&limit=50"
```

**Search Contacts:**
```bash
curl "https://railwayclemail-production.up.railway.app/heyreach/contacts/search?q=software+engineer"
```

**Get Stats:**
```bash
curl "https://railwayclemail-production.up.railway.app/heyreach/contacts/stats"
```

#### Monitoring Cron Jobs

Check Railway logs for 2-hourly sync messages:
```
👥 Syncing HeyReach contacts (2-hour check)...
✅ HeyReach contacts sync complete: 5000 contacts, 150 new, 4850 updated
```

#### Debugging

1. **Frontend Logs**: Open browser console to see detailed logs
2. **Backend Logs**: Check Railway dashboard for service logs
3. **Firestore**: Inspect `heyreach_contacts` collection directly

## Error Handling

The system includes comprehensive error handling:

1. **Customer-Level Errors**: If one customer fails, others continue processing
2. **Account-Level Errors**: If one account fails, other accounts continue
3. **API Errors**: Logged with detailed error messages
4. **Rate Limiting**: Pagination prevents overwhelming the API
5. **Validation**: Checks for required fields (linkedin_id or profileUrl)

## Performance Considerations

1. **Pagination**: Fetches 100 contacts per request (API limit)
2. **Batch Processing**: Processes all customers and accounts sequentially
3. **Real-time Updates**: Frontend uses Firebase listeners for instant updates
4. **Caching**: Stores contacts in Firestore to reduce API calls
5. **Efficient Queries**: Uses indexed fields for fast lookups
6. **Safety Limits**: Max 10,000 contacts per account to prevent infinite loops

## Comparison with Inbox System

| Feature | Contacts System | Inbox System |
|---------|----------------|--------------|
| **Purpose** | View all contacts in network | View conversations |
| **Sync Frequency** | Every 2 hours | Every 30 minutes |
| **Data Volume** | High (thousands per account) | Medium (hundreds per account) |
| **API Endpoint** | `/leads/GetAll` | `/inbox/GetConversationsV2` |
| **Pagination** | Page-based (pageNumber) | Offset-based (offset) |
| **Primary Use Case** | Lead research, network analysis | Message management |

## Future Enhancements

Potential improvements for the system:

1. **Contact Details Modal**: View full contact information in a modal
2. **Contact Notes**: Add internal notes to contacts
3. **Tags and Lists**: Organize contacts into custom lists
4. **Lead Scoring**: Automatic scoring based on profile data
5. **Export to CRM**: Direct integration with CRM systems
6. **Duplicate Detection**: Identify and merge duplicate contacts
7. **Relationship Mapping**: Visualize connections between contacts
8. **Activity Tracking**: Track interactions with each contact
9. **Email Finder**: Automatically find and verify email addresses
10. **Contact Enrichment**: Enhance profiles with additional data sources

## Troubleshooting

### No Contacts Appearing

1. Check if customers have `heyreachEnabled: true` and valid `heyreachApiKey`
2. Verify LinkedIn accounts are properly configured in HeyReach
3. Check Railway logs for sync errors
4. Manually trigger sync from the frontend
5. Verify accounts have contacts in their LinkedIn network

### Sync Failing

1. Verify HeyReach API keys are valid
2. Check Railway service is running
3. Review error messages in logs
4. Test API connectivity directly
5. Check if API endpoint `/leads/GetAll` is available

### Slow Performance

1. Reduce limit on contacts query
2. Add more specific filters
3. Check Firebase quotas and limits
4. Optimize indexes if needed
5. Consider implementing server-side pagination

### Missing Contact Information

1. Check if HeyReach API returned all fields
2. Verify contact data structure in `rawData` field
3. Update extraction logic if API structure changed
4. Check for null/undefined values in source data

### Duplicate Contacts

1. Check if same contact appears under multiple accounts
2. Verify document ID generation logic
3. Contacts from different accounts are stored separately (by design)

## API Endpoint Troubleshooting

If the `/leads/GetAll` endpoint doesn't work, you may need to adjust the endpoint URL. Possible alternatives:

- `/api/public/contacts/GetAll`
- `/api/public/network/GetAll`
- `/api/public/leads/search`

Check the HeyReach API documentation or contact their support for the correct endpoint.

## Support

For issues or questions:
1. Check Railway logs for backend errors
2. Review browser console for frontend errors
3. Inspect Firestore data for inconsistencies
4. Verify HeyReach API key and account configuration
5. Contact development team with error details

## Changelog

### Version 1.0.0 (Initial Release)
- Frontend interface for viewing contacts
- Backend service for contact sync
- Automated 2-hourly sync via cron job
- Filtering and search capabilities
- CSV export functionality
- Real-time updates via Firebase
- Manual sync trigger with log display
- Statistics dashboard
- Pagination support
- LinkedIn profile integration

## Related Systems

- **HeyReach Inbox** (`heyreach_inbox.html`): View and manage LinkedIn conversations
- **HeyReach System Overview** (`HEYREACH_SYSTEM_OVERVIEW.md`): Complete HeyReach integration documentation

