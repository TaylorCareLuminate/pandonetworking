# Activity Tracking Implementation Summary

## Overview
This document summarizes the implementation of follow-up message tracking and meeting scheduled tracking for the Cost/Revenue Tracking system.

## Implementation Date
February 12, 2026

## What Was Implemented

### 1. Follow-Up Message Tracking in `review_replies.html`

**Location**: Line ~3989 (after successful message send)

**What it does**: When a BDR sends a reply to a conversation, the system now automatically logs this activity to the `activity_tracking` collection in Firestore.

**Data captured**:
- Activity type: `follow_up_message`
- Reply message text and character count
- Contact information (name, company, LinkedIn URL)
- BDR information (email, auth email, account email)
- Conversation context (ID, source)
- Metadata (timestamp, who sent it)
- Source tracking: `review_replies_follow_up`

**Cost**: $2.20 per follow-up message (configurable)

---

### 2. Bulk Follow-Up Message Tracking in `review_replies.html`

**Location**: Line ~5717 (after each successful bulk message send)

**What it does**: When a BDR sends bulk messages to multiple contacts at once (Connected But No Reply feature), each message is tracked individually.

**Data captured**:
- Activity type: `bulk_follow_up_message`
- Reply message text (same for all in batch)
- Individual contact information for each recipient
- BDR information
- Routing information (direct message slot vs campaign queue)
- Bulk context (batch ID, total count)
- Source tracking: `review_replies_bulk_follow_up`

**Cost**: $1.60 per bulk follow-up message (configurable)

---

### 3. Meeting Scheduled Tracking in `review_replies.html`

**Location**: Line ~3501 (in `saveCategoryAuto` function)

**What it does**: When a BDR changes the response category of a conversation to "Scheduled", the system automatically logs this as a meeting scheduled event.

**Data captured**:
- Activity type: `meeting_scheduled`
- Status change: `scheduled`
- Contact information (name, company, LinkedIn URL)
- BDR information (email, auth email, account email)
- Conversation context (ID, source)
- Previous categories (for audit trail)
- Metadata (timestamp, who scheduled it)
- Source tracking: `review_replies_meeting_scheduled`

**Cost**: $40.00 per meeting scheduled (configurable)

---

### 4. Follow-Up Message Tracking in `company_review_replies.html`

**Location**: Line ~3589 (after successful message send)

**What it does**: Same as `review_replies.html` but for the company-specific review page.

**Data captured**: Same fields as above, with `tracking_source: 'company_review_replies.html'`

**Cost**: $2.20 per follow-up message (configurable)

---

### 5. Meeting Scheduled Tracking in `company_review_replies.html`

**Location**: Line ~3121 (in `saveCategoryAuto` function)

**What it does**: Same as `review_replies.html` but for the company-specific review page.

**Data captured**: Same fields as above, with `tracking_source: 'company_review_replies.html'`

**Cost**: $40.00 per meeting scheduled (configurable)

---

### 6. Cost/Revenue Tracking Page Updates

**File**: `cost_revenue_tracking.html`

**Changes made**:
1. Added query to load data from `activity_tracking` collection (line ~727)
2. Updated `categorizeActivities` function to process activity tracking data (line ~771)
3. Added support for mapping `activity_type` values:
   - `follow_up_message` → `follow_up_message` ($2.20)
   - `bulk_follow_up_message` → `bulk_follow_up_message` ($1.60)
   - `meeting_scheduled` → `meeting_scheduled` ($40.00)

**What it does**: The Cost/Revenue Tracking page now includes follow-up messages and meetings scheduled in its revenue calculations and reporting.

---

## Database Collection: `activity_tracking`

### Purpose
Central collection for tracking billable activities that happen outside of the initial message generation flow.

### Document Structure

```javascript
{
  // Activity identification
  activity_type: 'follow_up_message' | 'bulk_follow_up_message' | 'meeting_scheduled',
  reply_type: 'follow_up', // For message types
  is_bulk_reply: boolean,   // For message types
  status_change: 'scheduled', // For meeting scheduled
  
  // Message details (for follow-up messages)
  reply_message: string,
  reply_character_count: number,
  
  // Contact information
  contact_name: string,
  contact_first_name: string,
  contact_last_name: string,
  contact_company: string,
  contact_linkedin_url: string,
  
  // BDR information
  bdr_email: string,
  bdr_auth_email: string,
  account_email: string,
  
  // Context
  conversation_id: string,
  original_conversation_source: string,
  
  // Metadata
  replied_by: string,       // For follow-ups
  scheduled_by: string,     // For meetings
  replied_at: Date,         // For follow-ups
  scheduled_at: Date,       // For meetings
  created_at: Date,
  timestamp: Date,
  
  // Source tracking
  source: string,           // e.g., 'review_replies_follow_up'
  tracking_source: string,  // e.g., 'review_replies.html'
  
  // Additional context
  customer_id: string,
  
  // For bulk messages
  bulk_send_session_id: string,
  total_in_batch: number,
  routed_via: 'direct_message_slot' | 'campaign_queue',
  scheduled_time: string,
  
  // For meetings
  previous_response_category: string,
  previous_followup_category: string
}
```

---

## How It Works

### Follow-Up Message Flow
1. BDR types a reply in `review_replies.html` or `company_review_replies.html`
2. BDR clicks "Send Reply" button
3. Message is sent via API to HeyReach
4. **NEW**: System saves tracking record to `activity_tracking` collection
5. Message appears in conversation thread
6. Cost/Revenue Tracking page includes this activity in reports

