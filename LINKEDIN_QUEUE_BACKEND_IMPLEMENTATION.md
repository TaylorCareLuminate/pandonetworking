# LinkedIn Message Queue Processor - Railway Backend Implementation

## Overview
This document explains how to add the LinkedIn message queue processor to your Railway backend.

## Required Endpoint

### POST `/heyreach/send-scheduled-messages`

This endpoint should run every 10 minutes (via cron job or scheduled task) to process pending messages.

## Implementation Code (Node.js/Express)

```javascript
// Add this to your Railway backend (e.g., routes/heyreach.js)

const admin = require('firebase-admin');
const axios = require('axios');

/**
 * Process LinkedIn message queue
 * Checks for messages scheduled to be sent within the next 10 minutes
 * and sends them via HeyReach API
 */
app.post('/heyreach/send-scheduled-messages', async (req, res) => {
    try {
        console.log('🕐 Processing LinkedIn message queue...');
        
        const db = admin.firestore();
        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);
        
        // Query for pending messages that should be sent in the next 10 minutes
        const queueRef = db.collection('linkedin_message_queue');
        const snapshot = await queueRef
            .where('status', '==', 'pending')
            .where('scheduledTime', '<=', admin.firestore.Timestamp.fromDate(tenMinutesFromNow))
            .get();
        
        console.log(`📊 Found ${snapshot.size} messages to process`);
        
        if (snapshot.empty) {
            return res.json({
                success: true,
                processed: 0,
                message: 'No messages to send'
            });
        }
        
        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        const results = [];
        
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            const messageId = doc.id;
            
            try {
                console.log(`📤 Processing message to ${messageData.recipientName}...`);
                
                // STEP 1: Check if this exact message was already sent to this contact
                const isDuplicate = await checkForDuplicateMessage(
                    messageData.bdrEmail,
                    messageData.recipientLinkedInUrl,
                    messageData.message
                );
                
                if (isDuplicate) {
                    console.log(`⚠️ Duplicate message detected for ${messageData.recipientName}, skipping...`);
                    
                    await queueRef.doc(messageId).update({
                        status: 'skipped',
                        skippedAt: admin.firestore.FieldValue.serverTimestamp(),
                        skipReason: 'Duplicate message already sent to this contact'
                    });
                    
                    skippedCount++;
                    results.push({
                        contactId: messageData.recipientContactId,
                        contactName: messageData.recipientName,
                        status: 'skipped',
                        reason: 'Duplicate'
                    });
                    continue;
                }
                
                // STEP 2: Send message via HeyReach API
                const heyreachResult = await sendViaHeyReach(messageData);
                
                if (heyreachResult.success) {
                    // Update status to sent
                    await queueRef.doc(messageId).update({
                        status: 'sent',
                        sentAt: admin.firestore.FieldValue.serverTimestamp(),
                        heyreachMessageId: heyreachResult.messageId,
                        heyreachResponse: heyreachResult.data
                    });
                    
                    sentCount++;
                    results.push({
                        contactId: messageData.recipientContactId,
                        contactName: messageData.recipientName,
                        status: 'sent'
                    });
                    
                    console.log(`✅ Sent message to ${messageData.recipientName}`);
                } else {
                    throw new Error(heyreachResult.error || 'Failed to send via HeyReach');
                }
                
            } catch (error) {
                console.error(`❌ Error sending to ${messageData.recipientName}:`, error);
                
                // Update status to failed
                await queueRef.doc(messageId).update({
                    status: 'failed',
                    failedAt: admin.firestore.FieldValue.serverTimestamp(),
                    error: error.message,
                    retryCount: (messageData.retryCount || 0) + 1
                });
                
                failedCount++;
                results.push({
                    contactId: messageData.recipientContactId,
                    contactName: messageData.recipientName,
                    status: 'failed',
                    error: error.message
                });
            }
            
            // Add small delay between messages to avoid rate limiting
            await sleep(2000); // 2 seconds between messages
        }
        
        console.log(`✅ Queue processing complete: ${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped`);
        
        res.json({
            success: true,
            processed: snapshot.size,
            sent: sentCount,
            failed: failedCount,
            skipped: skippedCount,
            results: results
        });
        
    } catch (error) {
        console.error('❌ Error processing message queue:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check if this exact message was already sent to this contact
 * This duplicates the logic from review_replies.html for checking conversations
 */
async function checkForDuplicateMessage(bdrEmail, recipientLinkedInUrl, messageText) {
    try {
        const db = admin.firestore();
        const normalizedUrl = recipientLinkedInUrl.toLowerCase().trim();
        
        // Query inbox conversations for this contact
        const inboxQueries = [
            db.collection('heyreach_inbox')
                .where('bdrEmail', '==', bdrEmail)
                .where('leadProfileUrl', '==', recipientLinkedInUrl)
                .get(),
            db.collection('heyreach_inbox')
                .where('accountEmail', '==', bdrEmail)
                .where('leadProfileUrl', '==', recipientLinkedInUrl)
                .get()
        ];
        
        const results = await Promise.all(inboxQueries);
        
        // Check all conversations for this contact
        for (const snapshot of results) {
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const messages = data.rawData?.messages || [];
                
                // Check if any message from the BDR matches this text
                for (const msg of messages) {
                    if ((msg.sender === 'ME' || msg.sender === 'account') && 
                        msg.body && 
                        msg.body.trim() === messageText.trim()) {
                        console.log(`🔍 Found duplicate: Message already sent to ${recipientLinkedInUrl}`);
                        return true;
                    }
                }
            }
        }
        
        // Also check webhook activities
        const webhookSnapshot = await db.collection('heyreach_activity')
            .where('eventType', '==', 'MESSAGE_SENT')
            .where('bdrEmail', '==', bdrEmail)
            .where('leadProfileUrl', '==', recipientLinkedInUrl)
            .get();
        
        for (const doc of webhookSnapshot.docs) {
            const data = doc.data();
            if (data.messageBody && data.messageBody.trim() === messageText.trim()) {
                console.log(`🔍 Found duplicate in webhooks: Message already sent to ${recipientLinkedInUrl}`);
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking for duplicate:', error);
        // If we can't check, err on the side of caution and skip
        return true;
    }
}

/**
 * Send message via HeyReach API
 */
async function sendViaHeyReach(messageData) {
    try {
        // Get HeyReach API credentials for this BDR
        const heyreachConfig = await getHeyReachConfig(messageData.bdrEmail);
        
        if (!heyreachConfig || !heyreachConfig.apiKey) {
            throw new Error('HeyReach API key not found for this BDR');
        }
        
        // Prepare HeyReach API request
        const heyreachUrl = 'https://api.heyreach.io/api/v1/message/send';
        
        const requestBody = {
            linkedInAccountId: messageData.recipientLinkedInAccountId,
            customerId: messageData.recipientCustomerId,
            conversationId: messageData.conversationId,
            message: messageData.message,
            recipientProfileUrl: messageData.recipientLinkedInUrl
        };
        
        console.log('📤 Sending to HeyReach:', requestBody);
        
        const response = await axios.post(heyreachUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${heyreachConfig.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        if (response.data && response.status === 200) {
            return {
                success: true,
                messageId: response.data.messageId || response.data.id,
                data: response.data
            };
        } else {
            throw new Error('Unexpected HeyReach response');
        }
        
    } catch (error) {
        console.error('❌ HeyReach API error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * Get HeyReach configuration for a BDR
 */
async function getHeyReachConfig(bdrEmail) {
    try {
        const db = admin.firestore();
        
        // Try to get from linkedin_accounts collection
        const accountsSnapshot = await db.collection('linkedin_accounts')
            .where('email', '==', bdrEmail)
            .limit(1)
            .get();
        
        if (!accountsSnapshot.empty) {
            const accountData = accountsSnapshot.docs[0].data();
            return {
                apiKey: accountData.heyreachApiKey || accountData.apiKey,
                accountId: accountData.linkedInAccountId
            };
        }
        
        // Fallback: try bdr_leaders collection
        const bdrSnapshot = await db.collection('bdr_leaders')
            .where('email', '==', bdrEmail)
            .limit(1)
            .get();
        
        if (!bdrSnapshot.empty) {
            const bdrData = bdrSnapshot.docs[0].data();
            return {
                apiKey: bdrData.heyreachApiKey,
                accountId: bdrData.linkedInAccountId
            };
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error getting HeyReach config:', error);
        return null;
    }
}

/**
 * Helper sleep function
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Cron Job Setup

### Option 1: Using Railway Cron (if available)
Add to your `railway.toml` or cron configuration:
```
[cron]
schedule = "*/10 * * * *"  # Every 10 minutes
command = "curl -X POST https://your-railway-url.railway.app/heyreach/send-scheduled-messages"
```

### Option 2: Using Node-Cron
Install: `npm install node-cron`

Add to your main server file:
```javascript
const cron = require('node-cron');
const axios = require('axios');

// Run every 10 minutes
cron.schedule('*/10 * * * *', async () => {
    try {
        console.log('⏰ Running scheduled message processor...');
        const response = await axios.post('http://localhost:YOUR_PORT/heyreach/send-scheduled-messages');
        console.log('✅ Processor result:', response.data);
    } catch (error) {
        console.error('❌ Processor error:', error.message);
    }
});
```

### Option 3: External Cron Service
Use a service like:
- **cron-job.org** (free, easy setup)
- **EasyCron**
- **Google Cloud Scheduler**

Configure to call your endpoint every 10 minutes:
```
URL: https://railwayclemail-production.up.railway.app/heyreach/send-scheduled-messages
Method: POST
Schedule: */10 * * * * (every 10 minutes)
```

## Database Collection Structure

### Collection: `linkedin_message_queue`

```javascript
{
    id: string,                          // Unique slot ID
    bdrEmail: string,                    // BDR who scheduled the message
    recipientContactId: string,          // Contact ID from heyreach_activity
    recipientName: string,               // Contact full name
    recipientLinkedInUrl: string,        // LinkedIn profile URL
    recipientLinkedInAccountId: string,  // HeyReach LinkedIn account ID
    recipientCustomerId: string,         // HeyReach customer ID
    message: string,                     // Message text to send
    scheduledTime: Timestamp,            // When to send (Mountain Time)
    createdAt: Timestamp,                // When queued
    createdBy: string,                   // Email of user who scheduled
    status: 'pending' | 'sent' | 'failed' | 'skipped',
    
    // If sent successfully:
    sentAt: Timestamp,
    heyreachMessageId: string,
    heyreachResponse: object,
    
    // If failed:
    failedAt: Timestamp,
    error: string,
    retryCount: number,
    
    // If skipped (duplicate):
    skippedAt: Timestamp,
    skipReason: string
}
```

## Firestore Security Rules

Add these rules to your Firestore:

```javascript
match /linkedin_message_queue/{queueId} {
    // Allow authenticated users to read their own queued messages
    allow read: if request.auth != null && 
                (request.auth.token.email == resource.data.bdrEmail ||
                 request.auth.token.email in ['taylordavis@careluminate.com']);
    
    // Allow authenticated users to create messages for themselves
    allow create: if request.auth != null && 
                  request.auth.token.email == request.resource.data.bdrEmail;
    
    // Allow system (Railway backend) to update any message
    // NOTE: Backend should use admin SDK which bypasses these rules
    
    // Allow users to delete their own pending messages
    allow delete: if request.auth != null && 
                  request.auth.token.email == resource.data.bdrEmail &&
                  resource.data.status == 'pending';
}
```

## HeyReach API Integration

### API Endpoint (Example - adjust based on actual HeyReach API docs)

```
POST https://api.heyreach.io/api/v1/message/send

Headers:
  Authorization: Bearer YOUR_HEYREACH_API_KEY
  Content-Type: application/json

Body:
{
  "linkedInAccountId": "string",
  "customerId": "string", 
  "conversationId": "string" (optional, if replying to existing conversation),
  "message": "string",
  "recipientProfileUrl": "string"
}

Response:
{
  "success": true,
  "messageId": "string",
  "status": "sent"
}
```

**Note:** You'll need to verify the exact HeyReach API endpoints and parameters from your HeyReach account documentation. The above is based on common patterns.

## Testing the Implementation

### 1. Test Queue Creation
- Go to review_replies.html
- Load "Connected But No Reply" contacts
- Select a few contacts
- Click "Schedule Messages"
- Verify documents appear in `linkedin_message_queue` collection in Firestore

### 2. Test Manual Processing
- Call the endpoint manually: 
  ```
  curl -X POST https://railwayclemail-production.up.railway.app/heyreach/send-scheduled-messages
  ```
- Check Firestore to see if status changes from 'pending' to 'sent'

### 3. Test Duplicate Detection
- Try scheduling the same message to the same contact twice
- The second one should be marked as 'skipped'

## Monitoring & Logs

Add logging to track:
- ✅ Messages sent successfully
- ⚠️ Messages skipped (duplicates)
- ❌ Messages failed (with error details)
- 📊 Queue processing stats

## Error Handling

The system should:
1. **Retry failed messages**: Messages with `status: 'failed'` can be retried
2. **Alert on repeated failures**: If `retryCount` > 3, send alert to admin
3. **Handle API rate limits**: If HeyReach returns rate limit error, back off
4. **Log all errors**: Store error details for debugging

## Deployment Checklist

- [ ] Add endpoint to Railway backend
- [ ] Install required npm packages (`node-cron`, `axios`)
- [ ] Configure HeyReach API credentials
- [ ] Set up cron job (Railway, node-cron, or external service)
- [ ] Update Firestore security rules
- [ ] Test with a few messages first
- [ ] Monitor logs for first few days
- [ ] Set up alerts for failures

## Environment Variables

Add these to Railway:
```
HEYREACH_API_KEY=your_api_key_here
HEYREACH_API_URL=https://api.heyreach.io/api/v1
```

## Future Enhancements

- Email notifications when messages are sent/failed
- Retry logic for failed messages
- Per-BDR custom time windows
- Message templates library
- A/B testing different messages
- Analytics on response rates

---

**Implementation Status**: 
- ✅ Frontend UI (review_replies.html)
- ✅ Dashboard (linkedin_message_slots.html)
- ⏳ Backend endpoint (needs to be added to Railway)
- ⏳ Cron job setup (needs to be configured)
