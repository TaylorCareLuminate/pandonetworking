# Email Frequency Monitor

## Overview

The Email Frequency Monitor is a comprehensive analysis tool designed to prevent recipients from receiving too many emails within a given time period. It analyzes both historical sent emails and upcoming scheduled emails to identify recipients at risk of receiving more than 4 emails in a 4-month window.

## Purpose

While there are legitimate cases where recipients may need to receive multiple emails, this tool helps ensure that high-frequency communication is **intentional and appropriate**. It provides visibility into email patterns across your entire system, allowing you to make informed decisions about communication cadence.

## Key Features

### 1. Comprehensive Data Analysis
- **Sent Emails**: Analyzes historical data from `sentEmailsDatabase` collection
- **Scheduled Emails**: Includes upcoming sends from `scheduledEmails` collection
- **Rolling Window Analysis**: Calculates maximum emails in any rolling time window

### 2. Risk Level Classification

Recipients are automatically classified into four risk levels:

| Risk Level | Criteria | Action Required |
|------------|----------|-----------------|
| 🔴 **Critical** | More than 4 emails in the time window | Immediate review needed |
| 🟠 **High Risk** | Exactly 4 emails in the time window | Monitor closely, consider delaying future sends |
| 🟡 **Moderate** | 3 emails in the time window | Acceptable, but watch for additional scheduling |
| 🟢 **Low Risk** | 2 or fewer emails in the time window | Safe to proceed with additional communications |

### 3. Interactive Dashboard

#### Statistics Overview
- Total recipients analyzed
- Count by risk level
- Total sent and scheduled emails
- Real-time calculations

#### Filtering and Sorting
- **Filter by Risk Level**: View all recipients or filter by specific risk categories
- **Search**: Find specific recipients by email, name, or company
- **Sort Options**:
  - Email count (high to low)
  - Email address (alphabetical)
  - Last email date
  - Next scheduled email date

#### Time Window Options
- 3 months
- **4 months (default)**
- 6 months
- 12 months

### 4. Detailed Recipient Cards

Each recipient card displays:

- **Email address and name**
- **Risk level badge** with specific warning
- **Summary metrics**:
  - Total emails in dataset
  - Maximum emails in any rolling window
  - Count of sent emails
  - Count of scheduled emails
- **Email timeline** (expandable):
  - Chronological list of all emails
  - Sent vs. scheduled status
  - Email subject lines
  - Sender information
  - Campaign associations

### 5. Export Functionality

Export filtered results to CSV with:
- Recipient details
- Risk metrics
- Email counts
- Date information

## Data Sources

### Firebase Collections

#### `sentEmailsDatabase` Collection
```javascript
{
  to: "recipient@example.com",
  sentAt: "2024-11-13T10:30:00.000Z",
  subject: "Email subject",
  from: "sender@example.com",
  recipientName: "John Doe",
  toName: "John Doe",
  company: "Example Corp",
  campaign: "Q4 Campaign"
}
```

#### `scheduledEmails` Collection
```javascript
{
  to: "recipient@example.com",
  scheduledTime: "2024-11-20T14:00:00.000Z",
  status: "pending" | "scheduled",
  subject: "Email subject",
  from: "sender@example.com",
  recipientName: "John Doe",
  toName: "John Doe",
  company: "Example Corp",
  campaign: "Q4 Campaign"
}
```

## How It Works

### 1. Data Collection
- Queries `sentEmailsDatabase` for emails within the selected time window
- Queries `scheduledEmails` for all pending/scheduled emails
- Normalizes and combines data by recipient email address

### 2. Frequency Analysis
For each recipient:
1. Combines sent and scheduled emails into a chronological timeline
2. Calculates a **rolling window analysis**:
   - For each email, counts how many other emails fall within the time window
   - Finds the maximum count across all possible windows
3. This approach catches both:
   - Historical over-communication
   - Future scheduling that would cause over-communication

### 3. Risk Assessment
- **Critical**: `maxInWindow > 4` - Already exceeded or will exceed the limit
- **High**: `maxInWindow = 4` - At the threshold, no room for additional emails
- **Moderate**: `maxInWindow = 3` - One email away from the limit
- **Low**: `maxInWindow <= 2` - Safe frequency levels

## Usage Guide

### Initial Load
1. Open the page in your CRM system
2. Click **"Refresh Data"** to load and analyze all email data
3. Wait for the analysis to complete (may take 10-30 seconds depending on data volume)

### Identifying Problem Recipients
1. View the **Critical** count in the statistics bar
2. Click the **"Critical"** filter tab to see only high-priority issues
3. Review each recipient card for:
   - Total email count
   - Maximum emails in any rolling window
   - Timeline of sends

