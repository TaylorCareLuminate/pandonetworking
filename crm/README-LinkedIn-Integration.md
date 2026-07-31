# LinkedIn PhantomBuster Integration Guide

## Overview
This integration connects your CRM system with PhantomBuster's [LinkedIn Outreach automation](https://phantombuster.com/automations/linkedin/4545709793535249/linkedin-outreach) to automatically send connection requests and follow-up messages based on your campaign schedules.

## Setup Instructions

### 1. PhantomBuster Configuration
1. **Sign up for PhantomBuster** at [phantombuster.com](https://phantombuster.com)
2. **Install Browser Extension**: Install the PhantomBuster Chrome/Firefox extension
3. **Connect LinkedIn Account**: 
   - Log into your LinkedIn account
   - The PhantomBuster extension will automatically detect your session
   - Alternatively, manually copy your `li_at` cookie and user agent
4. **Configure LinkedIn Outreach Phantom**:
   - Navigate to the [LinkedIn Outreach phantom](https://phantombuster.com/automations/linkedin/4545709793535249/linkedin-outreach)
   - Configure it with your LinkedIn account
   - Test that it can access your LinkedIn account

### 2. Railway Environment Setup
The `PHANTOM_API_KEY` environment variable has been added to Railway. To get your API key:
1. Go to PhantomBuster Dashboard → Account Settings
2. Find your API key in the Workspace settings
3. The key should already be configured in Railway as `PHANTOM_API_KEY`

### 3. CRM Integration
- **LinkedIn Manager**: Access at `/crm/linkedin_manager.html`
- **Campaign Integration**: LinkedIn activities are automatically scheduled when you create campaigns with LinkedIn components
- **Firebase Collections**: 
  - `scheduledLinkedin`: Stores all LinkedIn activities
  - `campaigns`: Campaign configurations with LinkedIn timelines

## How It Works

### Campaign Scheduling
1. **Create Campaign**: Use `/crm/campaigns.html` to create multi-channel campaigns
2. **Include LinkedIn Activities**: Add connection requests and follow-up messages to your timeline
3. **Schedule Campaign**: When you run a campaign, LinkedIn activities are automatically scheduled in Firebase

### Automated Processing
- **Cron Job**: Runs every 10 minutes to process scheduled LinkedIn activities
- **Rate Limiting**: Processes max 5 activities at a time with 3-second delays
- **Error Handling**: Failed activities are marked and can be retried

### Manual Processing
- **LinkedIn Manager**: View and manually process individual activities
- **Bulk Processing**: Process all scheduled activities at once
- **Status Monitoring**: Track connection requests and messages sent

## API Endpoints

### Status & Testing
- `GET /linkedin/phantom-status` - Check PhantomBuster API connection
- `GET /linkedin/connection-status` - Check LinkedIn phantom configuration
- `POST /linkedin/test-connection` - Test LinkedIn integration
- `POST /linkedin/test-phantom-api` - Test PhantomBuster API

### Activity Management
- `GET /scheduled-linkedin` - Get all scheduled LinkedIn activities
- `POST /linkedin/process-scheduled` - Process all ready activities
- `POST /linkedin/process-activity/:id` - Process single activity
- `GET /linkedin/today-stats` - Get today's LinkedIn statistics

## Firebase Collections

### scheduledLinkedin
```javascript
{
  id: "unique_id",
  to: "contact@email.com",
  contactName: "John Doe",
  organizationName: "Company Inc",
  linkedinProfile: "https://linkedin.com/in/johndoe", // optional
  scheduledDate: "2024-01-15T10:00:00Z",
  campaignId: "campaign_id",
  campaignName: "Q1 Outreach",
  activityId: "linkedin_connect",
  activityDescription: "LinkedIn connection request",
  actionType: "connection", // or "message"
  priority: "medium",
  message: "Hi John, I'd like to connect...",
  status: "scheduled", // "sent", "failed"
  createdAt: "2024-01-15T09:00:00Z",
  sentAt: "2024-01-15T10:05:00Z", // when processed
  phantomJobId: "container_id", // PhantomBuster job ID
  processedBy: "automated-cron" // or user email
}
```

## Default LinkedIn Timeline
The system includes a default campaign timeline with LinkedIn activities:
- **Day 4**: LinkedIn connection request
- **Day 28**: LinkedIn follow-up message

## Message Templates
Default messages are generated automatically:
- **Connection Request**: "Hi [FirstName], I'd like to connect with you to discuss potential opportunities at [Company]. Looking forward to connecting!"
- **Follow-up Message**: "Hi [FirstName], I wanted to follow up on my connection request. I'm interested in discussing how we can help [Company] with healthcare technology solutions. Would you be open to a brief conversation?"

## Rate Limiting & Best Practices
- **Daily Limit**: Max 50 activities per day (configurable)
- **Delays**: 3-second delays between activities
- **Processing**: Max 5 activities per cron run (every 10 minutes)
- **Weekends**: Business activities automatically skip weekends
- **Retry Logic**: Failed activities can be retried up to 3 times

## Monitoring & Analytics
- **LinkedIn Manager Dashboard**: Real-time status and statistics
- **Today's Stats**: Connection requests and messages sent today
- **Activity Log**: Complete history of all LinkedIn activities
- **Error Tracking**: Failed activities with detailed error messages

## Troubleshooting

### Common Issues
1. **API Key Issues**: Check `PHANTOM_API_KEY` environment variable
2. **LinkedIn Session Expired**: Re-authenticate in PhantomBuster
3. **Rate Limiting**: LinkedIn may temporarily restrict activities
4. **Phantom Configuration**: Ensure LinkedIn Outreach phantom is properly configured

### Error Messages
- `PhantomBuster API key not configured`: Set `PHANTOM_API_KEY` environment variable
- `LinkedIn Outreach phantom not found`: Configure the phantom in PhantomBuster dashboard
- `PhantomBuster launch failed`: Check phantom configuration and LinkedIn session

### Debug Steps
1. Test PhantomBuster API connection in LinkedIn Manager
2. Test LinkedIn connection in LinkedIn Manager  
3. Check server logs for detailed error messages
4. Verify phantom configuration in PhantomBuster dashboard

## Security Considerations
- API keys are stored securely in Railway environment variables
- LinkedIn sessions are managed through PhantomBuster's secure system
- All activities are logged for audit purposes
- Rate limiting prevents LinkedIn account restrictions

## Support Links
- [PhantomBuster LinkedIn Outreach Documentation](https://phantombuster.com/automations/linkedin/4545709793535249/linkedin-outreach)
- [PhantomBuster Support](https://support.phantombuster.com/)
- [LinkedIn Best Practices](https://support.phantombuster.com/hc/en-us/articles/24572365472786-How-to-Connect-Your-LinkedIn-Account-to-PhantomBuster)
