# Smart Email Rescheduler - User Guide

## Overview

The Smart Email Rescheduler is a powerful **slot-based** tool designed to intelligently reschedule failed emails using pre-generated slots from your `slot_calendar`. It integrates seamlessly with your multi-channel outreach system to ensure coordinated email, LinkedIn, and phone touches.

### 🎯 Slot-Based Scheduling

**NEW:** The rescheduler now uses the **slot_calendar system** for all scheduling:
- Loads available email slots from `slot_calendar` collection
- Assigns failed emails to available slots
- Updates both `scheduledEmails` and `slot_calendar` when rescheduling
- Ensures coordination across all outreach channels

**⚠️ IMPORTANT:** You must have available slots in `slot_calendar` before using this tool. Generate slots using [`slot_calendar.html`](slot_calendar.html).

For detailed information about the slot integration, see [RESCHEDULE_SLOT_INTEGRATION.md](RESCHEDULE_SLOT_INTEGRATION.md).

## Features

### ✅ Intelligent Scheduling Algorithm
- **Hourly Limits**: Ensures no more than X emails per hour (default: 10)
- **Daily Limits**: Respects maximum emails per day (default: 100)
- **Domain Limits**: Prevents sending too many emails to the same domain per day (default: 2)
- **Sending Hours**: Only schedules within configured business hours (default: 9 AM - 5 PM)
- **Weekend Avoidance**: Automatically skips weekends
- **Conflict Detection**: Analyzes existing scheduled emails to avoid overloading

### 📊 Comprehensive Statistics
- Total failed emails count
- Failed due to rate limits
- Failed due to thread errors
- Number of selected emails for rescheduling

### 🎯 Smart Email Selection
- Filter by failure type:
  - Rate limit failures
  - Thread/reference errors
  - Other errors
- Select/deselect individual emails
- Bulk select all or deselect all
- Visual indicators for selected emails

### 📅 Visual Schedule Preview
- Timeline view showing proposed schedule
- Day-by-day breakdown
- Hour-by-hour slot distribution
- Domain distribution per day
- Constraint utilization indicators

### 🔧 Configurable Constraints
- Adjust max emails per hour
- Adjust max emails per day
- Adjust max emails per domain per day
- Configure sending hours (start/end time)
- Set start date for rescheduling

## How to Use

### Step 0: Generate Slots (Prerequisites)
**⚠️ Do this FIRST, before attempting to reschedule!**

1. Navigate to `/crm/slot_calendar.html`
2. Select a date range (e.g., next 30 days)
3. Click "Generate Slots" for your email accounts
4. Verify slots appear in the calendar (green = available)

Without available slots, the rescheduler **cannot schedule any emails**!

### Step 1: Access the Tool
Navigate to: `/crm/reschedule_failed_emails.html`

**Note**: This tool requires admin access (healthluminate.com or careluminate.com email).

### Step 2: Review System Constraints
The tool automatically loads system constraints from Firebase (`emailSettings` and `emailAccounts` collections):

**These constraints are READ-ONLY and loaded from your system configuration:**

1. **Max Emails Per Hour**: Hourly sending limit (prevents rate limiting)
2. **Max Emails Per Day**: Daily sending limit
3. **Max Per Domain Per Day**: Prevents sending too many emails to same domain
4. **Sending Hours**: Business hours window (e.g., 9 AM - 5 PM)
5. **Start Scheduling From**: First available date for rescheduling (default: tomorrow)

### Step 3: Load Failed Emails
1. Click **"Load Failed Emails"** button
2. The system will:
   - Load all emails with status = 'failed'
   - Load all currently scheduled emails (to check for conflicts)
   - Display statistics and email list

### Step 4: Select Emails to Reschedule
You can select emails in multiple ways:

- **Click on email rows** to toggle selection
- **Click checkboxes** to select individual emails
- **"Select All"** button to select all visible emails
- **"Deselect All"** button to clear selection
- **Use filters** to show only specific failure types

### Step 5: Calculate Optimal Schedule
1. Ensure emails are selected
2. Click **"Calculate Optimal Schedule"**
3. The **slot-based algorithm** will:
   - Load available email slots from `slot_calendar`
   - Group emails by recipient for sequence awareness
   - For each email, find the first available slot that:
     - Is after the required minimum date (for sequence timing)
     - Doesn't exceed domain limits for that day
     - Isn't on a holiday
     - Hasn't been assigned already
   - Assign emails to slots
   - Build a day-by-day timeline with slot assignments

### Step 6: Review Schedule Preview
The timeline shows:
- **Each day** with scheduled emails
- **Time slots** for each email (from slot_calendar)
- **Recipient email addresses**
- **Domain distribution** and utilization
- 📧 **Sequence badge** for follow-up emails (e.g., "#2 in sequence")
- 🎯 **Slot badge** showing the assigned slot ID

**Scheduling Summary Panel:**
- Emails Scheduled vs. Selected
- Slots Used count
- Slots Available count
- Warnings if not all emails could be scheduled

**Review carefully!** Make sure:
- Dates look reasonable
- Sequence emails have proper spacing (based on campaign)
- Domain distribution is spread out
- All selected emails were scheduled (if not, generate more slots!)

### Step 7: Apply Rescheduling
1. Click **"Apply Rescheduling"**
2. Confirm the action
3. The system will **update TWO collections**:

**scheduledEmails collection:**
   - Update each email's `status` to 'scheduled'
   - Set new `sendAt` timestamp to match the slot time
   - Add `slotId` and `accountId` references
   - Clear error fields
   - Add rescheduling metadata (who, when, original failure reason)

