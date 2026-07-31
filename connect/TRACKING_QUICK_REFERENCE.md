# Activity Tracking - Quick Reference

## ✅ What's Now Being Tracked

### 1. Follow-Up Messages ($2.20 each)
- **Where**: When BDRs reply to conversations in Review Replies or Company Review Replies
- **Logged to**: `activity_tracking` collection in Firestore
- **Shows in**: Cost/Revenue Tracking page

### 2. Bulk Follow-Up Messages ($1.60 each)
- **Where**: When BDRs send messages to multiple contacts at once (Connected But No Reply)
- **Logged to**: `activity_tracking` collection in Firestore
- **Shows in**: Cost/Revenue Tracking page

### 3. Meeting Scheduled ($40.00 each)
- **Where**: When BDRs change conversation status to "Scheduled" in Review Replies
- **Logged to**: `activity_tracking` collection in Firestore
- **Shows in**: Cost/Revenue Tracking page

---

## 🎯 How to Use

### As a BDR:
1. **Reply to conversations** - Just click "Send Reply" as usual. The system tracks it automatically.
2. **Send bulk messages** - Select contacts and send. Each one is tracked individually.
3. **Mark meetings scheduled** - Change the dropdown to "Scheduled". The $40 is logged automatically.

### As an Admin:
1. Go to **Cost/Revenue Tracking** page
2. Select date range and/or BDR
3. View revenue broken down by activity type
4. Export to CSV for client billing

---

## 📊 New Activity Types in Reports

When you view the Cost/Revenue Tracking page, you'll now see:
- **Follow Up Message** - Individual replies ($2.20)
- **Bulk Follow Up Message** - Mass replies ($1.60)
- **Meeting Scheduled** - Status changes ($40.00)

These appear alongside existing activities like:
- LinkedIn Post Message
- Internet Search Message
- Profile Message
- Post Likes
- Profile Views
- Successful Connections

---

## 🔍 Viewing Tracked Data

### In Firestore (for debugging):
1. Open Firebase Console
2. Navigate to `activity_tracking` collection
3. Look for documents with:
   - `activity_type: 'follow_up_message'`
   - `activity_type: 'bulk_follow_up_message'`
   - `activity_type: 'meeting_scheduled'`

### In Cost/Revenue Tracking Page:
1. Open Cost/Revenue Tracking
2. Click "Load Data"
3. Scroll to "Detailed Activity Report"
4. Filter by BDR, Company, or Date Range
5. Export to CSV if needed

---

## 🚨 Troubleshooting

### "Activity not showing in reports"
1. Check that the activity date is within your selected date range
2. Check that the BDR filter matches
3. Click "Load Data" to refresh
4. Check browser console for errors

### "Missing BDR information"
- Verify the BDR's email is correctly set in their profile
- Check that `bdr_auth_email` is populated in the conversation

### "Duplicate tracking"
- This shouldn't happen, but if it does, check the timestamps
- Each activity should have a unique `created_at` timestamp

---

## 💡 Tips

1. **Costs are adjustable** - Go to Cost/Revenue Tracking and click "Adjust Costs" to change pricing
2. **Track by company** - Use the company filter to see all activities for a specific client
3. **Export for billing** - Use the CSV export to create client invoices
4. **Monitor trends** - Track which BDRs generate the most meetings scheduled

---

## 📝 What Changed

### Files Modified:
- `review_replies.html` - Added tracking for replies and meetings
- `company_review_replies.html` - Added tracking for replies and meetings  
- `cost_revenue_tracking.html` - Updated to read from `activity_tracking` collection

### Database:
- New collection: `activity_tracking`
- Stores all follow-up messages and meeting scheduled events

### No Breaking Changes:
- Everything works the same from the user's perspective
- Tracking happens silently in the background
- If tracking fails, the main action (send message, mark scheduled) still succeeds

---

## ✨ Benefits

1. **Complete billing picture** - No more manual tracking of follow-ups
2. **Accurate revenue** - Capture high-value activities like meetings scheduled ($40)
3. **By BDR & Company** - See exactly who's generating value
4. **Audit trail** - Full history of all billable activities
5. **No extra work** - Everything is automatic

---

## 🎉 You're Done!

No additional setup needed. The tracking is now live and working automatically. Just use Review Replies as normal and check the Cost/Revenue Tracking page to see your activities rolling in!
