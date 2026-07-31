# Prospect Cleanup Tool - Admin Documentation

## Overview
The **Prospect Cleanup Tool** is an admin-only page that uses AI (GPT-4o-mini) to intelligently scan prospect contacts in the database and identify those that should be deleted based on customizable criteria.

⚠️ **IMPORTANT**: This tool only operates on **PROSPECT CONTACTS**. Established connections (Relationship Building Focus/Light) are automatically excluded and protected from deletion.

## Purpose
- **Database Maintenance**: Remove low-quality or irrelevant prospect contacts from the CRM
- **Bulk Cleanup**: Process thousands of contacts quickly using AI
- **Safe Deletion**: Review AI recommendations before confirming deletions
- **Criteria-Based**: Define exactly what to keep and what to remove
- **Connection Protection**: Automatically excludes established relationships from cleanup

## Access
- **URL**: `https://healthluminate.com/connect/prospect_cleanup.html`
- **Restricted to**: Admin users only (healthluminate.com or careluminate.com domains)
- **Authentication**: Requires login via HealthLuminate auth system

## How It Works

### 1. Select BDR
Choose which BDR's contacts you want to clean up:
- Dropdown shows all BDR leaders with their email addresses
- Shows both auth email and LinkedIn email if different
- Must select a BDR before proceeding

### 2. Load Contacts
Click **"Load Contacts for Selected BDR"** to:
- Query `heyreach_contacts` for the selected BDR's contacts
- Try LinkedIn email first (if available), then auth email
- **Automatically filter out established connections** (Relationship Building Focus/Light)
- Display count of loaded prospect contacts
- Show count of protected connections (if any)
- Enable the cleanup criteria section

### 3. Define Criteria
You provide two sets of criteria to guide the AI:

**Contacts to KEEP** (examples):
```
Keep contacts who work at healthcare companies, hospital systems, 
medical device manufacturers, health tech companies, or pharmaceutical 
companies. Keep anyone with Director-level titles or above.
```

**Contacts to REMOVE** (examples):
```
Remove contacts who work at non-healthcare companies, consulting firms, 
marketing agencies, or educational institutions. Remove anyone with 
junior titles like coordinator, assistant, or intern.
```

### 3. Define Criteria
You provide two sets of criteria to guide the AI:

**Contacts to KEEP** (examples):
```
Keep contacts who work at healthcare companies, hospital systems, 
medical device manufacturers, health tech companies, or pharmaceutical 
companies. Keep anyone with Director-level titles or above.
```

**Contacts to REMOVE** (examples):
```
Remove contacts who work at non-healthcare companies, consulting firms, 
marketing agencies, or educational institutions. Remove anyone with 
junior titles like coordinator, assistant, or intern.
```

### 4. AI Scanning Process
- Scans only the loaded contacts for the selected BDR
- Processes contacts in batches of 100 (sent to Railway backend)
- Railway backend uses OpenAI GPT-4o-mini to evaluate each contact
- AI returns:
  - `action`: "delete" or "keep"
  - `reason`: Brief explanation for the decision
- Progress is displayed in real-time

### 5. Review Results
- All contacts flagged for deletion are displayed in a table
- Shows: Name, Company, Position, Location, Account Email, AI Reasoning
- Contacts are selected by default (ready for deletion)
- **You can uncheck any contact** to keep it (marked with green background)

### 4. Confirm Deletion
- Click "Delete Selected" button
- Must type "DELETE" to confirm (safety measure)
- Contacts are permanently deleted from Firestore
- **This action cannot be undone**

## Technical Architecture

### Frontend (`prospect_cleanup.html`)
- **Location**: `HealthLuminateSiteFromLocal/connect/prospect_cleanup.html`
- **Tech Stack**: Vanilla JavaScript, Firebase Firestore via CLEmail wrapper
- **Features**:
  - Admin access control check
  - Real-time progress tracking
  - Interactive results table with checkboxes
  - Batch deletion via Firestore

### Backend API (`server.js`)
- **Endpoint**: `POST /api/ai-cleanup-scan`
- **Location**: Railway backend (`RailwayCLemail/server.js`)
- **Processing**:
  - Receives: `keepCriteria`, `removeCriteria`, `contacts[]`
  - Processes 20 contacts at a time (OpenAI batching)
  - Uses GPT-4o-mini with JSON response format
  - Returns: Array of contacts flagged for deletion with reasons

### Request/Response Format

**Request**:
```json
{
  "keepCriteria": "Keep healthcare companies...",
  "removeCriteria": "Remove non-healthcare...",
  "contacts": [
    {
      "id": "doc123",
      "name": "John Doe",
      "company": "Example Corp",
      "position": "Sales Manager",
      "location": "San Francisco, CA",
      "accountEmail": "user@example.com"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "flaggedForDeletion": [
    {
      "id": "doc123",
      "name": "John Doe",
      "company": "Example Corp",
      "reason": "Works at marketing agency, not healthcare-related"
    }
  ],
  "summary": {
    "total": 5000,
    "flaggedForDeletion": 1250,
    "willKeep": 3750
  }
}
```

