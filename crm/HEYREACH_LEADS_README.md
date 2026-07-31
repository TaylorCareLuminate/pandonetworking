# HeyReach Leads Management Page

## Overview
The **HeyReach Leads** page (`heyreach_leads.html`) is a comprehensive tool for viewing and managing LinkedIn campaign leads from HeyReach. It allows you to track invitation acceptance, message engagement, and export lead data.

## Location
```
HealthLuminateSite/crm/heyreach_leads.html
```

## Features

### 1. Campaign Lead Viewing
- **Select Customer**: Choose from customers with HeyReach integration enabled
- **Select Campaign**: View all campaigns for the selected customer
- **Load Leads**: Fetch all leads for the selected campaign from Firestore

### 2. Lead Status Tracking
The page tracks and displays three key statuses:
- ✅ **Accepted**: Leads who have accepted your LinkedIn connection invitation
- 💬 **Replied**: Leads who have sent messages back
- ⏳ **Pending**: Leads who haven't yet accepted the invitation

### 3. Filtering & Search
- **Status Filter**: Filter by accepted, replied, or pending leads
- **Search**: Search by name, company, position, or email
- **Real-time Updates**: Filters update statistics and table instantly

### 4. Lead Information Display
For each lead, the page shows:
- Name with avatar/initials
- Company name
- Position/Title
- Connection status badge
- Email address (including enriched emails)
- Actions: View details, LinkedIn profile link

### 5. Statistics Dashboard
Live statistics showing:
- Total leads in the campaign
- Number of accepted connections
- Number of leads who replied
- Number of pending invitations

### 6. Lead Details Modal
Click "View" on any lead to see detailed information:
- Full name and basic info
- Company and position
- Location and industry
- Connection counts
- Message counts
- Email enrichments (multiple emails if available)
- Custom user fields from HeyReach
- Link to LinkedIn profile

### 7. Data Export
- Export filtered leads to CSV
- Includes all lead information for analysis
- File format: `heyreach_leads_YYYY-MM-DD.csv`

### 8. Activity Logs
- Real-time logging of all operations
- API call tracking
- Error reporting
- Clear logs functionality

## How to Use

### Step 1: Select a Customer
1. Open the page: `HealthLuminateSite/crm/heyreach_leads.html`
2. From the "Customer" dropdown, select a customer with HeyReach enabled
3. The page will automatically load available campaigns

### Step 2: Select a Campaign
1. From the "Campaign" dropdown, select the campaign you want to view
2. Campaign names show their current status (e.g., "Campaign Name (ACTIVE)")

### Step 3: Load Leads
1. Click the **"Load Leads"** button
2. The page will fetch all leads from the backend
3. Statistics will update automatically
4. Leads appear in the table below

### Step 4: Filter and Search
- Use the **Status Filter** to show only accepted, replied, or pending leads
- Use the **Search** box to find specific leads by name, company, position, or email
- Filters work together (e.g., search for a company AND filter by accepted)

### Step 5: View Lead Details
1. Click the **"View"** button next to any lead
2. A modal opens showing detailed information
3. Click the LinkedIn icon to open their profile in a new tab

### Step 6: Export Data
1. Apply any filters/search you want
2. Click **"Export CSV"** button
3. The CSV downloads with all filtered leads

## Data Fields Explained

### Lead Status Detection
The page determines lead status using multiple field checks:

**Replied Status** (highest priority):
- `messagesCount > 0` - HeyReach message count
- `hasReplied` - Direct reply flag

**Accepted Status**:
- `connectionsCount > 0` - Number of connections
- `status === 'ACCEPTED'` or `status === 'CONNECTED'` - HeyReach status
- `connected === true` - Connection flag

**Pending Status**:
- `status === 'PENDING'` - HeyReach status
- `connected === false` - Not connected yet

### Field Mappings
The page handles multiple field name variations from HeyReach API:

