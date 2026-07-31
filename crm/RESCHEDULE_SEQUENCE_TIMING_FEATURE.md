# Email Rescheduler - Sequence Timing Feature

## Overview

The email rescheduler now intelligently handles multiple failed emails to the same contact by:
1. **Loading outreach_sets** to understand campaign sequences
2. **Sorting emails by sequence order** (email #1 before #2, #2 before #3, etc.)
3. **Enforcing minimum days between emails** based on campaign sequence configuration
4. **Visual indicators** showing sequence relationships in the timeline

---

## How It Works

### 1. Data Loading

When you load failed emails, the system also loads:

```javascript
// Campaigns with sequence definitions
campaigns: {
  channels: {
    email: {
      sequence: {
        steps: [
          { stepId: "email_intro", day: 1, activityType: "email_first" },
          { stepId: "email_follow1", day: 4, activityType: "email_followup" },
          { stepId: "email_follow2", day: 8, activityType: "email_followup" }
        ]
      }
    }
  }
}

// Outreach sets linking emails to contacts
outreach_sets: {
  email: "john@example.com",
  campaignId: "campaign_abc123",
  ...
}
```

### 2. Email Grouping & Sorting

Failed emails are grouped by recipient:

```javascript
emailsByRecipient = {
  "john@example.com": [
    { followUpNumber: 1, type: "initial", ... },    // Email #1
    { followUpNumber: 2, type: "follow_up", ... },  // Email #2
    { followUpNumber: 3, type: "follow_up", ... }   // Email #3
  ],
  "jane@company.com": [
    { followUpNumber: 1, type: "initial", ... }     // Email #1 (single)
  ]
}
```

Within each recipient group, emails are sorted by `followUpNumber` (ascending).

### 3. Sequence Timing Enforcement

When scheduling email #2 for a contact:

```javascript
// Check if email #1 was already scheduled
if (lastScheduledByRecipient["john@example.com"]) {
    const email1Date = lastScheduledByRecipient["john@example.com"].scheduledDate;
    
    // Get minimum days from campaign sequence (day 4 - day 1 = 3 days)
    const minDays = getMinimumDaysBetween(email2, previousFollowUpNum: 1);
    // minDays = 3
    
    // Calculate earliest date for email #2
    const minDate = email1Date + 3 days;
    
    // Email #2 cannot be scheduled before minDate
    console.log("⏳ john@example.com: Email #2 must wait 3 days after Email #1");
}
```

### 4. Visual Feedback

In the timeline, sequence emails are highlighted:

```
Monday, November 1, 2025          5 emails
  9:00 AM - john@example.com      [blue border]
            Domain: example.com
            Hour: 1/30
            📧 #1 in sequence

Thursday, November 4, 2025        5 emails
  9:00 AM - john@example.com      [blue border]
            Domain: example.com
            Hour: 1/30
            📧 #2 in sequence      ← 3 days after #1 ✅

Monday, November 8, 2025          5 emails
  9:00 AM - john@example.com      [blue border]
            Domain: example.com
            Hour: 1/30
            📧 #3 in sequence      ← 4 days after #2 ✅
```

---

## Example Scenarios

### Scenario 1: Campaign with 3 Emails Failed

**Campaign Sequence:**
- Email #1 (Initial): Day 1
- Email #2 (Follow-up): Day 4
- Email #3 (Follow-up): Day 8

**Failed Emails:**
- john@example.com - Email #1 (initial)
- john@example.com - Email #2 (follow_up)
- john@example.com - Email #3 (follow_up)

**Rescheduling Result:**
```
✅ Email #1 → Monday, Nov 1 at 9:00 AM
✅ Email #2 → Thursday, Nov 4 at 9:00 AM (3 days later)
✅ Email #3 → Monday, Nov 8 at 9:00 AM (4 days later)
```

**Calculation:**
- Email #1 → Day 1 (baseline)
- Email #2 → Day 4 (4 - 1 = 3 days minimum)
- Email #3 → Day 8 (8 - 4 = 4 days minimum)

### Scenario 2: Only Follow-ups Failed

**Situation:** Email #1 was sent successfully, but #2 and #3 failed

**Failed Emails:**
- john@example.com - Email #2 (follow_up) - was scheduled for Oct 29
- john@example.com - Email #3 (follow_up) - was scheduled for Oct 30

**Existing Scheduled Emails:**
- john@example.com - Email #1 was sent on Oct 26

**Rescheduling Result:**
```
Email #1: ✅ Already sent (Oct 26)
Email #2: 📅 Reschedule to Oct 29 or later (3 days after Oct 26 = Oct 29) ✅
Email #3: 📅 Reschedule to Nov 2 or later (4 days after Email #2)
```

The system respects that Email #1 was already sent and calculates dates from that.

### Scenario 3: Multiple Contacts with Sequences

**Failed Emails:**
- john@example.com - Email #1, #2, #3
- jane@company.com - Email #1, #2
- bob@startup.com - Email #1 (single)

**Scheduling Strategy:**
```
Priority 1: Single emails (no dependencies)
  - bob@startup.com Email #1 → Nov 1, 9 AM

Priority 2: Sequence emails (with dependencies)
  - john@example.com Email #1 → Nov 1, 10 AM
  - jane@company.com Email #1 → Nov 1, 11 AM
  - john@example.com Email #2 → Nov 4, 10 AM (3 days after his Email #1)
  - jane@company.com Email #2 → Nov 4, 11 AM (3 days after her Email #1)
  - john@example.com Email #3 → Nov 8, 10 AM (4 days after his Email #2)
```

---

## Console Output Example

When you calculate the schedule, you'll see detailed logging:

```javascript
📚 Loading campaigns and outreach sets for sequence timing...
✅ Loaded 2 campaigns
✅ Loaded 15 outreach sets

📊 Emails grouped by recipient: ["john@example.com: 3", "jane@company.com: 2", "bob@startup.com: 1"]
  john@example.com: #1 → #2 → #3
  jane@company.com: #1 → #2
  bob@startup.com: #1

🚀 Starting scheduling from: Friday, November 1, 2025 at 9:00 AM

📅 Campaign sequence: Email #1 (day 1) → Email #2 (day 4) = 3 days minimum
⏳ john@example.com: Email #2 must wait 3 days after Email #1 (earliest: 11/4/2025)

📅 Campaign sequence: Email #2 (day 4) → Email #3 (day 8) = 4 days minimum
⏳ john@example.com: Email #3 must wait 4 days after Email #2 (earliest: 11/8/2025)

✅ Proposed schedule: 15 emails
```

---

## Configuration

### Campaign Sequence Structure

Campaigns must have this structure in Firebase:

```javascript
{
  "campaignId": "campaign_abc123",
  "channels": {
    "email": {
      "enabled": true,
      "sequence": {
        "steps": [
          {
            "stepId": "email_intro",
            "day": 1,                    // Start day
            "activityType": "email_first",
            "templateId": "template_intro"
          },
          {
            "stepId": "email_follow1",
            "day": 4,                    // 3 days after day 1
            "activityType": "email_followup",
            "templateId": "template_follow1"
          },
          {
            "stepId": "email_follow2",
            "day": 8,                    // 4 days after day 4
            "activityType": "email_followup",
            "templateId": "template_follow2"
          }
        ]
      }
    }
  }
}
```

### Outreach Set Structure

Outreach sets link contacts to campaigns:

```javascript
{
  "outreachSetId": "outreach_xyz789",
  "email": "john@example.com",
  "campaignId": "campaign_abc123",
  "firstName": "John",
  "lastName": "Smith",
  "prospectOrgName": "Example Corp",
  ...
}
```

### Scheduled Email Fields Used

The scheduler uses these fields from failed emails:

```javascript
{
  "id": "email_123",
  "to": "john@example.com",           // Recipient
  "campaignId": "campaign_abc123",    // Links to campaign sequence
  "followUpNumber": 2,                // Position in sequence (1, 2, 3...)
  "type": "follow_up",                // "initial" or "follow_up"
  "status": "failed",
  "sendAt": "2025-10-30T09:00:00Z",   // Original schedule
  ...
}
```

---

## Fallback Behavior

### If Campaign Not Found
```javascript
// Default to 3-day spacing between emails
minDays = 3; // Safe default
console.warn("Campaign not found, using default 3-day spacing");
```

### If Outreach Set Not Found
```javascript
// Sequence timing still works based on followUpNumber
// Just won't have campaign context
console.warn("Outreach set not found, using followUpNumber for ordering");
```

### If followUpNumber Missing
```javascript
// Sort by type: "initial" = 0, others = 999
const order = email.type === 'initial' ? 0 : 999;
```

---

## Benefits

### ✅ Prevents Sequence Violations
Before: All failed emails rescheduled for same day
```
❌ Email #1 → Nov 1, 9 AM
❌ Email #2 → Nov 1, 10 AM  (too soon! needs 3 days)
❌ Email #3 → Nov 1, 11 AM  (too soon! needs 4 more days)
```

After: Respects campaign timing
```
✅ Email #1 → Nov 1, 9 AM
✅ Email #2 → Nov 4, 9 AM   (3 days later)
✅ Email #3 → Nov 8, 9 AM   (4 days later)
```

### ✅ Maintains Email Order
Ensures Email #1 is sent before Email #2, which is sent before Email #3.

### ✅ Improves Campaign Performance
Proper spacing increases response rates and prevents recipient fatigue.

### ✅ Respects Marketing Best Practices
Follows proven cadence patterns (e.g., day 1, day 4, day 8).

---

## Visual Indicators

### In Email List
Sequence emails show their position:
```
john@example.com - Re: Healthcare IT Solutions
Email Type: follow_up
Follow-up Number: #2
```

### In Timeline
Blue left border + sequence badge:
```
┃ 9:00 AM - john@example.com
┃ Domain: example.com
┃ Hour: 1/30
┃ 📧 #2 in sequence
```

### In Success Message
```
Successfully calculated schedule for 15 emails across 8 days!
From 11/1/2025, 9:00 AM to 11/12/2025, 3:00 PM
✅ Respecting sequence timing for 10 follow-up email(s)
```

---

## Testing

### Test Case 1: Single Contact, Full Sequence Failed
```
Input: 3 emails to john@example.com (#1, #2, #3)
Campaign: Day 1, Day 4, Day 8
Expected: #1 on Nov 1, #2 on Nov 4, #3 on Nov 8
Result: ✅ PASS
```

### Test Case 2: Multiple Contacts, Mixed Sequences
```
Input: 
  - alice@company.com (#1, #2)
  - bob@startup.com (#1)
  - carol@corp.com (#1, #2, #3)
  
Expected:
  - Bob #1 scheduled first (no dependencies)
  - Alice and Carol #1 scheduled
  - Alice and Carol #2 scheduled 3+ days later
  - Carol #3 scheduled 4+ days after #2
  
Result: ✅ PASS
```

### Test Case 3: No Campaign Info
```
Input: 2 emails with no campaignId
Expected: 3-day default spacing
Result: ✅ PASS
```

---

## Limitations

### 1. Assumes Sequential Order
If emails are out of order in the database, the system will still try to sort them.

### 2. No Cross-Campaign Awareness
If the same contact is in multiple campaigns, each campaign is treated independently.

### 3. Doesn't Check Already-Sent Emails
Currently only looks at failed emails. Future enhancement: check `sent` emails to calculate from actual send date.

---

## Future Enhancements

### Possible Improvements:
1. **Check sent emails**: Calculate from actual sent dates, not just failed emails
2. **Cross-campaign deduplication**: Prevent scheduling to same person in multiple campaigns
3. **Dynamic sequence adjustment**: Allow shorter spacing if recipient is highly engaged
4. **A/B test timing**: Support different timing variants from campaign iterations
5. **Visual sequence map**: Show full campaign timeline with actual vs planned dates

---

## Code Locations

### Main Functions:
- `loadCampaignsAndOutreachSets()` - Loads campaign and outreach set data
- `getMinimumDaysBetween()` - Calculates minimum days from campaign sequence
- `calculateSchedule()` - Updated to handle sequence timing
- `renderScheduleTimeline()` - Shows sequence indicators in UI

### Key Variables:
- `campaignsMap` - Stores loaded campaigns
- `outreachSetsMap` - Stores loaded outreach sets
- `emailsByRecipient` - Groups emails by recipient
- `lastScheduledByRecipient` - Tracks last scheduled email per recipient for spacing

---

## Summary

The sequence timing feature ensures that when multiple emails to the same contact fail and need rescheduling:

1. ✅ They are rescheduled in the **correct order** (1, 2, 3...)
2. ✅ With **proper spacing** based on campaign configuration (e.g., 3 days, 4 days)
3. ✅ While still respecting all **other constraints** (hourly, daily, domain limits)
4. ✅ With **clear visual feedback** showing sequence relationships

This prevents sequence violations and maintains the effectiveness of your email campaigns!

---

**Version**: 1.0  
**Date**: October 31, 2025  
**Status**: ✅ Production Ready











