# Email Rescheduler - Slot Calendar Integration

## Overview

The Smart Email Rescheduler has been **fully integrated with the slot_calendar system** to provide coordinated, multi-channel outreach scheduling. Instead of calculating arbitrary time slots, the rescheduler now uses pre-generated slots from the `slot_calendar` collection, ensuring proper coordination across email, LinkedIn, and phone channels.

## What Changed

### Before: Direct Time Calculation
Previously, the rescheduler would:
- Calculate available time slots on the fly
- Directly set `sendAt` timestamps
- Work independently of other scheduling systems

### After: Slot-Based Assignment
Now, the rescheduler:
- **Loads available slots** from `slot_calendar` collection
- **Filters slots** based on constraints (date, domain limits, holidays, sequence timing)
- **Assigns emails to slots** and marks them as 'assigned'
- **Updates both collections**: `scheduledEmails` AND `slot_calendar`

## How It Works

### 1. **Slot Loading**
When the page loads, it fetches all available email slots:

```javascript
const slotsQuery = query(
    collection(firestoreDb, 'slot_calendar'),
    where('channelType', '==', 'email'),
    where('status', '==', 'available')
);
```

Only **future slots** are loaded, sorted by scheduled time.

### 2. **Slot Filtering**
During scheduling, each email is matched against available slots with these checks:
- ✅ Slot not already used
- ✅ Slot is after minimum start date (for sequence timing)
- ✅ Domain limit not exceeded for that day
- ✅ Not on a holiday

### 3. **Slot Assignment**
When a suitable slot is found:

**scheduledEmails document updated:**
```javascript
{
    status: 'scheduled',
    sendAt: slot.scheduledTime,
    slotId: slot.id,
    accountId: slot.accountId,
    rescheduledAt: new Date(),
    rescheduledBy: currentUser.email
}
```

**slot_calendar document updated:**
```javascript
{
    status: 'assigned',
    assignedScheduledEmailId: email.id,
    assignedOutreachSetId: outreachSet.id,
    assignedAt: new Date(),
    assignedBy: currentUser.email
}
```

### 4. **Campaign Sequence Timing**
The slot assignment still respects campaign sequences:
- Emails to the same contact are processed in order (by `followUpNumber`)
- Minimum days between emails are calculated from campaign steps
- Only slots **after** the minimum date are considered

## UI Enhancements

### Visual Indicators
Each scheduled email in the timeline now shows:
- 📧 **Sequence badge** for follow-up emails
- 🎯 **Slot badge** showing the assigned slot ID

### Scheduling Summary
A comprehensive summary panel displays:
- **Emails Scheduled** vs. Selected
- **Slots Used** count
- **Slots Available** count
- ⚠️ Warning if not all emails could be scheduled

### Error Messages
If no slots are available:
```
⚠️ No Available Slots Found!
Please generate email slots first using the Slot Calendar Manager.
```

## Prerequisites

### ⚠️ IMPORTANT: Generate Slots First!

Before using the rescheduler, you **must** have available slots in the `slot_calendar` collection:

1. **Open** [`slot_calendar.html`](slot_calendar.html)
2. **Select date range** (e.g., next 30 days)
3. **Generate slots** for your email accounts
4. **Verify** slots appear in the calendar

Without slots, the rescheduler **cannot schedule any emails**.

## Database Schema

### slot_calendar Collection
```javascript
{
    id: "auto-generated",
    accountId: "email_account_id",
    customerId: "customer_id",
    channelType: "email",
    scheduledTime: Timestamp,
    dayOfWeek: 1-5,  // Monday-Friday
    isWorkday: true,
    isHoliday: false,
    status: "available" | "assigned" | "sent" | "cancelled",
    assignedScheduledEmailId: "scheduled_email_id" | null,
    assignedOutreachSetId: "outreach_set_id" | null,
    assignedAt: Timestamp | null,
    assignedBy: "user_email" | null,
    createdAt: Timestamp,
    createdBy: "system"
}
```

