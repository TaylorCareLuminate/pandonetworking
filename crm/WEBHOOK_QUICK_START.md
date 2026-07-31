# HeyReach Webhooks - Quick Start

## ✅ What Was Built

### Backend (Railway)
- ✅ `heyreach_webhook_service.js` - Webhook management service
- ✅ Server routes for receiving/managing webhooks
- ✅ Already deployed at: `https://railwayclemail-production.up.railway.app`

### Frontend  
- ✅ `heyreach_activity.html` - Activity dashboard
- ✅ Real-time activity feed
- ✅ Webhook registration UI
- ✅ Analytics & export features

### Database
- ✅ `heyreach_webhooks` collection - Stores webhook registrations
- ✅ `heyreach_activity` collection - Stores all campaign events

## 🚀 Deploy to Railway (3 Steps)

### 1. Commit & Push
```bash
cd RailwayCLemail
git add .
git commit -m "Add HeyReach webhook system"
git push origin main
```

### 2. Railway Auto-Deploys
No configuration needed! Railway will automatically:
- Install new dependencies
- Restart the server
- Make endpoints available

### 3. Verify
Check Railway logs for:
```
✅ HeyReachWebhookService initialized
✅ Server listening on port 3000
```

## 📱 How to Use (2 Minutes)

### Open Dashboard
Navigate to: `yourdomain.com/crm/heyreach_activity.html`

### Register Webhooks  
1. Click **"Register Webhooks"**
2. Select customer
3. Click **"Register All Events"**
4. Done! ✅

### Watch Activities Flow In
Activities will appear automatically as they happen in HeyReach campaigns!

## 🎯 What You'll See

**Real-time events for:**
- 🤝 Connection requests sent/accepted
- 💬 Messages sent/replies received  
- 📧 InMails sent/replies received
- 👁️ Profile views
- ❤️ Post likes
- 🏁 Campaign completions
- 🏷️ Lead tag updates

## 🔗 Webhook URLs

HeyReach will POST events to:
```
https://railwayclemail-production.up.railway.app/heyreach/webhook/{customerId}/{eventType}
```

Example:
```
https://railwayclemail-production.up.railway.app/heyreach/webhook/abc123/MESSAGE_REPLY_RECEIVED
```

## 📊 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/heyreach/webhook/:customerId/:eventType` | Receive events |
| POST | `/heyreach/webhooks/register` | Register single webhook |
| POST | `/heyreach/webhooks/register-all` | Register all events |
| GET | `/heyreach/webhooks` | List webhooks |
| DELETE | `/heyreach/webhooks/:id` | Delete webhook |
| GET | `/heyreach/activity` | Get activities |
| GET | `/heyreach/activity/stats` | Get statistics |

## 🧪 Test It

### Test Webhook Endpoint
```bash
curl -X POST https://railwayclemail-production.up.railway.app/heyreach/webhook/TEST_CUSTOMER/MESSAGE_SENT \
  -H "Content-Type: application/json" \
  -d '{
    "leadFirstName": "John",
    "leadLastName": "Doe",
    "campaignName": "Test Campaign",
    "message": "Hello!"
  }'
```

### Check Result
1. Go to `heyreach_activity.html`
2. You should see the test event!
3. Check Firestore `heyreach_activity` collection

## 💡 Pro Tips

### Automatic = Better
- ✅ No more manual inbox syncing needed for activity tracking
- ✅ Instant notifications when leads reply
- ✅ Complete audit trail of all campaign actions
- ✅ Real-time analytics

### Filter Everything
- By customer
- By event type  
- By campaign
- Search anywhere

### Export for Reporting
- Export to CSV anytime
- Use for weekly reports
- Track KPIs over time

## ⚠️ Important Notes

1. **Customer Must Have:**
   - `heyreachApiKey` in Firestore
   - `heyreachEnabled: true`

2. **Webhooks Listen to:**
   - All campaigns by default
   - Can be filtered by campaignIds if needed

3. **Events are Stored:**
   - Forever in Firestore
   - With full event details
   - Including raw webhook payload

## 🎉 Benefits

### Before Webhooks:
- Had to sync inbox manually every X minutes
- Delays in seeing replies
- Missed hot leads

### After Webhooks:
- **Instant** reply notifications
- **Complete** activity tracking  
- **Better** response times
- **Real-time** analytics

## 📞 Support

**Check if working:**
1. Railway logs: Look for `📨 Webhook event received`
2. Firestore: Check `heyreach_activity` collection
3. Dashboard: Should show activities

**Not working?**
1. Verify Railway deployment succeeded
2. Check customer has API key
3. Ensure webhooks are registered (Manage Webhooks section)
4. Check Railway logs for errors

---

## That's It! 🚀

You now have a **complete real-time tracking system** for all your HeyReach campaigns!

**Deployment:** ✅ Works on Railway  
**Setup Time:** ⏱️ 2 minutes  
**Maintenance:** 🤖 Automatic  
**Cost:** 💰 FREE (uses existing infrastructure)

Enjoy your real-time campaign intelligence! 📊✨

