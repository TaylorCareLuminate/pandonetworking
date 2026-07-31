# Mail Campaign Hotsheet Documentation

## Overview
The Mail Campaign Hotsheet is a comprehensive system for creating and managing email campaigns across multiple organizations and contacts. It provides a 5-step workflow from organization selection to email scheduling.

## Features

### 🏢 Multi-Organization Selection (Step 1)
- Select multiple organizations using the same filter system as the regular hotsheet
- Filters include: Company Name, Domain, Category, Source, Market Share, and Sort options
- Visual selection with checkboxes and filter badges
- Real-time filtering and search capabilities

### 👥 Contact Filtering (Step 2)
- Filter contacts from selected organizations based on:
  - **Recent Personal News**: Has recent news or doesn't have recent news
  - **One Key Thing**: Has one key thing or doesn't have one key thing
  - **Contact Name**: Search by contact name
  - **Position/Title**: Filter by job position
- Visual contact cards showing full contact information
- Selected contacts appear as filter badges

### ✉️ Campaign Builder (Step 3)
- **Initial Email**: Primary email to send to all contacts
- **Follow-up Emails**: Add multiple follow-up emails with custom timing
- **Priority System**: Set priority 1-10 for each email (affects send order)
- **Minimum Days Between Emails**: Configure delay between email sequences
- **Email Fields**: Subject, From Name, HTML Content for each email

### 👁️ Review Page (Step 4)
- **Contact Review**: Full contact cards for all selected contacts
- **Email Sequence Review**: Preview all emails with content snippets
- **Campaign Summary**: Total contacts and emails in the campaign

### 📅 Schedule & Send (Step 5)
- **Daily Limits**: Configure maximum emails per day
- **Domain Limits**: Set maximum emails per domain per day (default: 2)
- **Send Hours**: Define time window for sending emails (default: 9 AM - 5 PM)
- **Schedule Preview**: Visual timeline showing when each email will be sent
- **Random Timing**: Emails are sent with random intervals (minimum 3 minutes apart)

## Technical Implementation

### Firebase Integration
- **Data Source**: `hl_index_25` for organizations and contacts
- **Campaign Storage**: `hl_emails/campaigns/` for campaign metadata
- **Email Scheduling**: `hl_emails/scheduled/` for individual scheduled emails
- **Authentication**: Uses centralized auth system with CRM folder protection

### Email Scheduling Logic
1. **Priority Sorting**: Higher priority emails are scheduled first
2. **Daily Limits**: Respects emails per day and domain limits
3. **Time Windows**: Only schedules within specified hours
4. **Random Intervals**: Adds randomization within time windows
5. **Minimum Spacing**: Ensures at least 3 minutes between emails on same account
6. **Follow-up Delays**: Respects minimum days between email sequences

### Data Structure
```javascript
// Campaign Data
{
  campaignId: "campaign_1234567890",
  createdAt: "2024-01-01T00:00:00.000Z",
  createdBy: "user@healthluminate.com",
  selectedOrganizations: ["org1", "org2"],
  selectedContacts: ["org1_contact1", "org2_contact1"],
  emailSequence: [
    {
      type: "initial",
      subject: "Subject",
      content: "HTML content",
      fromName: "Sender Name",
      priority: 5
    }
  ],
  schedulingSettings: {
    emailsPerDay: 20,
    maxPerDomain: 2,
    sendStartTime: "09:00",
    sendEndTime: "17:00",
    daysBetween: 3
  },
  scheduledEmails: [...]
}
```

## Usage Instructions

### Step 1: Select Organizations
1. Use the filter controls to find relevant organizations
2. Click on organization cards to select them (checkbox appears when selected)
3. Selected organizations appear as badges at the top
4. Click "Next" when you have selected all desired organizations

### Step 2: Filter Contacts
1. Contacts from selected organizations are automatically loaded
2. Use filters to narrow down contacts based on your criteria:
   - Recent personal news availability
   - One key thing availability
   - Contact name search
   - Position/title filter
