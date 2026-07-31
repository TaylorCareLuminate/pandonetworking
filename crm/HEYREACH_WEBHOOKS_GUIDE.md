# HeyReach Webhook Activity System - Setup Guide

## Overview

This system allows you to receive **real-time campaign activity notifications** from HeyReach via webhooks. All events are stored in Firestore and displayed in a beautiful dashboard interface.

## 📋 What's Been Built

### 1. Backend Service (`RailwayCLemail/services/heyreach_webhook_service.js`)
- Registers webhooks with HeyReach API
- Receives and processes incoming webhook events
- Stores all activities in Firestore (`heyreach_activity` collection)
- Manages webhook lifecycle (create, list, delete)

### 2. Server Routes (`RailwayCLemail/server.js`)
- `POST /heyreach/webhook/:customerId/:eventType` - Receives webhook events from HeyReach
- `POST /heyreach/webhooks/register` - Register a single webhook
- `POST /heyreach/webhooks/register-all` - Register all event types for a customer
- `GET /heyreach/webhooks` - List registered webhooks
- `DELETE /heyreach/webhooks/:webhookId` - Delete a webhook
- `GET /heyreach/activity` - Get stored activities
- `GET /heyreach/activity/stats` - Get activity statistics

### 3. Frontend Dashboard (`HealthLuminateSite/crm/heyreach_activity.html`)
- View all campaign activities in real-time
- Filter by customer, event type, search
- Register webhooks for customers with one click
- Manage existing webhooks
- Export data to CSV
- Beautiful UI with activity feed

## 🚀 Deployment on Railway

**Good news:** Everything is already configured to work on Railway! The system uses:
- Railway URL: `https://railwayclemail-production.up.railway.app`
- Webhooks will be sent to: `https://railwayclemail-production.up.railway.app/heyreach/webhook/{customerId}/{eventType}`

### Deploy Steps:

1. **Commit and push your code to Railway:**
   ```bash
   cd RailwayCLemail
   git add .
   git commit -m "Add HeyReach webhook system"
   git push
   ```

2. **Railway will automatically deploy** (no additional config needed)

3. **Verify deployment:**
   - Check Railway logs for: `HeyReach Webhook Service initialized`
   - Test endpoint: `https://railwayclemail-production.up.railway.app/health`

## 📱 How to Use

### Step 1: Open the Dashboard

Navigate to: `https://yourdomain.com/crm/heyreach_activity.html`

### Step 2: Register Webhooks

1. Click **"Register Webhooks"** button
2. Select a customer from the dropdown
3. Click **"Register All Events"**
4. Wait for confirmation (11 webhooks will be registered)

This registers webhooks for ALL event types:
- ✅ Connection Request Sent
- ✅ Connection Request Accepted  
- ✅ Message Sent
- ✅ Message Reply Received
- ✅ InMail Sent
- ✅ InMail Reply Received
- ✅ Follow Sent
- ✅ Post Liked
- ✅ Profile Viewed
- ✅ Campaign Completed
- ✅ Lead Tag Updated

### Step 3: Monitor Activities

Once registered, you'll see real-time activities as they happen:
- New connections
- Message replies
- Profile views
- And more!

### Step 4: Manage Webhooks

Click **"Manage Webhooks"** to:
- View all registered webhooks
- See event counts
- Delete webhooks if needed

## 🗄️ Firestore Collections

### `heyreach_webhooks`
Stores webhook registrations:
```javascript
{
  customerId: string,
  customerName: string,
  webhookName: string,
  webhookUrl: string,
  eventType: string,
  campaignIds: array,
  heyreachWebhookId: string,
  status: 'active' | 'deleted',
  eventCount: number,
  lastEventAt: timestamp,
  createdAt: timestamp
}
```

### `heyreach_activity`
Stores all campaign activities:
```javascript
{
  customerId: string,
  customerName: string,
  eventType: string,
  campaignId: string,
  campaignName: string,
  linkedInAccountId: string,
  accountName: string,
  leadLinkedInId: string,
  leadProfileUrl: string,
  leadFirstName: string,
  leadLastName: string,
  leadCompany: string,
  leadPosition: string,
  leadEmail: string,
  eventData: {
    // Event-specific data
    messageText: string,
    connectionMessage: string,
    etc...
  },
  timestamp: timestamp,
  receivedAt: timestamp,
  rawData: object // Full webhook payload
}
```

## 🔍 Event Types & Use Cases

### Connection Events
- **CONNECTION_REQUEST_SENT**: Track outreach volume
- **CONNECTION_REQUEST_ACCEPTED**: Measure acceptance rate

