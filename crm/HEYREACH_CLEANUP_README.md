# HeyReach Contact Cleanup & Rebalancing Tool

## Overview

The **HeyReach Cleanup** page (`heyreach_cleanup.html`) helps you identify and rebalance contacts in HeyReach that haven't been started in campaigns yet. This is essential for:

- Moving contacts between lists (BDR rebalancing)
- Identifying contacts that can be safely moved without disrupting active campaigns
- Cleaning up contacts that were sent to HeyReach but never started
- Exporting contact data for analysis

## Access

**URL**: `https://[your-domain]/crm/heyreach_cleanup.html`

## Features

### 1. Smart Contact Discovery
- **Integrates with Reporting System**: Uses the master activity log to find all LinkedIn contacts
- **Real-time HeyReach Status**: Queries HeyReach API to check current campaign status
- **Campaign Status Detection**: Identifies which contacts have been "started" vs "not started"

### 2. Advanced Filtering
- **Customer Filter**: Select any customer (pre-selects OutcomeMD if available)
- **Campaign Filter**: Filter by specific campaign or view all campaigns
- **Status Filter**: 
  - "Not Started (moveable)" - Contacts safe to move between lists
  - "Started" - Contacts already in progress
  - "All Contacts" - View everything
- **List Filter**: Filter by current HeyReach list

### 3. Bulk Operations
- **Select Multiple Contacts**: Checkbox selection with "Select All" option
- **Move Between Lists**: Bulk move contacts from one list to another
- **Remove from HeyReach**: Permanently remove contacts (use with caution!)
- **Export to CSV**: Download filtered contact data

### 4. Contact Status Indicators

#### "Not Started" Contacts ⚠️
These contacts are **SAFE TO MOVE**:
- Have been added to HeyReach
- Campaign has not started outreach yet
- No messages or connection requests sent
- Can be moved to different lists without losing data

#### "Started" Contacts ✅
These contacts are **IN PROGRESS**:
- HeyReach has begun outreach
- Messages or connection requests sent
- Should NOT be moved (will disrupt campaign flow)

## How It Works

### Data Flow
1. **Reporting System Query**: 
   - Queries `master_activity_log` collection for LinkedIn activities
   - Filters by customer and campaign
   - Identifies unique contacts

2. **HeyReach API Query**:
   - Gets all campaigns for the customer
   - Fetches leads from each campaign
   - Determines campaign status and list assignments

3. **Data Merging**:
   - Matches contacts between reporting system and HeyReach
   - Determines "started" vs "not started" status
   - Shows current list assignment

4. **Status Detection Logic**:
```javascript
// Contact is "started" if:
- lead.status !== 'pending'
- lead.status !== 'new'  
- lead.status !== 'not_started'

// Any other status means HeyReach has begun outreach
```

## Usage Guide

### Step 1: Select Customer & Campaign
1. Choose customer from dropdown (OutcomeMD pre-selected if available)
2. Select a specific campaign or "All Campaigns"
3. Choose status filter (default: "Not Started (moveable)")
4. Optionally filter by current list

### Step 2: Search for Contacts
Click **"Search Contacts"** button to load contacts matching your filters.

The page will:
- Query the reporting system for LinkedIn activities
- Fetch real-time data from HeyReach
- Merge and display results

### Step 3: Review Contacts
The contacts table shows:
- **Contact Info**: Name, email, company
- **LinkedIn URL**: Link to profile
- **Current List**: Which HeyReach list they're in
- **Campaign**: Current campaign assignment
- **Status**: Started or Not Started (with colored badge)
- **Last Activity**: Most recent interaction date

### Step 4: Bulk Actions

#### Move Contacts Between Lists
1. Select contacts using checkboxes (only "Not Started" contacts are selectable)
2. Choose target list from "Move to List" dropdown
3. Click "Move Selected (X)" button
4. Confirm the action

**What happens:**
- Contacts are removed from their current list
- Contacts are added to the new list
- Campaign assignments update automatically
- Page refreshes to show new status

#### Remove Contacts from HeyReach
1. Select contacts using checkboxes
2. Click "Remove from HeyReach (X)" button
3. ⚠️ **Confirm the permanent deletion**

**⚠️ WARNING**: This permanently removes contacts from HeyReach. Use with caution!

### Step 5: Export Data
Click **"Export CSV"** to download:
- All filtered contacts
- Current list assignments
- Campaign status
- Activity history

## Key Statistics