| Display | Possible Source Fields |
|---------|------------------------|
| Email | `email`, `emailAddress`, `enrichedEmailAddress` |
| Company | `company`, `companyName` |
| LinkedIn URL | `linkedinUrl`, `profileUrl` |
| Messages | `messagesCount`, `messageCount` |
| Connections | `connectionsCount`, `connections` |

## Backend Integration

### Endpoints Used
The page uses these existing backend endpoints:

1. **GET `/heyreach/campaigns?customerId=<id>`**
   - Fetches campaigns for a customer
   - Returns: Array of campaign objects with id, name, status

2. **GET `/heyreach/leads?customerId=<id>&campaignId=<id>`**
   - Fetches leads for a campaign
   - Returns: Array of lead objects with full details
   - Limit: 1000 leads per request

### Data Storage
Leads are stored in Firestore:
- Collection: `heyreach_leads`
- Document ID: `{customerId}_{campaignId}_{leadId}`
- Synced via backend sync service

### Sync Process
Leads are synced from HeyReach API to Firestore via:
1. Manual sync on HeyReach pages
2. Scheduled background sync (if enabled)
3. Data is cached in Firestore for fast retrieval

## Troubleshooting

### No Campaigns Appearing
**Cause**: Customer doesn't have HeyReach enabled or no API key
**Solution**: 
1. Check customer settings in Firebase
2. Ensure `heyreachEnabled: true`
3. Verify `heyreachApiKey` is set

### No Leads Loading
**Cause**: Campaign may not have been synced yet
**Solution**:
1. Go to the HeyReach Inbox page first
2. Click "Sync Inbox Now" to sync all HeyReach data
3. Return to Leads page and try again

### Status Shows "Unknown"
**Cause**: Lead data doesn't have standard status fields
**Solution**: This is normal for newly added leads that haven't had any activity yet

### Email Not Showing
**Cause**: Lead doesn't have enriched email data
**Solution**: Emails are populated by HeyReach's enrichment process. Not all leads will have emails immediately.

## Statistics Accuracy

The statistics are calculated from the **filtered** leads, not all leads:
- When you search or filter, stats update to reflect only visible leads
- Total leads = number of leads matching current filters
- Other stats count based on status within filtered results

## Performance Notes

- **Pagination**: Table shows 50 leads per page for performance
- **Limit**: Backend returns up to 1000 leads per campaign
- **Real-time**: Uses Firebase real-time listeners for live updates
- **Loading**: Shows loading states during API calls

## Customization Options

### Change Leads Per Page
In the JavaScript section, modify:
```javascript
const leadsPerPage = 50; // Change to desired number
```

### Add Custom Status Types
In the status filter dropdown, add new options:
```html
<option value="custom_status">Custom Status</option>
```

Then update the filter logic in `filterLeads()` function.

### Modify Table Columns
Edit the table headers and data cells in `displayLeads()` function to add/remove columns.

## Integration with Other Pages

### Related Pages
- **heyreach_inbox.html** - View conversations and messages
- **heyreach_contacts.html** - Manage contact sync
- Customer management pages for HeyReach settings

### Navigation
Consider adding navigation links between related pages for better workflow.

## Future Enhancements

Potential features to add:
1. Bulk actions (export selected, mark as contacted)
2. Lead scoring/rating system
3. Notes on individual leads
4. Timeline of lead activities
5. Integration with CRM contacts
6. Advanced filtering (date ranges, custom fields)
7. Campaign performance metrics

## Security Notes

- Page requires Firebase authentication
- Customer data is filtered by authenticated user's permissions
- HeyReach API keys stored securely in Firebase
- No sensitive data exposed in frontend code

## Support

For issues or questions:
1. Check the Activity Logs section on the page for error messages
2. Verify backend is running: `https://railwayclemail-production.up.railway.app`
3. Check browser console for JavaScript errors
4. Review Firebase Firestore for data integrity

---

**Created**: October 2025  
**Version**: 1.0  
**Maintained by**: CareLuminate Technical Team

