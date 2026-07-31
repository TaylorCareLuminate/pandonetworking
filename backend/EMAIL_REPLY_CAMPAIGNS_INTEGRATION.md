# Email Reply Campaigns Integration Guide

This document explains how to integrate the Email Reply Campaigns system with your existing Railway CLEmail backend.

## Overview

The Email Reply Campaigns system allows users to:
1. Search through email conversations by name or email
2. Find the most recent email for each unique contact
3. Create reply-all campaigns to multiple contacts
4. Schedule emails through the existing queue system with calendar and domain limits

## Architecture

```
Frontend (email_reply_campaigns.html)
    ↓ API Calls
Backend API (email-reply-campaigns-api.js)
    ↓ Integration
Existing Railway CLEmail System
    ↓ Scheduling
Firebase Queue + SMTP Sending
```

## Backend Integration

### 1. Add Routes to Existing Railway Server

Add the following routes to your existing Railway Express.js application:

```javascript
// In your main server file (app.js or server.js)
const emailReplyCampaignsAPI = require('./email-reply-campaigns-api');
app.use('/api', emailReplyCampaignsAPI);
```

### 2. Required Dependencies

Make sure your Railway project has these dependencies:

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "firebase-admin": "^12.0.0"
  }
}
```

### 3. Required API Endpoints

The system adds these new endpoints to your Railway backend:

#### Email Search
- `POST /emails/search`
- Searches for emails by name/email address
- Returns most recent email for each contact
- Integrates with your existing email storage

#### Campaign Scheduling
- `POST /campaigns/schedule-reply-all`
- Schedules reply-all campaigns
- Integrates with existing calendar system
- Enforces domain limiting (max 2 per domain per hour)

#### Queue Status
- `GET /emails/queue/status`
- Returns current email queue status
- Shows domain counts and time slots

## Frontend Integration

### 1. Deploy the Frontend

Upload `email_reply_campaigns.html` to your `HealthLuminateSite/crm/` directory.

### 2. Add Navigation Links

Add links to the new system in your existing CRM navigation:

```html
<a href="/crm/email_reply_campaigns.html" class="btn">
  <i class="fas fa-reply-all"></i> Reply Campaigns
</a>
```

### 3. Update Email Controls

The system integrates with your existing `email_controls.html` for account management.

## Email Storage Integration

### Required Collections

The system expects these Firestore collections:

```javascript
// Email storage collections
sentEmails: {
  accountId: string,
  to: string,
  from: string,
  subject: string,
  htmlContent: string,
  textContent: string,
  sentAt: timestamp,
  fromName: string,
  toName: string
}