### Taking Action
When you identify a recipient receiving too many emails:

1. **Review the Timeline**: Check if the emails are:
   - Part of different campaigns
   - From different team members
   - Appropriate for the relationship stage

2. **Evaluate Necessity**: Determine if all scheduled emails are required

3. **Adjust Scheduling**: 
   - Go to the Email Queue page
   - Search for scheduled emails to this recipient
   - Delay, cancel, or consolidate emails as needed

4. **Document Decisions**: If high frequency is intentional:
   - Note the business justification
   - Ensure alignment with team

### Regular Monitoring
- **Weekly Review**: Check for new critical recipients
- **Before Major Campaigns**: Verify recipients won't be overwhelmed
- **Monthly Audit**: Review moderate-risk recipients approaching limits

## Best Practices

### 1. Proactive Monitoring
- Run the analysis **before** scheduling large campaigns
- Check frequency for new email lists before import
- Monitor after campaign launches

### 2. Coordinated Campaigns
- Review if multiple team members are emailing the same recipients
- Consolidate similar messages when possible
- Stagger campaigns to different contact segments

### 3. Quality Over Quantity
- 4 emails in 4 months is a guideline, not a rule
- Focus on email **value** and **relevance**
- Consider recipient engagement levels

### 4. Exceptions Management
When more than 4 emails is appropriate:
- **Active sales cycles** with engaged prospects
- **Event-driven sequences** (webinar series, etc.)
- **Customer onboarding** programs
- **VIP relationships** with explicit consent

Document these exceptions for team awareness.

## Technical Details

### Firebase Configuration
- **Project**: CLEmail (clemail.firebaseapp.com)
- **Database**: Firestore
- **Collections**: `sentEmailsDatabase`, `scheduledEmails`

### Performance Considerations
- Queries are filtered by date to reduce data transfer
- Pagination not implemented (loads all matching records)
- Client-side processing for maximum flexibility
- Recommended maximum: ~10,000 total emails for optimal performance

### Browser Compatibility
- Modern browsers with ES6+ support
- Firebase SDK 9.22.0
- No IE11 support

## Troubleshooting

### "No Data Loaded"
- Click "Refresh Data" button
- Check Firebase authentication
- Verify Firebase configuration
- Check browser console for errors

### Performance Issues
- Reduce time window (e.g., 3 months instead of 6)
- Clear browser cache
- Check internet connection
- Verify Firebase quotas not exceeded

### Incorrect Counts
- Verify email addresses are normalized (lowercase)
- Check for duplicate entries in source collections
- Confirm timestamp formats are ISO 8601

### Missing Recipients
- Check if emails fall within selected time window
- Verify `to` field is populated in source data
- Check scheduled email status (must be 'pending' or 'scheduled')

## Integration Points

### Related CRM Pages
- **Email Queue** (`email_queue.html`): Manage scheduled emails
- **Sent Email Database** (`sent_email_database.html`): Historical email records
- **Send Monitoring** (`send_monitoring.html`): Real-time send tracking
- **Campaign Cleanup** (`campaign_cleanup.html`): Manage campaigns

### Workflow Integration
1. **Before Campaign Launch**:
   - Run frequency check
   - Identify at-risk recipients
   - Exclude or delay as needed

2. **After Campaign Schedule**:
   - Re-run analysis
   - Verify no critical situations created
   - Adjust if needed

3. **Weekly Operations**:
   - Export critical recipients list
   - Review with team
   - Coordinate scheduling

## Future Enhancements

Potential improvements for future versions:

1. **Automated Alerts**
   - Email notifications for critical recipients
   - Slack/Teams integration
   - Dashboard widgets

2. **Smart Scheduling**
   - Automatic conflict detection during email scheduling
   - Suggested optimal send times
   - Campaign coordination suggestions

3. **Advanced Analytics**
   - Engagement correlation with frequency
   - Response rate by cadence
   - Optimal frequency recommendations by segment

4. **Historical Trends**
   - Frequency trends over time
   - Team/campaign comparisons
   - Seasonal pattern identification

5. **Bulk Actions**
   - Delay multiple scheduled emails at once
   - Bulk recipient exclusions
   - Campaign-wide adjustments

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify Firebase connectivity
3. Review this documentation
4. Contact CRM administrator

## Changelog

### Version 1.0.0 (November 2024)
- Initial release
- Comprehensive recipient analysis
- Risk level classification
- Interactive filtering and sorting
- CSV export functionality
- Rolling window analysis algorithm
- Timeline visualization

---

**Remember**: This tool is for **monitoring and awareness**, not enforcement. There are valid reasons for high-frequency communication. Use this data to make informed, intentional decisions about your email outreach strategy.













