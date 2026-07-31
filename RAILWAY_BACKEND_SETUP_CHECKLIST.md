# Railway Backend Setup Checklist ✅

## Before You Start

Make sure you have:
- [ ] Access to your Railway project dashboard
- [ ] Firebase Admin SDK already initialized
- [ ] HeyReach API credentials
- [ ] Node.js and npm installed locally (for testing)

---

## Step 1: Add the Code to Railway

### 1A. Copy the Processor File
1. Open `railway-backend/linkedin-queue-processor.js`
2. Copy all the code
3. In your Railway project, create new file or add to existing routes file

### 1B. Add to Express Router
Add this to your main server file (e.g., `index.js` or `app.js`):

```javascript
const { processLinkedInMessageQueue } = require('./linkedin-queue-processor');

// Add the endpoint
app.post('/heyreach/send-scheduled-messages', processLinkedInMessageQueue);
```

### 1C. Install Required Packages
```bash
npm install node-cron axios
```

Update `package.json`:
```json
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "axios": "^1.6.7",
    "firebase-admin": "^11.x.x",
    "express": "^4.x.x"
  }
}
```

---

## Step 2: Configure Environment Variables

In Railway dashboard → Your Project → Variables:

```env
# HeyReach API Configuration
HEYREACH_API_KEY=your_heyreach_api_key_here
HEYREACH_API_URL=https://api.heyreach.io/api/v1

# Optional: Node environment
NODE_ENV=production

# Your existing Firebase and other vars should already be here
```

**Where to find HeyReach API key:**
1. Log into HeyReach dashboard
2. Go to Settings → API Keys
3. Copy your API key
4. Paste into Railway environment variable

---

## Step 3: Test Manually First

### 3A. Deploy to Railway
```bash
# Commit your changes
git add .
git commit -m "Add LinkedIn message queue processor"
git push

# Railway will auto-deploy
```

### 3B. Test the Endpoint
Once deployed, test with curl:

```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/send-scheduled-messages
```

**Expected Response (if no messages pending):**
```json
{
  "success": true,
  "processed": 0,
  "message": "No messages to send"
}
```

**Expected Response (if messages sent):**
```json
{
  "success": true,
  "processed": 3,
  "sent": 2,
  "failed": 0,
  "skipped": 1,
  "results": [...]
}
```

### 3C. Check Railway Logs
In Railway dashboard:
1. Click on your project
2. Click "Logs" tab
3. Watch for output like:
   ```
   🕐 Processing LinkedIn message queue...
   📊 Found 3 messages to process
   📤 Processing message to John Doe...
   ✅ Sent message to John Doe
   ```

---

## Step 4: Set Up Cron Job

### Option A: Using node-cron (Recommended)

Add to your main server file:

```javascript
const cron = require('node-cron');
const axios = require('axios');

// Run every 10 minutes
cron.schedule('*/10 * * * *', async () => {
    try {
        console.log('⏰ Running scheduled message processor...');
        const response = await axios.post(
            'http://localhost:' + (process.env.PORT || 3000) + '/heyreach/send-scheduled-messages',
            {},
            { timeout: 55000 } // 55 second timeout
        );
        console.log('✅ Processor result:', response.data);
    } catch (error) {
        console.error('❌ Processor error:', error.message);
    }
});

console.log('⏰ Cron job scheduled: LinkedIn message processor runs every 10 minutes');
```

**Cron schedule explanation:**
- `*/10 * * * *` = Every 10 minutes
- `0 * * * *` = Every hour (alternative)
- `*/5 * * * *` = Every 5 minutes (more frequent)

### Option B: Using External Cron Service

**Recommended Service:** cron-job.org (free, reliable)

**Setup:**
1. Go to https://cron-job.org
2. Create free account
3. Click "Create cron job"
4. Fill in:
   - **Title:** "LinkedIn Message Queue Processor"
   - **URL:** `https://railwayclemail-production.up.railway.app/heyreach/send-scheduled-messages`
   - **Schedule:** Every 10 minutes
   - **Request Method:** POST
5. Save and enable

**Alternative Services:**
- EasyCron.com
- Google Cloud Scheduler
- AWS EventBridge

### Option C: Railway Cron (if available)

Check if Railway offers cron jobs:
1. Railway dashboard → Your project
2. Look for "Cron" or "Scheduled Tasks" tab
3. Add: 
   - Schedule: `*/10 * * * *`
   - Command: `curl -X POST http://localhost:$PORT/heyreach/send-scheduled-messages`

---

## Step 5: Verify It's Working

### Day 1 - Test with 1 Message
1. Go to `review_replies.html`
2. Select **1 contact only**
3. Schedule a test message for today (2 hours from now)
4. Go to `linkedin_message_slots.html`
5. Verify message appears with status "pending"
6. Wait for scheduled time
7. Check if status changes to "sent"
8. Check LinkedIn to verify message actually sent

### Day 2 - Test with 5 Messages
1. Select **5 contacts**
2. Schedule for tomorrow
3. Monitor throughout the day
4. Verify all 5 send successfully

### Day 3 - Test Duplicate Detection
1. Schedule a message to contact X
2. Wait for it to send
3. Try scheduling **same exact message** to contact X again
4. Verify it's marked as "skipped"

---

## Step 6: Set Up Monitoring

### Railway Logs
Enable log persistence in Railway:
1. Railway dashboard → Project Settings
2. Enable log retention (if available)
3. Set alerts for errors

### Firestore Monitoring
Create a simple query to check for failures:

```javascript
// Check for failed messages
db.collection('linkedin_message_queue')
  .where('status', '==', 'failed')
  .where('createdAt', '>=', yesterday)
  .get()
  .then(snapshot => {
    if (snapshot.size > 0) {
      console.warn(`⚠️ ${snapshot.size} failed messages in last 24 hours`);
    }
  });
```

### Email Alerts (Optional)
Add to processor function:

```javascript
if (failedCount > 0) {
    // Send email to admin
    sendAdminEmail({
        subject: `⚠️ ${failedCount} LinkedIn Messages Failed`,
        body: `Failed to send ${failedCount} messages. Check logs.`
    });
}
```

---

## Troubleshooting Common Issues

### Issue: "Cannot find module 'node-cron'"
**Fix:**
```bash
npm install node-cron
# Make sure it's in package.json dependencies
```

### Issue: "HeyReach API key not found"
**Fix:**
- Check Railway environment variables
- Verify `HEYREACH_API_KEY` is set correctly
- Restart Railway service after adding

### Issue: Messages stay "pending" forever
**Causes:**
1. Cron job not running
2. Wrong endpoint URL
3. Scheduled time is in the future

**Fix:**
1. Check cron job is active
2. Verify endpoint with manual curl test
3. Check `scheduledTime` in Firestore documents

### Issue: All messages marked "skipped"
**Cause:** Duplicate detection is too aggressive

**Fix:**
- Check if messages were actually sent before
- Verify LinkedIn URLs match exactly
- Check `heyreach_inbox` collection for existing conversations

### Issue: Railway timeout errors
**Cause:** Processing too many messages at once

**Fix:**
- Reduce batch size (currently processes all due in 10 min)
- Increase Railway timeout limit
- Add pagination to query

### Issue: HeyReach API returns 429 (rate limit)
**Fix:**
- Increase delay between messages (currently 2 seconds)
- Reduce messages per cycle
- Spread across longer time window

---

## Performance Optimization

### For High Volume (>100 messages/day)

**1. Batch Processing**
Instead of processing all messages at once, limit per cycle:

```javascript
const snapshot = await queueRef
    .where('status', '==', 'pending')
    .where('scheduledTime', '<=', admin.firestore.Timestamp.fromDate(tenMinutesFromNow))
    .limit(10) // Process max 10 per cycle
    .get();
```

**2. Parallel Processing**
Send multiple messages in parallel (be careful with rate limits):

```javascript
const promises = docs.map(doc => sendMessage(doc.data()));
await Promise.all(promises);
```

**3. Priority Queue**
Add priority field and process high-priority first:

```javascript
.orderBy('priority', 'desc')
.orderBy('scheduledTime', 'asc')
```

---

## Security Checklist

- [ ] HeyReach API key stored in environment variables (not in code)
- [ ] Firestore security rules prevent unauthorized access
- [ ] Endpoint doesn't expose sensitive data in responses
- [ ] Railway logs don't show API keys
- [ ] Only admins can delete/modify others' messages

---

## Final Deployment Checklist

- [ ] Code added to Railway project
- [ ] npm packages installed (`node-cron`, `axios`)
- [ ] Environment variables configured
- [ ] Manual test successful (curl)
- [ ] Cron job set up (node-cron or external)
- [ ] Test message sent successfully
- [ ] Duplicate detection tested
- [ ] Error handling tested
- [ ] Railway logs showing activity
- [ ] Firestore documents updating correctly
- [ ] LinkedIn messages actually being sent
- [ ] Dashboard showing correct status
- [ ] Monitoring/alerts configured

---

## Support & Maintenance

### Regular Checks (Weekly)
- [ ] Check Railway logs for errors
- [ ] Check Firestore for failed messages
- [ ] Verify sent messages are actually delivered
- [ ] Monitor slot usage per BDR

### Monthly Review
- [ ] Analyze response rates
- [ ] Adjust timing windows if needed
- [ ] Update message templates
- [ ] Review and clean up old queue entries

### Emergency Contacts
- **Railway Issues:** Railway support dashboard
- **HeyReach API Issues:** HeyReach support
- **Firebase Issues:** Firebase console
- **Code Issues:** Check logs, contact developer

---

## Useful Commands

### Check if cron is running:
```bash
# In Railway logs, look for:
"⏰ Cron job scheduled: LinkedIn message processor runs every 10 minutes"
```

### Manually trigger cron:
```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/send-scheduled-messages
```

### Check Firestore queue:
```javascript
// In Firebase console, run:
db.collection('linkedin_message_queue')
  .where('status', '==', 'pending')
  .orderBy('scheduledTime', 'asc')
  .limit(10)
  .get()
```

### Check Railway environment:
```bash
# In Railway project
railway env
```

---

## Next Steps After Setup

1. **Test thoroughly** with your own account first
2. **Monitor for 1 week** before rolling out to all BDRs
3. **Document any issues** you encounter
4. **Train BDRs** on how to use the system
5. **Set up reporting** on message success rates

---

## Additional Resources

- **Full Implementation Guide:** `LINKEDIN_QUEUE_BACKEND_IMPLEMENTATION.md`
- **Quick Start Guide:** `LINKEDIN_SCHEDULING_QUICK_START.md`
- **System Summary:** `LINKEDIN_SCHEDULING_SYSTEM_SUMMARY.md`
- **Railway Docs:** https://docs.railway.app/
- **HeyReach API Docs:** (Check your HeyReach account)
- **Firebase Docs:** https://firebase.google.com/docs

---

**Good luck! The frontend is ready, now just get the backend deployed and you're all set! 🚀**