receivedEmails: {
  accountId: string,
  to: string,
  from: string,
  subject: string,
  htmlContent: string,
  textContent: string,
  receivedAt: timestamp,
  fromName: string,
  toName: string
}
```

### IMAP Integration

For real-time email search, integrate with your IMAP client:

```javascript
// Replace the placeholder searchEmailsByContact function
async function searchEmailsByContact(account, searchTerm, mostRecentOnly) {
  // Connect to IMAP
  const imap = new ImapFlow({
    host: account.imapConfig.host,
    port: account.imapConfig.port,
    secure: account.imapConfig.tls,
    auth: {
      user: account.imapConfig.auth.user,
      pass: account.imapConfig.auth.pass
    }
  });

  await imap.connect();

  // Search sent folder
  const sentResults = await searchIMAPFolder(imap, 'INBOX.Sent', searchTerm);
  
  // Search inbox
  const inboxResults = await searchIMAPFolder(imap, 'INBOX', searchTerm);

  await imap.logout();

  // Process and deduplicate results
  return processSearchResults([...sentResults, ...inboxResults], mostRecentOnly);
}
```

## Calendar Integration

### Calendar Data Structure

```javascript
// In Firestore: emailSettings/calendar
{
  availableDays: [1, 2, 3, 4, 5], // Monday-Friday
  unavailableDates: ["2024-01-01", "2024-07-04"], // Holidays
  workingHours: {
    start: "09:00",
    end: "17:00"
  },
  timezone: "America/New_York"
}
```

### Domain Limiting

The system enforces:
- Maximum 2 emails per domain per hour
- Minimum 3 minutes between emails
- Calendar-based scheduling only on available days

## Queue Integration

### Firebase Queue Collection

```javascript
// emailQueue collection structure
{
  id: string,
  accountId: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  sendAt: ISO timestamp,
  status: 'scheduled' | 'pending' | 'sent' | 'failed',
  type: 'reply' | 'campaign' | 'followup',
  originalEmailId: string (optional),
  campaignType: 'reply-all',
  createdAt: ISO timestamp
}
```

### Railway Integration

The system calls your existing `/schedule-email` endpoint for each scheduled email to ensure compatibility with your current sending infrastructure.

## Testing

### 1. Test Email Search

1. Navigate to `/crm/email_reply_campaigns.html`
2. Select an email account
3. Search for a contact name or email
4. Verify results show most recent emails

### 2. Test Campaign Creation

1. Select contacts from search results
2. Create reply content
3. Review generated emails
4. Schedule campaign
5. Verify emails appear in queue

### 3. Test Queue Integration

1. Check `/emails/queue/status` endpoint
2. Verify scheduled emails appear in Firebase
3. Confirm domain limiting is working
4. Test calendar integration

## Security Considerations

### Access Control

The system uses the existing folder-protection system:
- Only HealthLuminate domains can access CRM folder
- Uses centralized Firebase authentication
- Inherits permissions from email_controls.html

### Data Protection

- Email content is stored securely in Firebase
- IMAP credentials use existing encryption
- API endpoints validate account ownership

## Troubleshooting

### Common Issues

1. **Email Search Not Working**
   - Check IMAP credentials in email accounts
   - Verify Firestore email collections exist
   - Check console for authentication errors

2. **Calendar Integration Issues**
   - Verify calendar data exists in Firestore
   - Check timezone configuration
   - Ensure available days are properly set

3. **Queue Not Scheduling**
   - Check Firebase permissions
   - Verify Railway endpoint is accessible
   - Review domain limiting logic

### Debug Mode

Enable debug logging by adding to frontend:

```javascript
window.DEBUG_EMAIL_CAMPAIGNS = true;
```

## Performance Optimization

### Indexing

Create these Firestore indexes:

```javascript
// sentEmails collection
- accountId (ascending), sentAt (descending)
- accountId (ascending), to (ascending)
- accountId (ascending), from (ascending)

// receivedEmails collection  
- accountId (ascending), receivedAt (descending)
- accountId (ascending), to (ascending)
- accountId (ascending), from (ascending)

// emailQueue collection
- status (ascending), sendAt (ascending)
- accountId (ascending), status (ascending)
```

### Caching

Consider implementing Redis caching for:
- Search results (5 minute cache)
- Queue status (30 second cache)
- Calendar data (1 hour cache)

## Future Enhancements

### Planned Features

1. **Email Templates**
   - Save and reuse reply templates
   - Template variables for personalization

2. **Advanced Filtering**
   - Filter by date range
   - Filter by email thread
   - Filter by domain

3. **Analytics**
   - Campaign performance tracking
   - Response rate monitoring
   - A/B testing for reply content

4. **Automation**
   - Auto-reply rules
   - Smart scheduling based on recipient timezone
   - Follow-up automation

### API Extensions

Future API endpoints:

```javascript
GET /campaigns/reply-all/:id - Get campaign details
PUT /campaigns/reply-all/:id - Update campaign
DELETE /campaigns/reply-all/:id - Cancel campaign
GET /campaigns/reply-all/:id/analytics - Campaign analytics
```

## Support

For issues or questions:
1. Check console logs for error details
2. Verify Firebase permissions and configuration
3. Test individual API endpoints with curl/Postman
4. Review integration with existing Railway system

## Conclusion

The Email Reply Campaigns system seamlessly integrates with your existing infrastructure while providing powerful new functionality for managing email conversations and reply campaigns. The modular design ensures compatibility and allows for future enhancements without disrupting existing workflows.





