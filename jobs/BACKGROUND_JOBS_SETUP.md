# Background Jobs Setup Guide

## Overview

These background jobs automate maintenance tasks for the call assignment system. Without these jobs, the system will work but require manual intervention via the admin dashboard.

---

## What These Jobs Do

### **Job 1: Release Expired Assignments** ⏰
**Runs**: Every 15 minutes

**Purpose**: Free up calls from idle agents

**What it does**:
1. Finds all `phone_activities` where `assignmentExpiry` is in the past
2. Clears `assignedTo`, `assignedAt`, `assignmentExpiry` fields
3. Makes those calls available for other agents to call

**Why it's needed**:
- Agents sometimes close browser or go on break without completing calls
- After 15 minutes idle, their calls should be freed for active agents
- Prevents calls from being "stuck" with inactive agents

**Example**:
```
Agent A has 10 calls assigned
Agent A goes to lunch at 12:00 PM (assignments expire at 12:15 PM)
Job runs at 12:15 PM → Releases all 10 calls
Agent B (still active) can now get those calls
```

---

### **Job 2: Daily Rebalance at 2 PM** 🔄
**Runs**: Once per day at 2:00 PM Mountain Time

**Purpose**: Daily reset of all assignments

**What it does**:
1. Finds ALL `phone_activities` with `assignedTo` set
2. Clears ALL assignments (regardless of expiry)
3. Agents get fresh assignments when they reload

**Why it's needed**:
- Clean slate for end-of-day or next-day calling
- Redistributes calls based on current reservations
- Ensures no calls are "stuck" overnight
- Scheduled time (2 PM) is when most calling winds down

**Example**:
```
Throughout the day: Agents have various calls assigned
2:00 PM hits → Job clears ALL assignments
Agent A reloads page → Gets next 10 from their reservation
Agent B reloads page → Gets next 10 from their reservation
```

---

### **Job 3: Cleanup Abandoned Reservations** 🧹
**Runs**: Every hour

**Purpose**: Mark inactive reservations as abandoned

**What it does**:
1. Finds active reservations in `callReservations`
2. Checks if user had ANY activity in last 24 hours:
   - Assignments in `phone_activities` where `assignedTo` = user
   - Completions in `phone_activities` where `completedBy` = user
3. If NO activity in 24h, marks reservation as `abandoned`
4. Releases any calls still assigned to that user

**Why it's needed**:
- Agents sometimes reserve calls but never actually make them
- Prevents "phantom reservations" from blocking other agents
- Keeps reservation data clean for reporting

**Example**:
```
Monday 9 AM: Agent A reserves 40 calls
Monday 9 AM - Tuesday 9 AM: Agent A never loads the calling page
Tuesday 9 AM: Job detects no activity in 24h
  → Marks reservation as 'abandoned'
  → Releases any assigned calls
  → Other agents can now reserve/call those contacts
```

---

## Deployment Options

You have **TWO options** for deploying these jobs. Choose the one that fits your infrastructure:

### **Option 1: Firebase Cloud Functions** ⭐ RECOMMENDED

**Pros:**
- ✅ No server to maintain
- ✅ Automatic scaling
- ✅ Built-in monitoring in Firebase Console
- ✅ Pay only for execution time (~$0/month for this use case)
- ✅ Automatic retries on failure
- ✅ Easy to deploy and update

**Cons:**
- ❌ Requires Firebase Blaze plan (pay-as-you-go, but free tier is generous)
- ❌ Cold starts (first run might be slower)

**Best for:**
- Modern serverless infrastructure
- Teams already using Firebase
- Low maintenance preference

---

### **Option 2: Node.js Cron Job** 🖥️ TRADITIONAL

**Pros:**
- ✅ Full control over execution environment
- ✅ No Firebase plan requirement
- ✅ Runs on any server/VM/container

**Cons:**
- ❌ Requires a server that's always running
- ❌ Manual monitoring and error handling
- ❌ Need to handle process crashes/restarts
- ❌ More maintenance overhead

**Best for:**
- Existing server infrastructure
- Teams that prefer traditional deployments
- Need for guaranteed execution times

---

## Setup Instructions

### **Option 1: Firebase Cloud Functions Setup**

#### **Prerequisites:**
```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login to Firebase
firebase login

# 3. Upgrade to Blaze plan (if not already)
# Go to: Firebase Console → Billing → Upgrade
```

#### **Step 1: Initialize Functions** (if not already done)
```bash
cd /path/to/your/project
firebase init functions

# Select:
# - Use existing project (select your clemail project)
# - Language: JavaScript
# - ESLint: Your preference
# - Install dependencies: Yes
```

#### **Step 2: Copy Functions Code**
```bash
# Copy the functions/index.js file to your functions directory
cp functions/index.js /path/to/your/project/functions/index.js

# Or manually copy the contents
```

#### **Step 3: Install Dependencies**
```bash
cd functions
npm install firebase-admin firebase-functions
```

#### **Step 4: Deploy**
```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:releaseExpiredAssignments
firebase deploy --only functions:dailyRebalance
firebase deploy --only functions:cleanupAbandonedReservations
```