**slot_calendar collection:**
   - Mark assigned slots as `status: 'assigned'`
   - Link slot to the scheduled email (`assignedScheduledEmailId`)
   - Link slot to outreach set (`assignedOutreachSetId`)
   - Record assignment metadata (who, when)

4. Progress bar shows completion
5. Success message confirms rescheduling **and slot assignments**
6. Page automatically reloads after 3 seconds

## Understanding Failure Types

### Rate Limit Failures (Yellow Badge)
- Errors containing "limit", "quota", "too many"
- **Cause**: Exceeded hourly or daily sending limits
- **Solution**: Reschedule with proper spacing

### Thread Errors (Red Badge)
- Errors like "Cannot send Re: email without original email"
- **Cause**: Follow-up email missing reference to original email
- **Solution**: 
  - First reschedule the original email (if also failed)
  - Then reschedule follow-ups after originals
  - OR use the `fix_scheduled_emails.html` tool to fix references

### Other Errors (Gray Badge)
- SMTP errors, connection issues, authentication failures
- **Cause**: Various technical issues
- **Solution**: 
  - Check if issue is resolved (credentials, network)
  - May need manual intervention before rescheduling

## How the Algorithm Works

### 1. Load Existing Schedule
```javascript
- Queries all scheduled emails with status 'scheduled' or 'pending'
- Builds a schedule map showing:
  - Hourly counts per day
  - Domain counts per day
  - Total emails per day
```

### 2. Sort Emails for Optimal Scheduling
```javascript
- Non-threaded emails first (can send independently)
- Threaded follow-ups later (depend on parent emails)
```

### 3. Find Available Slots
For each email:
```javascript
1. Start from configured start date
2. Check if current hour/day meets constraints:
   - Hour capacity not exceeded
   - Day capacity not exceeded
   - Domain limit not exceeded
   - Within sending hours
   - Not a weekend
3. If slot is good, schedule email and update counts
4. If not, move to next hour
5. If past sending hours, move to next day
6. Repeat until slot found or max attempts reached
```

### 4. Smart Spacing
- Moves forward 1 hour after each scheduled email
- Prevents clustering multiple emails in same hour
- Naturally spreads emails across the day

## Best Practices

### ⚠️ Before Rescheduling Thread Errors

If many emails failed due to missing thread content:

1. **First**, run `/crm/fix_scheduled_emails.html` to:
   - Link follow-ups to their original emails
   - Clean up pre-built threads
   - Ensure proper threading references

2. **Then**, use this rescheduler for:
   - Original emails that failed (no thread dependency)
   - Fixed follow-ups that need new send times

### 📅 Scheduling Tips

1. **Start Date**: Choose tomorrow or later to avoid same-day rushes
2. **Domain Limits**: Keep at 2 per day to maintain good sender reputation
3. **Hourly Limits**: Set conservatively (10-15) to avoid rate limiting
4. **Sending Hours**: Match recipient timezone (e.g., 9 AM - 5 PM their time)
5. **Review Timeline**: Always review before applying - look for clustering

### 🔍 Monitoring After Rescheduling

1. Check `/crm/email_queue.html` to see rescheduled emails
2. Monitor `/crm/email_error_monitor.html` for any new failures
3. Watch for patterns - if same emails fail again, investigate deeper

## Troubleshooting

### "Could not schedule any emails"
**Causes**:
- Constraints too strict (hourly/daily limits too low)
- Start date too far in future
- All time slots already full

**Solutions**:
- Increase limits (if safe)
- Choose earlier start date
- Cancel some existing scheduled emails if no longer needed

### "Some emails failed to reschedule"
**Causes**:
- Firebase permission errors
- Network issues
- Email document locked

**Solutions**:
- Check browser console for specific errors
- Retry the rescheduling
- Manually update problem emails in Firebase

### Thread errors persist after rescheduling
**Cause**: Follow-up emails still missing proper references

**Solution**:
1. Run `/crm/fix_scheduled_emails.html` first
2. Then reschedule

## Technical Details

### Firebase Integration
- **Project**: CLEmail
- **Collection**: `scheduledEmails`
- **Updates**: 
  - `status`: 'scheduled'
  - `sendAt`: new Date
  - `error`: null
  - `failedAt`: null
  - `failureReason`: null
  - `rescheduledAt`: timestamp
  - `rescheduledBy`: user email
  - `originalFailureReason`: preserved for reference

### Constraints Checked
```javascript
{
  hourConstraint: emailsThisHour < maxPerHour,
  dayConstraint: emailsToday < maxPerDay,
  domainConstraint: emailsToDomainToday < maxPerDomain,
  timeConstraint: currentHour >= startHour && currentHour < endHour,
  weekdayConstraint: dayOfWeek !== 0 && dayOfWeek !== 6
}
```

### Performance
- Loads all failed emails (typically 10-100)
- Loads all scheduled emails (typically 1000-5000)
- Calculation time: 1-3 seconds for 50 emails
- Update time: 2-5 seconds for 50 emails

## Security

- **Authentication Required**: HealthLuminate/CareLuminate domain only
- **Firebase Security Rules**: Respects Firestore security
- **Audit Trail**: All reschedules logged with user email and timestamp

## Related Tools

- **`/crm/email_error_monitor.html`**: View and retry thread failures
- **`/crm/fix_scheduled_emails.html`**: Fix thread references
- **`/crm/email_queue.html`**: View all scheduled emails
- **`/crm/email_analytics.html`**: Email sending analytics

## Support

For issues or questions:
1. Check browser console for errors
2. Review Firebase security rules
3. Verify email account settings in `/admin/email_controls.html`
4. Contact Taylor Davis (taylordavis@careluminate.com)

---

**Version**: 1.0  
**Created**: October 31, 2025  
**Author**: AI Assistant  
**Maintainer**: HealthLuminate Team