### Bulk Follow-Up Message Flow
1. BDR selects multiple contacts in "Connected But No Reply" section
2. BDR composes a message and clicks "Schedule Messages"
3. System routes each message (direct or campaign)
4. **NEW**: System saves tracking record for EACH contact to `activity_tracking`
5. Messages are scheduled/queued
6. Cost/Revenue Tracking page includes all activities in reports

### Meeting Scheduled Flow
1. BDR reviews a conversation in `review_replies.html` or `company_review_replies.html`
2. BDR changes "Response Category" dropdown to "Scheduled"
3. Category change is saved to conversation document
4. **NEW**: System saves tracking record to `activity_tracking` collection
5. Grid updates to reflect new categorization
6. Cost/Revenue Tracking page includes this $40 event in reports

---

## Testing Checklist

### Follow-Up Messages
- [ ] Send a reply in `review_replies.html`
- [ ] Check Firestore `activity_tracking` collection for new document
- [ ] Verify `activity_type` is `follow_up_message`
- [ ] Verify `source` is `review_replies_follow_up`
- [ ] Check Cost/Revenue Tracking page shows $2.20 revenue
- [ ] Repeat for `company_review_replies.html`

### Bulk Follow-Up Messages
- [ ] Select 3+ contacts in Connected But No Reply section
- [ ] Send bulk message
- [ ] Check Firestore `activity_tracking` collection for 3+ new documents
- [ ] Verify `activity_type` is `bulk_follow_up_message`
- [ ] Verify each has `bulk_send_session_id`
- [ ] Check Cost/Revenue Tracking page shows $1.60 × count

### Meeting Scheduled
- [ ] Open a conversation in `review_replies.html`
- [ ] Change Response Category to "Scheduled"
- [ ] Check Firestore `activity_tracking` collection for new document
- [ ] Verify `activity_type` is `meeting_scheduled`
- [ ] Verify `source` is `review_replies_meeting_scheduled`
- [ ] Check Cost/Revenue Tracking page shows $40.00 revenue
- [ ] Repeat for `company_review_replies.html`

### Cost/Revenue Tracking Page
- [ ] Navigate to Cost/Revenue Tracking page
- [ ] Verify "Follow Up Messages" appears in activity breakdown
- [ ] Verify "Bulk Follow Up Messages" appears in activity breakdown
- [ ] Verify "Meeting Scheduled" appears in activity breakdown
- [ ] Test BDR filter with activities
- [ ] Test date range filter with activities
- [ ] Test company filter with activities
- [ ] Export CSV and verify new activity types are included

---

## Revenue Summary

| Activity Type | Cost | Source |
|--------------|------|--------|
| Follow-Up Message | $2.20 | `review_replies.html`, `company_review_replies.html` |
| Bulk Follow-Up Message | $1.60 | `review_replies.html` (bulk send) |
| Meeting Scheduled | $40.00 | Status change in review pages |

---

## Error Handling

All tracking implementations use try-catch blocks to ensure that:
1. Tracking failures are logged but don't block the main action
2. Users still see success messages even if tracking fails
3. Console logs indicate when tracking succeeds or fails

Example:
```javascript
try {
    // Save tracking data
    await addDoc(collection(emailDB, 'activity_tracking'), trackingData);
    console.log('✅ Activity tracked for cost/revenue reporting');
} catch (trackingError) {
    console.error('⚠️ Error tracking activity:', trackingError);
    // Non-fatal - main action succeeded
}
```

---

## Next Steps

### High Priority
1. **Test all tracking** - Use the checklist above to verify everything works
2. **Monitor Firestore** - Check that `activity_tracking` collection is being populated correctly
3. **Verify reporting** - Ensure Cost/Revenue Tracking page displays new activities

### Medium Priority
1. **Add more activity types** - Consider tracking other billable activities
2. **Bulk edit tracking** - Add tracking for category changes applied to multiple conversations
3. **Historical data** - Consider backfilling data if needed

### Low Priority
1. **Analytics dashboard** - Create dedicated dashboard for activity tracking trends
2. **Automated reports** - Generate weekly/monthly reports automatically
3. **Activity alerts** - Notify admins of high-value activities (e.g., meetings scheduled)

---

## Files Modified

1. `c:\repos\HealthLuminateSiteFromLocal\connect\review_replies.html`
   - Added follow-up message tracking (line ~3989)
   - Added bulk follow-up message tracking (line ~5717)
   - Added meeting scheduled tracking (line ~3501)

2. `c:\repos\HealthLuminateSiteFromLocal\connect\company_review_replies.html`
   - Added follow-up message tracking (line ~3589)
   - Added meeting scheduled tracking (line ~3121)

3. `c:\repos\HealthLuminateSiteFromLocal\connect\cost_revenue_tracking.html`
   - Added `activity_tracking` collection query (line ~727)
   - Updated `categorizeActivities` function (line ~771)
   - Added support for new activity types

---

## Support

If you encounter issues:
1. Check browser console for error messages
2. Verify Firestore rules allow writes to `activity_tracking`
3. Check that BDR email fields are populated correctly
4. Review the error handling console logs

## Notes

- All timestamps are stored as JavaScript Date objects
- The `is_bulk_reply` flag helps distinguish individual vs bulk follow-ups
- Previous category fields in meeting scheduled events provide audit trail
- Source tracking fields help identify which page generated the activity
