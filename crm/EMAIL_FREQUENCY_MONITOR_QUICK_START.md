# Email Frequency Monitor - Quick Start Guide

## What Does This Tool Do?

Analyzes both **sent emails** (from `sentEmailsDatabase`) and **scheduled emails** (from `scheduledEmails`) to identify recipients who are receiving or about to receive **more than 4 emails in a 4-month period**.

## Why Use This?

- **Prevent email fatigue**: Stop recipients from being overwhelmed
- **Maintain reputation**: Avoid spam complaints and unsubscribes  
- **Quality control**: Ensure intentional, coordinated outreach
- **Team coordination**: Identify when multiple people email the same recipient

## Quick Start (5 Minutes)

### Step 1: Open the Page
Navigate to: `/crm/email_frequency_monitor.html`

### Step 2: Load Data
Click the **"Refresh Data"** button in the top right.

Wait 10-30 seconds while the system:
- Loads sent emails from the last 4 months
- Loads all scheduled emails
- Analyzes frequency for each recipient

### Step 3: Review Critical Recipients
Look at the statistics:
- **Critical (red)**: Recipients getting >4 emails in 4 months
- **High Risk (orange)**: Recipients getting exactly 4 emails in 4 months

### Step 4: Take Action
Click the **"Critical"** filter tab to see problem recipients.

For each critical recipient:
1. Click the timeline to see all their emails
2. Determine if the frequency is justified
3. If not, go to Email Queue and delay/cancel scheduled emails

## Understanding the Risk Levels

| Badge | Emails in 4mo | What to Do |
|-------|---------------|------------|
| 🔴 **CRITICAL** | 5+ | **Action required** - Review immediately and adjust scheduling |
| 🟠 **HIGH RISK** | 4 | **Monitor closely** - At limit, don't schedule more |
| 🟡 **MODERATE** | 3 | **Watch** - One more email reaches limit |
| 🟢 **LOW RISK** | 0-2 | **Safe** - Can schedule additional emails |

## Key Features at a Glance

### Filter Tabs
- **All Recipients**: Everyone in the system
- **Critical**: Need immediate attention (>4 emails)
- **High Risk**: At the threshold (4 emails)
- **Moderate**: Getting close (3 emails)
- **Low**: Safe frequency (0-2 emails)

### Search Box
Find specific recipients by:
- Email address
- Name
- Company

### Sort Options
- **Email Count**: Shows highest frequency first (default)
- **Email Address**: Alphabetical
- **Last Email Date**: Most recent activity
- **Next Email Date**: Upcoming sends

### Time Windows
Analyze different periods:
- 3 months
- **4 months (default - recommended)**
- 6 months
- 12 months

## Common Scenarios

### Scenario 1: Pre-Campaign Check
**Before launching a new campaign:**

1. Load the frequency monitor
2. Filter to show recipients in your campaign list
3. Identify anyone already at high frequency
4. Exclude them from the campaign or delay their emails

### Scenario 2: Multi-Team Coordination
**Multiple people emailing the same accounts:**

1. Search for a specific company or domain
2. Review the email timeline
3. See all touchpoints from all team members
4. Coordinate to reduce overlap

### Scenario 3: Weekly Monitoring
**Regular health check:**

1. Run the analysis every Monday
2. Export critical recipients to CSV
3. Review with team in weekly meeting
4. Adjust scheduling as needed

### Scenario 4: Post-Campaign Review
**After scheduling a campaign:**

1. Re-run the analysis
2. Look for newly created critical situations
3. Adjust scheduling before emails send
4. Document any intentional high-frequency sends

## When High Frequency is OK

Sometimes more than 4 emails in 4 months is appropriate:

✅ **Active sales cycles** with engaged prospects  
✅ **Event sequences** (webinar series, product launches)  
✅ **Onboarding programs** with enrolled customers  
✅ **VIP accounts** with explicit permission  
✅ **Time-sensitive** multi-touch campaigns  

**The key**: Be intentional and aware, not accidental.

## Export and Share

Click **"Export CSV"** to download the current view including:
- All recipient details
- Risk levels and metrics
- Email counts
- Date information

Use this for:
- Team reports
- Campaign planning
- Stakeholder updates
- Historical tracking

## Tips for Best Results

### 1. Run Before Major Campaigns
Check frequency BEFORE scheduling large sends

### 2. Use with Email Queue Page
- Frequency Monitor: Identify problems
- Email Queue: Fix problems (delay/cancel)

### 3. Search by Domain
Use `@example.com` in search to see all recipients from a company

### 4. Check Different Time Windows
- 3 months: Stricter, short-term view
- 4 months: Balanced (recommended)
- 6-12 months: Longer-term patterns

### 5. Monitor Critical Count
If the critical number keeps growing, you may need to:
- Review campaign schedules
- Improve list segmentation
- Coordinate better between teams

## Integration with Other Tools

| Tool | Purpose | Workflow |
|------|---------|----------|
| **Email Queue** | Manage scheduled sends | Fix issues found in Frequency Monitor |
| **Sent Email Database** | Historical records | Understand past patterns |
| **Campaign Cleanup** | Bulk management | Adjust multiple campaigns at once |
| **Send Monitoring** | Real-time tracking | Watch sends as they happen |

## Troubleshooting

**Problem**: "No Data Loaded" message  
**Solution**: Click "Refresh Data" button

**Problem**: Counts seem wrong  
**Solution**: Check your time window selection

**Problem**: Can't find a recipient  
**Solution**: Try searching by partial email or adjust filters

**Problem**: Page is slow  
**Solution**: Try a shorter time window (3 months instead of 6)

## Best Practices Summary

1. ⏰ **Check weekly** - Make it a regular habit
2. 📊 **Monitor before campaigns** - Prevent problems proactively  
3. 🤝 **Share with team** - Coordinate outreach efforts
4. 📝 **Document exceptions** - Note when high frequency is intentional
5. 📈 **Track trends** - Watch if critical count grows over time
6. 🎯 **Focus on quality** - Relevant emails matter more than frequency limits

## Quick Reference: What Each Number Means

### Recipient Card Numbers

**Total Emails**: All sent + scheduled emails in the dataset  
**Max in Window**: Highest email count in ANY rolling 4-month period  
**Sent**: Historical emails already delivered  
**Scheduled**: Future emails queued to send  

### The "Max in Window" is Key

This is the most important number. It answers:  
*"What's the most emails this recipient gets in any 4-month span?"*

Example:
- Jan: 1 email
- Feb: 0 emails  
- Mar: 2 emails
- Apr: 2 emails
- **Max in Window = 5** (Mar + Apr = 2+2, plus overlaps = 5 total in that 4-month window)

## Getting Help

1. **Check the Full README**: `EMAIL_FREQUENCY_MONITOR_README.md`
2. **Browser Console**: Press F12 to see detailed error messages
3. **Firebase Status**: Verify you're connected to the CLEmail project
4. **Team Support**: Contact your CRM administrator

---

## Remember the Core Purpose

This tool helps you be **intentional** with email frequency. It's not about never sending 4+ emails - it's about **knowing when you're doing it** and ensuring it's the right choice for that recipient.

🎯 **Goal**: Quality, coordinated, intentional outreach that respects recipient attention.

---

**Ready to start?** Open the page and click "Refresh Data"! 🚀













