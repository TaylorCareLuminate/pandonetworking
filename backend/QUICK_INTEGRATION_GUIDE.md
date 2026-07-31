# Quick Integration Guide for Email Reply Campaigns

## The Issue
You're getting a 404 error because the new API endpoints don't exist on your Railway server yet:
- `/emails/search` 
- `/campaigns/schedule-reply-all`

## Solution 2: Quick Backend Integration (Recommended)

To add the new API endpoints to your existing Railway server, follow these steps:

### Step 1: Add the API file to your Railway project

Copy the `email-reply-campaigns-api.js` file to your Railway project directory.

### Step 2: Update your main server file

In your Railway server's main file (usually `app.js`, `server.js`, or `index.js`), add these lines:

```javascript
// Add this near the top with other requires
const emailReplyCampaignsAPI = require('./email-reply-campaigns-api');

// Add this after your existing routes but before app.listen()
app.use('/', emailReplyCampaignsAPI);
```

### Step 3: Ensure dependencies are installed

Make sure your `package.json` includes these dependencies:

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "firebase-admin": "^12.0.0"
  }
}
```

### Step 4: Deploy to Railway

1. Commit and push your changes to your Railway-connected repository
2. Railway will automatically redeploy with the new endpoints

### Step 5: Test

Once deployed, try the email search again. You should see:
- "✅ Search completed via API:" instead of fallback messages
- Full IMAP email search functionality instead of demo results

## Current Fallback System

While you integrate the backend, the system will work with fallback features:

**Email Search Fallback:**
- ✅ Searches your existing sent emails  
- ✅ Shows demo results for testing the interface
- ⚠️ Limited to sent emails only (no inbox search)

**Campaign Scheduling Fallback:**
- ✅ Uses existing `/schedule-email` endpoint
- ✅ Basic domain limiting (2 per domain per hour)
- ✅ Simple 5-minute spacing between emails
- ⚠️ No advanced calendar integration

## After Integration

Once you integrate the backend API, you'll get:

**Enhanced Email Search:**
- 🔍 Full IMAP search across sent + received emails
- 🎯 Search by name, email, or content
- 📧 Most recent conversation per unique contact
- ⚡ Fast, indexed search results

**Advanced Campaign Scheduling:**
- 📅 Full calendar integration with your existing system
- 🚦 Smart scheduling based on available days
- 🌍 Timezone-aware scheduling
- 📊 Better queue management and capacity analysis

## Troubleshooting

**If you get errors after integration:**

1. **"Module not found"** - Make sure `email-reply-campaigns-api.js` is in the same directory as your main server file

2. **"Cannot read property 'collection'"** - Ensure Firebase Admin is properly initialized in your main app

3. **CORS errors** - The API includes CORS headers, but you might need to adjust them for your domain

4. **500 errors** - Check your Railway logs for detailed error messages

## Next Steps

1. **Test the current system** - Even with fallbacks, you can create and schedule reply campaigns
2. **Integrate when ready** - The backend integration takes about 10 minutes
3. **Enhance with IMAP** - For full email search, integrate with your IMAP system (see full integration guide)

## Support

The system is designed to work immediately with fallbacks, then enhance when you integrate the backend. If you have issues:

1. Check the browser console for detailed error messages
2. Test with demo data first to verify the interface works
3. Use existing email controls to monitor scheduled emails

The fallback system ensures you can start using reply campaigns immediately while you work on the full integration!




