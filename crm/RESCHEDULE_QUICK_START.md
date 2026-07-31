# Smart Email Rescheduler - Quick Start Guide

## 🚀 Quick Access
**URL**: `/crm/reschedule_failed_emails.html`  
**Access**: Admin only (healthluminate.com / careluminate.com)

---

## ⚡ 5-Minute Quick Start

### Step 1: Load Failed Emails
```
Click: "Load Failed Emails" button
Wait: 2-3 seconds
See: Statistics and email list appear
```

### Step 2: Select Emails
```
Option A: Click "Select All" (reschedule everything)
Option B: Click individual emails
Option C: Use filter dropdown, then "Select All"
```

### Step 3: Calculate Schedule
```
Click: "Calculate Optimal Schedule"
Wait: 2-3 seconds
Review: Timeline showing proposed schedule
```

### Step 4: Apply Changes
```
Click: "Apply Rescheduling"
Confirm: Dialog prompt
Wait: Progress bar reaches 100%
Done: Emails rescheduled successfully!
```

---

## 📋 Default Settings

| Setting | Default Value | Description |
|---------|--------------|-------------|
| Max Per Hour | 10 emails | Prevents rate limiting |
| Max Per Day | 100 emails | Daily sending cap |
| Max Per Domain/Day | 2 emails | Protects sender reputation |
| Sending Hours | 9 AM - 5 PM | Business hours only |
| Start Date | Tomorrow | Earliest reschedule date |

**💡 Tip**: These are pre-loaded from your Firebase global settings. Adjust if needed!

---

## 🎯 Common Scenarios

### Scenario 1: Rate Limit Failures
```
Problem: 25 emails failed due to hourly limit exceeded
Solution:
  1. Filter: "Rate Limit Only"
  2. Select: "Select All"
  3. Calculate: Algorithm spreads across hours
  4. Apply: Done in 10 seconds!
```

### Scenario 2: Thread Errors
```
Problem: 10 follow-ups failed (missing original email)
Solution:
  1. First: Run /crm/fix_scheduled_emails.html
  2. Then: Use this tool to reschedule
  3. Filter: "Thread Errors Only"
  4. Apply: Emails scheduled after originals
```

### Scenario 3: Mixed Failures
```
Problem: 50 emails failed (various reasons)
Solution:
  1. Load all failed emails
  2. Review each category
  3. Select all retryable emails
  4. Calculate optimal schedule
  5. Apply rescheduling
```

---

## ⚠️ Important Warnings

### DO ✅
- Review the timeline before applying
- Start with small batches (10-20 emails) for testing
- Check that constraints match your account limits
- Ensure start date is reasonable (tomorrow or soon)

### DON'T ❌
- Reschedule without reviewing timeline
- Set limits too high (risks rate limiting again)
- Ignore thread errors (fix them first)
- Schedule for weekends (automatically skipped)

---

## 🔍 Reading the Timeline

### Good Schedule Example ✅
```
Monday, Nov 1, 2025          10 emails
  9:00 AM - alice@example.com (Domain: example.com, Hour: 1/10)
  10:00 AM - bob@company.com (Domain: company.com, Hour: 1/10)
  11:00 AM - carol@example.com (Domain: example.com, Hour: 1/10)
  ...

Tuesday, Nov 2, 2025         10 emails
  9:00 AM - dave@newco.com (Domain: newco.com, Hour: 1/10)
  ...
```
**Why Good**: 
- Emails spread across hours
- Only 2 to example.com per day
- Within hourly limits (1/10, 2/10, etc.)

### Bad Schedule Example ❌
```
Monday, Nov 1, 2025          60 emails
  9:00 AM - 15 emails scheduled (CONFLICT! Exceeds 10/hour)
  10:00 AM - 15 emails scheduled (CONFLICT! Exceeds 10/hour)
  ...
```
**Why Bad**: 
- Too many in one hour
- Will cause rate limit failures again
- **Action**: Increase max per hour OR spread across more days

---

## 🐛 Troubleshooting

### "No failed emails found"
- ✅ All emails sent successfully!
- OR emails already rescheduled
- Check: `/crm/email_queue.html` for current status

### "Could not calculate schedule"
- Constraints too strict
- **Fix**: Increase limits or extend date range

### "Some emails failed to reschedule"
- Check browser console (F12) for errors
- Verify Firebase permissions
- **Fix**: Retry rescheduling

### "Schedule shows conflicts"
- Algorithm couldn't find clean slots
- **Fix**: Adjust constraints or start date

---

## 📊 Statistics Explained

### Total Failed Emails
- Count of all emails with status = 'failed'
- Includes all failure types

### Rate Limit Failures
- Failed due to "limit", "quota", "too many"
- **Most common** and easiest to fix

### Thread Errors
- Failed due to missing original email
- Requires fix_scheduled_emails.html first

### Selected for Rescheduling
- Number of emails you've selected
- Updates as you select/deselect

---

## 🔗 Related Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `email_error_monitor.html` | View detailed errors | Investigate specific failures |
| `fix_scheduled_emails.html` | Fix thread references | Before rescheduling thread errors |
| `email_queue.html` | View all scheduled | After rescheduling to verify |
| `email_analytics.html` | Send statistics | Monitor overall health |

---

## 💡 Pro Tips

### Tip 1: Test First
```
Start small:
  Day 1: Reschedule 10 emails
  Day 2: Check results in email_queue.html
  Day 3: Scale up to 50+ emails
```

### Tip 2: Fix Threads First
```
If many thread errors:
  1. Run fix_scheduled_emails.html
  2. Fix all thread references
  3. THEN use this tool
  4. Reschedule with confidence
```

### Tip 3: Adjust Constraints
```
If failures persist:
  - Reduce max per hour (10 → 8)
  - Reduce max per domain (2 → 1)
  - Extend start date (more days to spread)
```

### Tip 4: Monitor Results
```
After rescheduling:
  Hour 1: Check email_queue.html
  Day 1: Monitor for new failures
  Week 1: Review analytics
  Week 2: Adjust strategy if needed
```

---

## 🎓 Understanding the Algorithm

### Simple Explanation
```
For each email:
  1. Start at your chosen date/time
  2. Check: "Can I send here without breaking rules?"
  3. If YES: Schedule it!
  4. If NO: Move to next hour and try again
  5. Repeat until all emails scheduled
```

### What "Breaking Rules" Means
```
Rules:
  ❌ Too many emails this hour (>10)
  ❌ Too many emails today (>100)
  ❌ Too many to this domain today (>2)
  ❌ Outside business hours (before 9 AM or after 5 PM)
  ❌ Weekend (Saturday or Sunday)
```

---

## 📞 Support

**Need Help?**
1. Check browser console (F12 → Console tab)
2. Review this guide
3. Check README file
4. Contact: taylordavis@careluminate.com

**Found a Bug?**
1. Note the error message
2. Screenshot the timeline/stats
3. Save browser console logs
4. Report with details

---

## ✅ Success Checklist

After rescheduling, verify:
- [ ] Statistics show "0 Selected" (all applied)
- [ ] Success message displayed
- [ ] Timeline looked reasonable
- [ ] Page reloaded automatically
- [ ] Check email_queue.html - emails appear with new dates
- [ ] No new failures after 24 hours
- [ ] Domain distribution looks good
- [ ] Hourly distribution is even

---

**Version**: 1.0  
**Last Updated**: October 31, 2025  
**Quick Reference Card** - Keep this handy!