### scheduledEmails Collection (Updated Fields)
```javascript
{
    // ... existing fields ...
    slotId: "slot_calendar_id" | null,
    accountId: "email_account_id" | null,
    rescheduledAt: Timestamp,
    rescheduledBy: "user_email"
}
```

## Benefits

### 🎯 **Coordinated Outreach**
- Email, LinkedIn, and phone touches are now coordinated through a unified slot system
- Prevents overwhelming prospects with simultaneous multi-channel contacts

### 📊 **Better Resource Management**
- Pre-generated slots ensure capacity planning
- Easy to visualize and manage outreach volume

### 🔄 **Consistency**
- All scheduling (initial, follow-ups, reschedules) uses the same slot system
- Centralized slot management in `slot_calendar.html`

### 🚀 **Scalability**
- Can generate slots days/weeks in advance
- Easy to adjust capacity by generating more slots

## Workflow

### Standard Rescheduling Process

1. **Generate Slots** (do this periodically, e.g., weekly)
   - Go to `slot_calendar.html`
   - Generate slots for desired date range
   - Slots are created based on:
     - Email account settings
     - Sending hours (e.g., 9 AM - 5 PM)
     - Workdays only
     - Holiday calendar

2. **Load Failed Emails**
   - Go to `reschedule_failed_emails.html`
   - Failed emails are automatically loaded
   - Available slots are loaded

3. **Select & Calculate**
   - Select emails to reschedule
   - Click "Calculate Optimal Schedule"
   - System matches emails to available slots

4. **Review & Apply**
   - Review the proposed schedule
   - Check slot assignments
   - Click "Apply Rescheduling"
   - Both `scheduledEmails` and `slot_calendar` are updated

## Troubleshooting

### Problem: "No Available Slots Found"
**Solution:** Generate slots in `slot_calendar.html` for your desired date range.

### Problem: Not all emails scheduled
**Causes:**
- Insufficient available slots
- Domain limits already reached for available slot dates
- Sequence timing requires future dates beyond available slots
- Holidays blocking available slots

**Solutions:**
- Generate more slots in `slot_calendar.html`
- Extend the date range for slot generation
- Review domain limits (max 2 per domain per day)
- Check holiday calendar for conflicts

### Problem: Slot assigned but email still fails
**Cause:** The rescheduling succeeded, but the email sending failed later.

**Solution:** Re-run the rescheduler. The system will:
- Load new available slots
- Find a new slot for the failed email
- Update assignments

## Technical Notes

### Slot Reuse
- Once a slot is marked as `assigned`, it will not be reused
- If an email fails after being assigned a slot, that slot remains assigned to that email
- When rescheduling again, a **new slot** must be assigned

### Slot Availability
- Slots are created with `status: 'available'`
- After assignment: `status: 'assigned'`
- After sending: `status: 'sent'` (handled by email sending system)
- If cancelled: `status: 'cancelled'`

### Performance
- Loading slots is done **once** at page load
- Slot filtering is done in-memory (fast)
- Only Firestore writes happen during "Apply Rescheduling"

## Future Enhancements

Potential improvements:
- [ ] Auto-generate slots if none available
- [ ] Slot reservation system (temporary holds)
- [ ] Slot recycling (reuse cancelled/failed slots)
- [ ] Multi-account slot distribution visualization
- [ ] Slot capacity forecasting

## Related Files

- **`reschedule_failed_emails.html`** - Main rescheduler (updated with slot integration)
- **`slot_calendar.html`** - Slot generation and management tool
- **`scheduledEmails`** collection - Email scheduling data
- **`slot_calendar`** collection - Centralized slot management
- **`outreach_sets`** collection - Prospect tracking with slot references

## Summary

The slot-based integration transforms the rescheduler from a standalone tool into a **coordinated component** of a comprehensive multi-channel outreach system. By using pre-generated slots from `slot_calendar`, you ensure:

✅ Proper capacity planning  
✅ Multi-channel coordination  
✅ Resource management  
✅ Campaign sequence timing  
✅ Domain and rate limit compliance  

**Remember:** Always ensure you have available slots in `slot_calendar` before attempting to reschedule emails!











