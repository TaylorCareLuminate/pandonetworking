# Background Jobs - Quick Start for Taylor

Hey Taylor,

I've created the automated background jobs for the call assignment system. These handle the maintenance tasks so the system runs hands-free.

---

## What You Need to Know

### **3 Jobs That Run Automatically:**

1. **Release Expired Assignments** - Every 15 minutes
   - Frees up calls from agents who went idle
   - Prevents calls from being stuck

2. **Daily Rebalance** - 2 PM Mountain Time daily
   - Clears all assignments for fresh start
   - Redistributes based on current reservations

3. **Cleanup Abandoned** - Every hour
   - Marks reservations as abandoned if no activity for 24h
   - **IMPORTANT**: Only checks reservations that have already started (ignores future reservations)
   - Keeps data clean

---

## Critical Fix Applied

**Issue Found:** The cleanup job was incorrectly checking ALL active reservations, including future ones.

**Problem:** If someone reserved calls for 3 days from now, the job would mark it as "abandoned" because there was no activity yet.

**Fix:** Added logic to skip reservations where `startDate` is in the future or less than 24 hours old. Now only checks reservations that should have activity by now.

---

## Files I'm Sending You

```
jobs/
├── call-assignment-jobs.js          # Node.js version (runs on server)
├── package.json                     # Dependencies for Node.js
├── BACKGROUND_JOBS_SETUP.md         # Detailed setup guide
└── MESSAGE_FOR_TAYLOR.md            # This file

functions/
├── index.js                         # Firebase Functions version (serverless)
└── package.json                     # Dependencies for Functions
```

---

## Which Deployment Should You Use?

### **I Recommend: Firebase Cloud Functions** ⭐

**Why:**
- No server to maintain
- $0 cost (well within free tier)
- Already integrated with your Firebase
- 15-minute setup
- Automatic monitoring in Firebase Console

**Setup:**
```bash
# 1. Install Firebase CLI (if not already)
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Copy functions/index.js to your project's functions folder

# 4. Deploy
cd functions
npm install
firebase deploy --only functions
```

**Done!** Functions will start running on schedule automatically.

---

## Alternative: Node.js Cron Job

If you prefer running on your own server:

**Setup:**
```bash
# 1. Get Firebase service account key from Firebase Console
#    Project Settings → Service Accounts → Generate New Private Key

# 2. Save as serviceAccountKey.json in jobs/ folder

# 3. Install and run
cd jobs
npm install
node call-assignment-jobs.js
```

**Keep running with PM2:**
```bash
npm install -g pm2
pm2 start call-assignment-jobs.js --name "call-jobs"
pm2 save
pm2 startup
```

---

## Testing

### **Manual Test (from admin dashboard):**
1. Go to: https://healthluminate.com/crm/call-assignments.html
2. Click "Release Expired Assignments"
3. Should see: "Released X expired assignments"

This is the same thing the automated job does.

### **Verify Jobs Are Running:**

**Firebase Functions:**
- Go to: Firebase Console → Functions
- You'll see 3 scheduled functions + 2 manual triggers
- Click any function → Logs tab to see execution history

**Node.js:**
```bash
# Check if running
ps aux | grep call-assignment

# View logs
pm2 logs call-jobs
```

---

## What If Something Goes Wrong?

### **Jobs not running:**
- **Firebase**: Check Firebase Console → Functions → Logs
- **Node.js**: Check process is running: `pm2 status`

### **Errors in execution:**
- Most errors are logged - check logs
- Jobs have retry logic built-in
- Can always trigger manually from admin dashboard

### **Need to change schedule:**
Edit the config in the respective file:
```javascript
// Firebase: functions/index.js
.pubsub.schedule('every 15 minutes') // Change this

// Node.js: call-assignment-jobs.js
RELEASE_INTERVAL_MINUTES: 15, // Change this
```

---

## Cost

### **Firebase Functions:**
- **Free tier**: 2 million invocations/month
- **Our usage**: ~3,630 invocations/month
- **Cost**: $0/month (0.18% of free tier)

### **Node.js Server:**
- Depends on your hosting
- If you already have a server: $0
- If need new server: ~$5-8/month

---

## Timeline

**Immediate (Manual):**
- System works now
- Admin can manually trigger via dashboard
- Requires manual intervention

**After Setup (Automated):**
- System fully hands-free
- Jobs run automatically
- Zero manual intervention needed

---

## My Recommendation

**Deploy Firebase Functions today:**

1. Takes 15 minutes
2. Copy `functions/index.js` to your project
3. Run `firebase deploy --only functions`
4. Verify in Firebase Console
5. Done!

Then monitor for 24 hours to ensure jobs run correctly.

---

## Questions?

**If you hit issues:**

1. Check `BACKGROUND_JOBS_SETUP.md` - very detailed guide
2. Test manually first from admin dashboard
3. Verify timezone is correct (currently Mountain Time)
4. Check logs in Firebase Console

**Common gotchas:**
- Need Blaze plan for Firebase Functions (still $0 for our usage)
- Service account key must be kept secure (never commit to git)
- Timezone affects when daily rebalance runs

---

## Summary

**What it is:** Automated maintenance for the call assignment system

**What it does:** 
- Frees idle agent calls (15 min)
- Daily reset (2 PM)
- Cleanup abandoned reservations (hourly)

**How to deploy:**
- **Easy way**: Firebase Functions (15 min setup, $0 cost)
- **Traditional way**: Node.js server (1-2 hr setup, server required)

**Result:** System runs 100% automated, zero manual intervention

---

Let me know if you have questions or hit any issues!

— AI Assistant