3. Click on contact cards to select them
4. Selected contacts appear as badges at the top
5. Click "Next" when you have selected all desired contacts

### Step 3: Build Campaign
1. **Initial Email**: Fill in subject, from name, and HTML content
2. **Add Follow-ups**: Click "Add Follow-up Email" to create additional emails
3. **Set Priority**: Higher numbers (1-10) get sent first
4. **Configure Timing**: Set minimum days between emails
5. **Remove Follow-ups**: Use the trash icon to remove unwanted follow-ups
6. Click "Next" when campaign is complete

### Step 4: Review
1. **Review Contacts**: Check the contact list on the left
2. **Review Emails**: Check the email sequence on the right
3. **Verify Information**: Make sure all details are correct
4. Click "Next" to proceed to scheduling

### Step 5: Schedule & Send
1. **Configure Settings**:
   - Set emails per day limit
   - Set maximum emails per domain per day
   - Set send hours (time window)
2. **Generate Preview**: Click "Generate Schedule Preview" to see the timeline
3. **Review Timeline**: Check when each email will be sent
4. **Schedule Campaign**: Click "Schedule Campaign" to save and schedule all emails

## Best Practices

### Organization Selection
- Start with broad filters, then narrow down
- Select organizations with similar profiles for better campaign consistency
- Check organization status to avoid "Do Not Contact" organizations

### Contact Filtering
- Use "Recent Personal News" and "One Key Thing" filters to prioritize high-value contacts
- Balance quantity with quality - fewer, better-targeted contacts often perform better
- Review contact information to ensure email addresses are available

### Campaign Building
- **Subject Lines**: Make them personalized and relevant
- **Priority System**: Use priorities to send to most important contacts first
- **Follow-up Timing**: 3-7 days between emails is typically effective
- **Content**: Keep HTML content professional and mobile-friendly

### Scheduling
- **Daily Limits**: Don't exceed 50 emails per day to maintain deliverability
- **Domain Limits**: Keep at 2 per domain per day to avoid spam filters
- **Send Hours**: Respect business hours (9 AM - 5 PM) in recipient timezone
- **Preview First**: Always generate and review the schedule preview before sending

## Troubleshooting

### Common Issues
1. **No Organizations Loading**: Check Firebase connection and hl_index_25 data
2. **Contacts Not Loading**: Verify organization selection and Firebase permissions
3. **Scheduling Errors**: Check that all required email fields are filled
4. **Authentication Issues**: Ensure proper CRM folder access permissions

### Error Messages
- "Please select at least one organization": Select organizations in Step 1
- "Please select at least one contact": Select contacts in Step 2
- "Please fill in all fields": Complete all email content in Step 3
- "Error scheduling campaign": Check Firebase permissions and data structure

## Integration with Existing Systems

### Hotsheet Integration
- Uses same organization data and filtering system as main hotsheet
- Maintains consistent UI/UX patterns
- Shares Firebase authentication and permissions

### Email Service Integration
- Scheduled emails are stored in Firebase for Railway email service pickup
- Compatible with existing test_mail_send.html workflow
- Maintains email scheduling and delivery tracking

### CRM Integration
- Respects organization statuses (qualified, do not contact)
- Integrates with existing outreach tracking
- Maintains contact interaction history

## Future Enhancements

### Planned Features
- **Email Templates**: Pre-built email templates for common use cases
- **A/B Testing**: Test different subject lines or content versions
- **Analytics**: Track open rates, click rates, and response rates
- **Automatic Follow-ups**: Based on email engagement
- **Bulk Actions**: Quick actions for common campaign operations

### API Integration
- Integration with external email service providers
- Webhook support for delivery notifications
- Advanced scheduling algorithms
- Machine learning for optimal send times

## Support

For technical support or feature requests, contact the HealthLuminate development team or check the Firebase logs for debugging information. 