The dashboard shows:
- **Total Contacts**: All contacts matching filters
- **Not Started**: Contacts safe to move (⚠️ yellow)
- **Started**: Contacts in progress (✅ green)
- **Selected**: Currently selected for bulk actions

## API Endpoints Used

### Reporting System
```
GET /reporting/activities?customerId=X&activityType=linkedin&limit=1000
```
Returns all LinkedIn activities from the master activity log.

### HeyReach API (via Railway Proxy)
```
POST /proxy/heyreach/campaigns/getall
POST /proxy/heyreach/campaigns/getleads
POST /proxy/heyreach/lists/getall
POST /proxy/heyreach/lists/addleads
POST /proxy/heyreach/lists/removeleads
```

## Rebalancing Workflow

### Scenario: Moving Contacts Between BDRs

**Example**: OutcomeMD has 3 BDRs, but one list has too many contacts.

1. **Filter for the overloaded list**:
   - Customer: OutcomeMD
   - Status: "Not Started (moveable)"
   - Current List: "BDR Ryan - OutcomeMD"

2. **Identify contacts to move**:
   - Review contacts
   - Select the ones you want to rebalance
   - Consider company, geography, or other factors

3. **Move to target list**:
   - Choose target list: "BDR Jean - OutcomeMD"
   - Click "Move Selected"
   - Confirm

4. **Verify**:
   - Contacts are moved to new list
   - Campaign assignments update
   - New BDR will handle outreach

### Why This Is Safe

**For "Not Started" contacts**:
- No outreach has been sent yet
- No campaign history to lose
- No message sequences interrupted
- Clean slate for the new BDR/list

**For "Started" contacts**:
- These are **not selectable** (no checkbox shown)
- Cannot be moved through this tool
- Prevents disrupting active campaigns

## Troubleshooting

### No Contacts Found
**Check:**
1. Is the customer selected?
2. Does the customer have HeyReach API key configured?
3. Are there LinkedIn activities in the reporting system?
4. Try changing status filter to "All Contacts"

### Contacts Not Moving
**Check:**
1. Is the contact actually "Not Started"?
2. Is the HeyReach API key valid?
3. Does the target list exist?
4. Check browser console for errors

### Data Not Refreshing
1. Click "Refresh HeyReach Data" button
2. Clear browser cache
3. Check Railway logs for API errors

## Technical Details

### Contact Matching Logic
Contacts are matched between reporting system and HeyReach by:
1. LinkedIn URL (exact match)
2. Email address (case-insensitive match)
3. Name matching (fallback)

### Performance
- Queries are paginated (1000 contacts max per query)
- Data is cached during the session
- Bulk operations process sequentially (to avoid API rate limits)

### Security
- Requires valid HeyReach API key
- Only customers with `heyreachApiKey` field are shown
- All operations are logged in browser console

## Best Practices

### Before Moving Contacts
1. **Verify status**: Always confirm contacts are "Not Started"
2. **Check campaign goals**: Ensure the move aligns with campaign strategy
3. **Consider timing**: Move contacts before campaigns start
4. **Document changes**: Export CSV before and after for records

### After Moving Contacts
1. **Verify in HeyReach**: Check the HeyReach UI to confirm moves
2. **Update campaign settings**: Ensure new list is associated with correct campaign
3. **Monitor results**: Check that outreach begins as expected
4. **Export for records**: Keep CSV of the rebalanced contacts

### Regular Cleanup Schedule
- **Weekly**: Review "Not Started" contacts that are > 7 days old
- **Monthly**: Analyze list balance across BDRs
- **Quarterly**: Full audit of all HeyReach contacts vs reporting system

## Support

**Issues?**
- Check browser console for errors
- Review Railway logs: `https://railway.app/project/[project-id]/logs`
- Test HeyReach API: Use `debug-heyreach.html` page
- Check Firestore data: Firebase Console > `master_activity_log`

**Questions?**
- Review `REPORTING_SYSTEM_README.md` for reporting system details
- Review `HEYREACH_CONTACTS_README.md` for HeyReach integration details
- Review `HEYREACH_SYSTEM_OVERVIEW.md` for overall system architecture

---

## Quick Start Checklist

- [ ] Customer has `heyreachApiKey` configured in Firestore
- [ ] Reporting system has synced LinkedIn activities
- [ ] HeyReach campaigns are properly configured
- [ ] Lists are created in HeyReach
- [ ] Ready to rebalance contacts!

**Access the tool**: `https://[your-domain]/crm/heyreach_cleanup.html`

🎯 **Goal**: Efficiently rebalance contacts between BDRs while ensuring no active campaigns are disrupted!