### Message Events  
- **MESSAGE_SENT**: Monitor message activity
- **MESSAGE_REPLY_RECEIVED**: 🎯 **Hot leads!** Immediate notification of replies

### InMail Events
- **INMAIL_SENT**: Track premium outreach
- **INMAIL_REPLY_RECEIVED**: InMail engagement tracking

### Engagement Events
- **FOLLOW_SENT**: Track follow actions
- **LIKED_POST**: Content engagement
- **VIEWED_PROFILE**: Profile view tracking

### Lead Management
- **LEAD_TAG_UPDATED**: Track lead qualification changes
- **CAMPAIGN_COMPLETED**: Know when campaigns finish

## 🎨 Features

### Real-Time Updates
- Activities appear instantly via Firestore real-time listeners
- No need to refresh the page!

### Powerful Filtering
- Filter by customer
- Filter by event type
- Search across all fields
- Pagination for large datasets

### Export & Analytics
- Export to CSV for reporting
- View statistics dashboard
- Track event counts by type

### Beautiful UI
- Color-coded event types
- Activity timeline view
- Responsive design for mobile

## 🧪 Testing

### Test the Webhook Endpoint

```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/webhook/YOUR_CUSTOMER_ID/MESSAGE_REPLY_RECEIVED \
  -H "Content-Type: application/json" \
  -d '{
    "leadFirstName": "John",
    "leadLastName": "Doe",
    "leadCompany": "Test Corp",
    "campaignName": "Test Campaign",
    "message": "This is a test message",
    "timestamp": "2024-10-15T10:00:00Z"
  }'
```

### Check Firestore
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Look for `heyreach_activity` collection
4. You should see your test event!

## 🔧 Troubleshooting

### Webhooks Not Receiving Events

1. **Check Railway Logs:**
   ```bash
   # In Railway dashboard, check logs for:
   📨 Webhook event received: MESSAGE_REPLY_RECEIVED for customer ...
   ```

2. **Verify Webhook Registration:**
   - Go to heyreach_activity.html
   - Click "Manage Webhooks"
   - Ensure webhooks are status "active"

3. **Check HeyReach API Key:**
   - Ensure customer has `heyreachApiKey` in Firestore
   - Ensure `heyreachEnabled: true`

### Activities Not Showing in Dashboard

1. **Check Firestore Rules:**
   - Ensure read access to `heyreach_activity` collection

2. **Check Browser Console:**
   - Open DevTools > Console
   - Look for errors

3. **Verify Filters:**
   - Try clearing all filters
   - Select "All Customers" and "All Events"

## 🎯 What This Means for You

### Before Webhooks:
- ❌ Had to manually sync inbox periodically
- ❌ Delays in seeing new replies
- ❌ Limited visibility into campaign progress

### With Webhooks:
- ✅ **Instant notifications** when leads reply
- ✅ **Real-time tracking** of all campaign activities
- ✅ **Complete audit trail** of every action
- ✅ **Better response times** to hot leads
- ✅ **Analytics** on campaign performance

## 📊 Analytics Use Cases

With this data, you can:

1. **Response Time Tracking**: Measure time between message sent and reply received
2. **Conversion Funnels**: Track connection → message → reply → meeting
3. **Campaign Performance**: Compare activity across different campaigns
4. **Lead Scoring**: Score leads based on engagement (accepts, replies, likes)
5. **Rep Performance**: Track activities by LinkedIn account/rep

## 🔐 Security

- Webhooks are specific to each customer ID
- HeyReach validates requests (ensure your API key is secure)
- All data stored in Firestore with proper access controls
- Railway backend handles authentication

## 📝 API Reference

### Register Webhook
```javascript
POST /heyreach/webhooks/register
Body: {
  "customerId": "customer123",
  "eventType": "MESSAGE_REPLY_RECEIVED",
  "campaignIds": [] // Empty for all campaigns
}
```

### Get Activities
```javascript
GET /heyreach/activity?customerId=customer123&eventType=MESSAGE_REPLY_RECEIVED&limit=100
```

### Get Stats
```javascript
GET /heyreach/activity/stats?customerId=customer123
```

## 🎉 You're All Set!

Your HeyReach webhook system is now fully operational and ready to track **every single campaign activity** in real-time! 

The system will automatically:
- ✅ Receive webhook events from HeyReach
- ✅ Store them in Firestore  
- ✅ Display them in your dashboard
- ✅ Provide analytics and exports

**No manual polling needed!** 🚀

---

## Questions?

- Check Railway logs for webhook events
- Check Firestore for `heyreach_activity` and `heyreach_webhooks` collections
- Verify webhook registrations in the "Manage Webhooks" section
- Test with the curl command above

