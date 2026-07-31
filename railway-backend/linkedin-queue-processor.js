// LinkedIn Message Queue Processor for Railway Backend
// Add this to your Railway project (e.g., routes/heyreach.js or similar)

const admin = require('firebase-admin');
const axios = require('axios');

/**
 * Process LinkedIn message queue
 * Should be called every 10 minutes via cron job
 * 
 * POST /heyreach/send-scheduled-messages
 */
async function processLinkedInMessageQueue(req, res) {
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
}

/**
 * Check if this exact message was already sent to this contact
 * This duplicates the logic from review_replies.html for checking conversations
 */
async function checkForDuplicateMessage(bdrEmail, recipientLinkedInUrl, messageText) {
    try {
        const db = admin.firestore();
        const normalizedUrl = recipientLinkedInUrl.toLowerCase().trim();
        const normalizedMessage = messageText.trim();
        
        // Query inbox conversations for this contact
        // Check multiple fields like review_replies.html does
        const inboxQueries = [
            db.collection('heyreach_inbox')
                .where('bdrEmail', '==', bdrEmail)
                .get(),
            db.collection('heyreach_inbox')
                .where('accountEmail', '==', bdrEmail)
                .get(),
            db.collection('heyreach_inbox')
                .where('linkedInAccountEmail', '==', bdrEmail)
                .get()
        ];
        
        const results = await Promise.all(inboxQueries);
        
        // Check all conversations for this contact
        for (const snapshot of results) {
            for (const doc of snapshot.docs) {
                const data = doc.data();
                
                // Check if this conversation is with our recipient
                const conversationUrl = (data.leadProfileUrl || data.rawData?.correspondentProfile?.profileUrl || '').toLowerCase().trim();
                
                if (conversationUrl !== normalizedUrl) {
                    continue; // Not the right contact
                }
                
                const messages = data.rawData?.messages || data.messages || [];
                
                // Check if any message from the BDR matches this text
                for (const msg of messages) {
                    const isBdrMessage = msg.sender === 'ME' || msg.sender === 'account';
                    const msgBody = (msg.body || msg.text || msg.message || '').trim();
                    
                    if (isBdrMessage && msgBody === normalizedMessage) {
                        console.log(`🔍 Found duplicate in inbox: Message already sent to ${recipientLinkedInUrl}`);
                        return true;
                    }
                }
            }
        }
        
        // Also check webhook activities for MESSAGE_SENT events
        const webhookSnapshot = await db.collection('heyreach_activity')
            .where('eventType', '==', 'MESSAGE_SENT')
            .where('bdrEmail', '==', bdrEmail)
            .limit(1000)
            .get();
        
        for (const doc of webhookSnapshot.docs) {
            const data = doc.data();
            const webhookUrl = (data.leadProfileUrl || '').toLowerCase().trim();
            
            if (webhookUrl === normalizedUrl) {
                const msgBody = (data.messageBody || data.body || '').trim();
                if (msgBody === normalizedMessage) {
                    console.log(`🔍 Found duplicate in webhooks: Message already sent to ${recipientLinkedInUrl}`);
                    return true;
                }
            }
        }
        
        // Also check linkedinMessages collection
        const linkedInMessagesSnapshot = await db.collection('linkedinMessages')
            .where('bdrEmail', '==', bdrEmail)
            .get();
        
        for (const doc of linkedInMessagesSnapshot.docs) {
            const data = doc.data();
            const linkedInUrl = (data.leadProfileUrl || data.profileUrl || '').toLowerCase().trim();
            
            if (linkedInUrl === normalizedUrl) {
                const messages = data.messages || [];
                for (const msg of messages) {
                    const isBdrMessage = msg.sender === 'ME' || msg.sender === 'account';
                    const msgBody = (msg.body || msg.text || '').trim();
                    
                    if (isBdrMessage && msgBody === normalizedMessage) {
                        console.log(`🔍 Found duplicate in linkedinMessages: Message already sent`);
                        return true;
                    }
                }
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error checking for duplicate:', error);
        // If we can't check properly, err on the side of caution and skip
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
        // NOTE: Adjust URL and body structure based on actual HeyReach API documentation
        const heyreachUrl = process.env.HEYREACH_API_URL || 'https://api.heyreach.io/api/v1/message/send';
        
        const requestBody = {
            linkedInAccountId: messageData.recipientLinkedInAccountId,
            customerId: messageData.recipientCustomerId,
            conversationId: messageData.conversationId || undefined,
            message: messageData.message,
            recipientProfileUrl: messageData.recipientLinkedInUrl
        };
        
        console.log('📤 Sending to HeyReach:', {
            url: heyreachUrl,
            recipient: messageData.recipientName,
            linkedInAccountId: messageData.recipientLinkedInAccountId
        });
        
        const response = await axios.post(heyreachUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${heyreachConfig.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        if (response.data && (response.status === 200 || response.status === 201)) {
            return {
                success: true,
                messageId: response.data.messageId || response.data.id || response.data._id,
                data: response.data
            };
        } else {
            throw new Error('Unexpected HeyReach response: ' + JSON.stringify(response.data));
        }
        
    } catch (error) {
        console.error('❌ HeyReach API error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error || error.response?.data?.message || error.message
        };
    }
}

/**
 * Get HeyReach configuration for a BDR
 */
async function getHeyReachConfig(bdrEmail) {
    try {
        const db = admin.firestore();
        
        // Try to get from linkedin_accounts collection first
        const accountsSnapshot = await db.collection('linkedin_accounts')
            .where('email', '==', bdrEmail)
            .limit(1)
            .get();
        
        if (!accountsSnapshot.empty) {
            const accountData = accountsSnapshot.docs[0].data();
            return {
                apiKey: accountData.heyreachApiKey || accountData.apiKey || process.env.HEYREACH_API_KEY,
                accountId: accountData.linkedInAccountId,
                customerId: accountData.customerId
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
                apiKey: bdrData.heyreachApiKey || process.env.HEYREACH_API_KEY,
                accountId: bdrData.linkedInAccountId,
                customerId: bdrData.customerId
            };
        }
        
        // Last resort: use environment variable
        return {
            apiKey: process.env.HEYREACH_API_KEY,
            accountId: null
        };
        
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

// Export the function
module.exports = {
    processLinkedInMessageQueue,
    checkForDuplicateMessage,
    sendViaHeyReach,
    getHeyReachConfig
};

// Example Express route setup:
// const { processLinkedInMessageQueue } = require('./linkedin-queue-processor');
// app.post('/heyreach/send-scheduled-messages', processLinkedInMessageQueue);

// Example cron setup (using node-cron):
// const cron = require('node-cron');
// cron.schedule('*/10 * * * *', async () => {
//     try {
//         console.log('⏰ Running scheduled message processor...');
//         await axios.post('http://localhost:YOUR_PORT/heyreach/send-scheduled-messages');
//     } catch (error) {
//         console.error('❌ Processor error:', error.message);
//     }
// });