#### **Step 5: Verify Deployment**
Check Firebase Console:
1. Go to: https://console.firebase.google.com
2. Select your project
3. Click "Functions" in left sidebar
4. You should see 5 functions:
   - `releaseExpiredAssignments` (scheduled)
   - `dailyRebalance` (scheduled)
   - `cleanupAbandonedReservations` (scheduled)
   - `manualReleaseExpired` (https)
   - `manualRebalance` (https)

#### **Step 6: Test**
```bash
# Test manual trigger endpoints
curl -X POST https://us-central1-clemail.cloudfunctions.net/manualReleaseExpired

# Or from browser console on admin dashboard:
fetch('https://us-central1-clemail.cloudfunctions.net/manualReleaseExpired', {
  method: 'POST'
}).then(r => r.json()).then(console.log)
```

#### **Monitoring:**
- View logs: Firebase Console → Functions → Logs
- Set up alerts: Firebase Console → Functions → Health tab
- See execution history: Firebase Console → Functions → Dashboard

---

### **Option 2: Node.js Cron Job Setup**

#### **Prerequisites:**
```bash
# Node.js 16 or higher
node --version

# Access to a server (Linux/Windows/Mac)
# Or use: Heroku, AWS EC2, DigitalOcean, etc.
```

#### **Step 1: Get Firebase Service Account Key**
1. Go to: Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Rename it to `serviceAccountKey.json`
5. **IMPORTANT**: Keep this file secure! Never commit to git!

#### **Step 2: Setup Project**
```bash
# Create directory
mkdir call-assignment-jobs
cd call-assignment-jobs

# Copy files
cp /path/to/jobs/call-assignment-jobs.js ./
cp /path/to/serviceAccountKey.json ./

# Create package.json
npm init -y

# Install dependencies
npm install firebase-admin
```

#### **Step 3: Test Locally**
```bash
# Run the script
node call-assignment-jobs.js

# You should see:
# 🚀 Call Assignment Background Jobs Started
# ⏰ Daily Rebalance: 14:00
# ... (and it will keep running)
```

#### **Step 4: Deploy to Production**

**Option A: Linux Server with systemd**
```bash
# Create service file
sudo nano /etc/systemd/system/call-assignment-jobs.service

# Add this content:
[Unit]
Description=Call Assignment Background Jobs
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/call-assignment-jobs
ExecStart=/usr/bin/node call-assignment-jobs.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=call-jobs

[Install]
WantedBy=multi-user.target

# Start service
sudo systemctl start call-assignment-jobs
sudo systemctl enable call-assignment-jobs
sudo systemctl status call-assignment-jobs
```

**Option B: PM2 (Process Manager)**
```bash
# Install PM2
npm install -g pm2

# Start jobs
pm2 start call-assignment-jobs.js --name "call-jobs"

# Save PM2 configuration
pm2 save

# Setup auto-start on reboot
pm2 startup
```

**Option C: Docker**
```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY call-assignment-jobs.js ./
COPY serviceAccountKey.json ./

CMD ["node", "call-assignment-jobs.js"]
```

```bash
# Build and run
docker build -t call-jobs .
docker run -d --name call-jobs --restart unless-stopped call-jobs
```

**Option D: Heroku**
```bash
# Create Heroku app
heroku create call-assignment-jobs

# Add buildpack
heroku buildpacks:add heroku/nodejs

# Deploy
git init
git add .
git commit -m "Initial commit"
git push heroku master
```

#### **Monitoring:**
```bash
# Systemd
sudo journalctl -u call-assignment-jobs -f

# PM2
pm2 logs call-jobs

# Docker
docker logs -f call-jobs
```

---

## Configuration

### **Timezone**
Currently set to `America/Denver` (Mountain Time). To change:

**Firebase Functions:**
```javascript
// In functions/index.js
const CONFIG = {
    TIMEZONE: 'America/New_York', // Change this
    // ...
};
```

**Node.js:**
```javascript
// In call-assignment-jobs.js
const CONFIG = {
    TIMEZONE: 'America/New_York', // Change this
    // ...
};
```

### **Schedule Times**
To change when jobs run:

**Firebase Functions:**
```javascript
// Release expired - every 15 minutes (default)
.pubsub.schedule('every 15 minutes')

// Daily rebalance - 2 PM (default)
.pubsub.schedule('0 14 * * *') // Change hour (14 = 2 PM)

// Cleanup - every hour (default)
.pubsub.schedule('every 60 minutes')
```

**Node.js:**
```javascript
// In call-assignment-jobs.js
const CONFIG = {
    REBALANCE_HOUR: 14, // Change to 13 for 1 PM, 15 for 3 PM, etc.
    REBALANCE_MINUTE: 0,
    RELEASE_INTERVAL_MINUTES: 15, // Change interval
    CLEANUP_INTERVAL_MINUTES: 60,
    // ...
};
```

### **Abandoned Threshold**
To change how long before reservations are abandoned:

```javascript
const CONFIG = {
    ABANDONED_THRESHOLD_HOURS: 24, // Change to 48 for 2 days, 12 for half day, etc.
    // ...
};
```

---

## Testing

### **Test Individual Functions**

