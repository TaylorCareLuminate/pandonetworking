# Message Source Tracking Audit
## Date: 2026-02-12

This document audits all message sources in the HealthConnect platform to ensure proper tracking for Cost/Revenue reporting.

## Current Tracking Status

### ✅ ALREADY TRACKED

#### 1. **Profile Messages** (`generate_messages.html`)
- **Field**: `generated_via: 'profile_messages'`
- **Location**: Line ~4564
- **Cost**: $0.80 (profile_message)
- **Status**: ✅ Properly tracked

#### 2. **Fast Prospect Messaging** (`fast_prospect_message.html`)
- **Fields**: 
  - `generated_via: 'fast_prospect_messaging'`
  - `approvalMethod: 'fast_prospect_messaging_queue2'` or `'fast_prospect_messaging_live'`
- **Location**: Lines ~997, 1000, 1132
- **Cost**: $1.00 (bulk_group_message)
- **Status**: ✅ Properly tracked

#### 3. **Mass Upload** (`mass_upload.html`)
- **Fields**:
  - `uploadedVia: 'mass_upload'` (bulk uploads)
  - `uploadedVia: 'mass_upload_single'` (single contact mode)
- **Location**: Lines ~1059, 2006
- **Costs**: 
  - Mass upload: $1.30 (mass_upload_message)
  - Single contact: $1.40 (single_contact_message)
- **Status**: ✅ Properly tracked

### ⚠️ NEEDS INVESTIGATION

#### 4. **LinkedIn Post Replies** (`generate_messages.html`)
- **Expected field**: `generated_via: 'linkedin_post_reply'` or similar
- **Current Status**: Need to search for LinkedIn post scanning functionality
- **Cost**: $3.40 (linkedin_post_message)
- **Action Required**: Search for post scraping and reply generation code

#### 5. **Internet Search Messages** (`generate_messages.html`)
- **Expected field**: `generated_via: 'internet_search'`
- **Current Status**: Need to search for internet search functionality
- **Cost**: $1.10 (internet_search_message)
- **Action Required**: Search for internet search message generation

#### 6. **Follow-Up Messages** (`review_replies.html`, `company_review_replies.html`)
- **Expected fields**: 
  - `reply_type: 'follow_up'`
  - `is_bulk_reply: true/false`
- **Costs**:
  - Individual follow-up: $2.20 (follow_up_message)
  - Bulk follow-up: $1.60 (bulk_follow_up_message)
- **Current Status**: Need to check reply tracking in review pages
- **Action Required**: Verify reply data is being tracked with proper source labels

### 🔍 HEYREACH WEBHOOK TRACKING

#### 7. **HeyReach Activities** (`heyreach_activity` collection)
These are already tracked via webhooks. The following event types map to billable activities:

- **LIKED_POST** → `post_like` ($0.35)
- **VIEWED_PROFILE** → `profile_view` ($0.35)
- **CONNECTION_REQUEST_ACCEPTED** → `successful_connection` ($1.00)

**Fields to check**:
- `bdrEmail` or `linkedInAccountEmail` - identifies the BDR
- `eventType` - the activity type
- `leadCompany` - the prospect's company
- `leadFirstName`, `leadLastName` - the prospect's name

**Status**: ✅ Webhook structure analyzed (from heyreach_activity.html)

### 📋 MEETING SCHEDULED TRACKING

#### 8. **Meeting Scheduled Status** (`review_replies.html`, `company_review_replies.html`)
- **Expected field**: Status marked as 'scheduled' or similar
- **Cost**: $40.00 (meeting_scheduled) 
- **Current Status**: Need to verify how meeting scheduling is tracked
- **Action Required**: Check if replies can be marked as "meeting scheduled"

## Required Database Fields for Tracking

All messages in `connect_queue` should have at minimum:

```javascript
{
  // Source tracking (ONE of these should be present)
  generated_via: string,      // Primary tracking field
  uploadedVia: string,        // For mass uploads
  source: string,             // Legacy field
  
  // BDR identification
  bdr_auth_email: string,     // The BDR's authentication email
  account_email: string,      // LinkedIn account email
  bdr_name: string,           // BDR's full name
  
  // Contact/Company info
  prospect_company: string,
  prospect_name: string,
  
  // Timestamps
  generated_at: timestamp,
  created_at: timestamp,
  uploaded_date: timestamp
}
```

## Next Steps

1. ✅ **DONE**: Created cost_revenue_tracking.html page
2. ✅ **DONE**: Added to admin navigation
3. ✅ **DONE**: Added to index_admin.html
4. **TODO**: Search generate_messages.html for LinkedIn post and internet search tracking
5. **TODO**: Check review_replies.html for follow-up message tracking
6. **TODO**: Verify meeting scheduled tracking
7. **TODO**: Add tracking fields where missing
8. **TODO**: Test the cost/revenue tracking page with real data

## Cost/Revenue Calculation Logic

The `cost_revenue_tracking.html` page uses the following logic:

```javascript
// Message sources from connect_queue
if (source.includes('linkedin_post')) → linkedin_post_message ($3.40)
if (source.includes('internet_search')) → internet_search_message ($1.10)
if (source.includes('profile_message')) → profile_message ($0.80)
if (source.includes('fast_prospect_messaging')) → bulk_group_message ($1.00)
if (source.includes('mass_upload') && !single) → mass_upload_message ($1.30)
if (source.includes('single')) → single_contact_message ($1.40)

// HeyReach activities from heyreach_activity
if (eventType === 'LIKED_POST') → post_like ($0.35)
if (eventType === 'VIEWED_PROFILE') → profile_view ($0.35)
if (eventType === 'CONNECTION_REQUEST_ACCEPTED') → successful_connection ($1.00)

// Follow-ups (to be implemented)
if (reply_type === 'follow_up' && !bulk) → follow_up_message ($2.20)
if (reply_type === 'follow_up' && bulk) → bulk_follow_up_message ($1.60)

// Meetings (to be implemented)
if (status === 'scheduled' || meeting_scheduled) → meeting_scheduled ($40.00)
```

## Database Collections Used

1. **connect_queue** - All generated/uploaded messages
2. **heyreach_activity** - All HeyReach webhook events
3. **[future]** reply_tracking - Follow-up messages and meeting scheduling
4. **settings/cost_revenue_tracking** - Adjustable cost settings

## Important Notes

- **WE ONLY BILL FOR ACTIVITIES WE DID**: Need to cross-check HeyReach activities against our outreach records
- **Check HeyReach webhook data** for `linkedInAccountId` or `linkedInAccountEmail` to verify it's our BDR
- All costs are adjustable via the Cost Settings interface
- Reports can be filtered by BDR, Company, and Date Range
- Export to CSV is available for external analysis