## AI Decision Logic

The AI uses GPT-4o-mini with the following logic:
1. If contact clearly matches REMOVE criteria AND does NOT match KEEP criteria → **delete**
2. If contact matches KEEP criteria → **keep**
3. If uncertain → **keep** (safety first, avoid accidental deletion)
4. Intelligent matching:
   - Understands job title seniority levels
   - Recognizes company types and industries
   - Flexible with location and role matching

## Safety Features

1. **Admin-Only Access**: Page redirects non-admins to homepage
2. **Confirmation Prompt**: Must type "DELETE" before deletion
3. **Review Before Delete**: All flagged contacts displayed for review
4. **Selective Keep**: Uncheck any contacts to exclude from deletion
5. **AI Safety Bias**: When uncertain, AI defaults to "keep"
6. **Error Handling**: Any OpenAI errors result in "keep" (not delete)

## Usage Tips

### Best Practices
1. **Start with clear criteria**: Be specific about what to keep vs remove
2. **Test with small batches**: Run on a subset first if unsure
3. **Review AI reasoning**: Check why contacts are flagged before deleting
4. **Keep the good ones**: Uncheck valuable contacts that were mis-flagged
5. **Document decisions**: Note your criteria for future reference

### Common Use Cases

**Remove non-healthcare contacts**:
```
KEEP: Healthcare companies, medical providers, health tech
REMOVE: Marketing agencies, unrelated industries
```

**Remove low-quality leads**:
```
KEEP: Director-level and above at target companies
REMOVE: Junior roles, students, unrelated positions
```

**Geographic cleanup**:
```
KEEP: Contacts in United States
REMOVE: International contacts outside US
```

**Company size filter**:
```
KEEP: Contacts at companies with 50+ employees
REMOVE: Solo practitioners, very small businesses
```

## Statistics & Monitoring

During scanning, you'll see:
- **Total contacts**: Number loaded from database
- **Scanned**: Contacts processed so far
- **Flagged for deletion**: Contacts identified for removal
- **Progress**: Percentage complete
- **Progress bar**: Visual indicator

After scanning:
- **Total flagged**: Contacts identified for deletion
- **Selected for deletion**: Currently checked contacts
- **Will keep**: Unchecked contacts (saved from deletion)

## Data Impact

### Safety Features
- **🛡️ Connection Protection**: Contacts with "Relationship Building Focus" or "Relationship Building Light" categories are automatically excluded from loading and cannot be accidentally deleted
- **BDR-Specific**: Only operates on contacts for the selected BDR
- **Review Step**: Must manually review and confirm deletions
- **Selective Uncheck**: Can remove individual contacts from deletion list

### Collections Affected
- **`heyreach_contacts`**: Prospect contacts are permanently deleted (connections are protected)
- No other collections are modified

### What Gets Deleted
- Contact document (all fields)
- Cannot be recovered after deletion
- Related data in other collections (campaigns, inbox) may reference deleted contacts

### What Is NOT Deleted
- Conversation history in `heyreach_inbox`
- Campaign records in `heyreach_campaigns`
- Company research in `connect_company_background`

## Troubleshooting

### "Access Denied" Error
- Ensure you're logged in with an admin account
- Admin domains: healthluminate.com, careluminate.com

### "No contacts found"
- Check Firestore `heyreach_contacts` collection has data
- Verify CLEmail wrapper is loaded correctly

### "Failed to scan contacts"
- Check Railway backend is running
- Verify OpenAI API key is configured
- Check browser console for detailed errors

### AI returning unexpected results
- Review your criteria - be more specific
- Check contact data quality (missing fields)
- Examine AI reasoning in results table

## Cost Considerations

- **OpenAI API Usage**: Uses GPT-4o-mini (very affordable)
- **Cost per contact**: ~$0.0001 per contact evaluation
- **5000 contacts**: ~$0.50 total cost
- Processes 20 contacts per API call for efficiency

## Security

- ✅ Admin-only access enforced
- ✅ Authentication required via HealthLuminate auth system
- ✅ CORS protection on Railway backend
- ✅ Deletion confirmation required
- ✅ All actions logged to console
- ⚠️ **Deletions are permanent** - no undo functionality

## Future Enhancements

Potential improvements:
- [ ] Soft delete (archive) instead of permanent deletion
- [ ] Export flagged contacts before deletion
- [ ] Save cleanup criteria as templates
- [ ] Undo/restore functionality
- [ ] Scheduled automatic cleanup
- [ ] More granular filtering options
- [ ] Bulk category reassignment instead of deletion

## Related Systems

- **My Leads**: Uses similar AI scanning for flagging good matches
- **HeyReach Contacts Service**: Source of contact data
- **CLEmail Firestore Wrapper**: Secure database access
- **Railway Backend**: Hosts AI scanning API

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify Railway backend logs
3. Review OpenAI API usage/quotas
4. Contact development team

---

**⚠️ WARNING: This tool permanently deletes data. Use with extreme caution. Always review AI recommendations before confirming deletion.**