**Firebase Functions:**
```bash
# Test locally before deploying
cd functions
npm run serve

# In another terminal:
curl http://localhost:5001/clemail/us-central1/manualReleaseExpired -X POST
```

**Node.js:**
```javascript
// Create test-jobs.js
const jobs = require('./call-assignment-jobs');

// Test individual job
jobs.releaseExpiredAssignments().then(result => {
    console.log('Test result:', result);
    process.exit(0);
});
```

```bash
node test-jobs.js
```

### **Verify in Admin Dashboard**

1. Go to: https://healthluminate.com/crm/call-assignments.html
2. Note current "Idle Agents" count
3. Wait for job to run (or trigger manually)
4. Refresh dashboard
5. Verify "Idle Agents" count decreased

---

## Troubleshooting

### **Firebase Functions**

**Problem**: Functions not deploying
```bash
# Check Firebase CLI version
firebase --version

# Update if needed
npm install -g firebase-tools@latest

# Check logged in
firebase login

# Verify project
firebase use --add
```

**Problem**: Functions deploying but not running
- Check Firebase Console → Functions → Logs
- Verify Blaze plan is active
- Check scheduler configuration

**Problem**: "Permission denied" errors
- Check Firestore security rules
- Firebase Functions have full admin access by default
- Issue is likely in your Firestore rules

### **Node.js Cron**

**Problem**: Process stops running
```bash
# Check if process is running
ps aux | grep call-assignment

# Check logs for crashes
journalctl -u call-assignment-jobs --since "1 hour ago"

# Verify automatic restart
sudo systemctl status call-assignment-jobs
```

**Problem**: "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Problem**: Firebase authentication errors
- Verify `serviceAccountKey.json` is in the correct location
- Check file permissions: `chmod 600 serviceAccountKey.json`
- Verify JSON file is valid: `cat serviceAccountKey.json | python -m json.tool`

---

## Cost Estimation

### **Firebase Functions (Option 1)**

**Free Tier Includes:**
- 2 million invocations/month
- 400,000 GB-seconds compute time
- 200,000 GB-seconds memory
- 5 GB network egress

**Our Usage (Estimated):**
```
Release Expired: 
  - 4 times/hour × 24 hours × 30 days = 2,880 invocations/month
  - ~10 seconds each = 28,800 seconds = 8 hours compute time

Daily Rebalance:
  - 1 time/day × 30 days = 30 invocations/month
  - ~20 seconds each = 600 seconds = 10 minutes compute time

Cleanup Abandoned:
  - 24 times/day × 30 days = 720 invocations/month
  - ~15 seconds each = 10,800 seconds = 3 hours compute time

Total: ~3,630 invocations/month (~0.18% of free tier)
Total compute: ~12 hours/month (~3% of free tier)
```

**Expected Cost: $0/month** (well within free tier)

### **Node.js Cron (Option 2)**

**Depends on hosting:**
- AWS EC2 t2.micro: ~$8.50/month (or free tier for 12 months)
- DigitalOcean Droplet: ~$5/month
- Heroku: $7/month (or can run on free dyno with limitations)
- Your own server: $0 (if already have one)

---

## Recommendation

**For HealthLuminate:** Use **Firebase Cloud Functions** (Option 1)

**Reasons:**
1. ✅ You already use Firebase/Firestore
2. ✅ $0 cost (within free tier)
3. ✅ No server maintenance
4. ✅ Built-in monitoring and logging
5. ✅ Easier to update and deploy
6. ✅ Automatic retries if failures occur

**Setup Time:**
- Firebase Functions: ~15 minutes
- Node.js Server: ~1-2 hours (including server setup)

---

## Files Provided

```
jobs/
├── call-assignment-jobs.js          # Node.js cron job script
├── BACKGROUND_JOBS_SETUP.md         # This file
└── serviceAccountKey.json           # You need to download this from Firebase

functions/
└── index.js                         # Firebase Cloud Functions
```

---

## Next Steps

1. **Choose deployment option** (Firebase Functions recommended)
2. **Follow setup instructions** for your chosen option
3. **Test manually** using admin dashboard or test scripts
4. **Monitor for 24 hours** to ensure jobs run correctly
5. **Set up alerts** (optional but recommended)

---

## Support

If you encounter issues:

1. **Check logs**:
   - Firebase: Console → Functions → Logs
   - Node.js: `journalctl -u call-assignment-jobs -f`

2. **Test manually**:
   - Use admin dashboard "Release Expired" button
   - Compare results with automated run

3. **Verify configuration**:
   - Check timezone settings
   - Verify schedule times
   - Confirm Firebase permissions

---

## Summary

These background jobs are the **final piece** of the call assignment system. They automate maintenance tasks that would otherwise require manual intervention:

- ✅ **Every 15 min**: Free up calls from idle agents
- ✅ **Daily at 2 PM**: Reset all assignments for fresh start
- ✅ **Every hour**: Clean up abandoned reservations

**Without these jobs**, the system works but requires admin to manually:
- Release expired assignments via dashboard
- Force rebalance daily
- Clean up old reservations

**With these jobs**, the system is **fully automated** and requires zero manual intervention. 🎯

