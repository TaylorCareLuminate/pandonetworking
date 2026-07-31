# HeyReach Auto-Resume Setup Guide

This guide explains how to set up the nightly auto-resume process for HeyReach campaigns.

## Overview

The auto-resume system automatically resumes paused or completed "Connect" and "Message" campaigns every night at 2:00 AM. This ensures that priority campaigns are always running.

## Files

- **`heyreach-auto-resume.js`** - Main job script that processes all customers and resumes campaigns
- **`schedule-heyreach-auto-resume.bat`** - Windows batch file to schedule the job
- **`schedule-heyreach-auto-resume.ps1`** - PowerShell script for advanced scheduling
- **`../crm/heyreach_campaigns.html`** - Web interface for manual campaign management

## Prerequisites

1. **Node.js** installed on your system
2. **Firebase Admin SDK** credentials (serviceAccountKey.json)
3. **Customer HeyReach API keys** configured in Firebase
4. **Windows Task Scheduler** (for Windows) or **cron** (for Linux/Mac)

## Setup Instructions

### Step 1: Install Dependencies

```bash
cd jobs
npm install firebase-admin
```

### Step 2: Configure Firebase Admin

Place your Firebase service account key file in the `jobs` directory:

```
jobs/
  └── serviceAccountKey.json
```

To get your service account key:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the file as `serviceAccountKey.json` in the `jobs` directory

### Step 3: Test the Script

Before scheduling, test that the script works:

```bash
node heyreach-auto-resume.js
```

You should see output like:

```
╔════════════════════════════════════════════════════════╗
║   HeyReach Auto-Resume Job                             ║
║   Automatically resume priority campaigns              ║
╚════════════════════════════════════════════════════════╝

🔍 Fetching customers with HeyReach enabled...
✅ Found 2 customers with HeyReach enabled

📊 Processing customer: Acme Corp
   🔍 Fetching campaigns...
   📋 Found 5 campaigns
   ▶️  Resuming "Connect Campaign Q1" (connect, status: 2)
   ✅ Successfully resumed "Connect Campaign Q1"

...

╔════════════════════════════════════════════════════════╗
║   FINAL SUMMARY                                        ║
╚════════════════════════════════════════════════════════╝

📊 Customers Processed: 2
   ✅ Successful: 2
   ❌ Failed: 0

▶️  Total Campaigns Resumed: 3

⏱️  Duration: 4.52s

✅ Auto-resume job completed successfully!
```

### Step 4: Schedule the Job

#### Option A: Windows Task Scheduler (Recommended for Windows)

1. Run the PowerShell script as Administrator:

```powershell
# Right-click PowerShell and "Run as Administrator"
cd C:\repos\HealthLuminateSiteFromLocal\jobs
.\schedule-heyreach-auto-resume.ps1
```

This will create a scheduled task that runs every night at 2:00 AM.

#### Option B: Manual Windows Task Scheduler Setup

1. Open Task Scheduler (`taskschd.msc`)
2. Click "Create Task" (not "Create Basic Task")
3. **General tab:**
   - Name: `HeyReach Auto-Resume`
   - Description: `Automatically resume priority HeyReach campaigns`
   - Run whether user is logged on or not: ✓
   - Run with highest privileges: ✓
4. **Triggers tab:**
   - Click "New"
   - Begin the task: On a schedule
   - Daily, at 2:00 AM
   - Recur every: 1 days
   - Enabled: ✓
5. **Actions tab:**
   - Click "New"
   - Action: Start a program
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `heyreach-auto-resume.js`
   - Start in: `C:\repos\HealthLuminateSiteFromLocal\jobs`
6. **Conditions tab:**
   - Uncheck "Start the task only if the computer is on AC power" (if laptop)
   - Check "Wake the computer to run this task" (optional)
7. Click "OK"

#### Option C: Linux/Mac (cron)

1. Edit your crontab:

```bash
crontab -e
```

2. Add this line (runs at 2:00 AM daily):

```cron
0 2 * * * cd /path/to/HealthLuminateSiteFromLocal/jobs && /usr/bin/node heyreach-auto-resume.js >> /var/log/heyreach-auto-resume.log 2>&1
```

### Step 5: Verify Setup

1. Check that the scheduled task was created:
   - Open Task Scheduler
   - Find "HeyReach Auto-Resume" in the task list
   - Right-click → "Run" to test it immediately

2. Check logs in Firebase:
   - Go to Firebase Console → Firestore
   - Check the `system_logs` collection
   - Look for documents with `type: "heyreach_auto_resume"`

3. Use the web interface:
   - Open `crm/heyreach_campaigns.html`
   - Click "Test Auto-Resume Process" to manually test

## How It Works

### Campaign Detection

The system detects campaign types based on their names:

- **Connect campaigns**: Names containing "connect" or "connection"
- **Message campaigns**: Names containing "message" or "msg"

These are considered "priority campaigns" and will be automatically resumed if paused or completed.

### Campaign Status Codes

- **0** = Draft (not processed)
- **1** = Running (skipped, already active)
- **2** = Paused (will be resumed)
- **3** = Completed (will be resumed)

### Process Flow

1. **Fetch Customers**: Get all active customers with HeyReach enabled
2. **For Each Customer**:
   - Fetch all campaigns using their HeyReach API key
   - Identify priority campaigns (Connect & Message)
   - Check if they're paused or completed
   - Resume them via HeyReach API
3. **Log Results**: Save summary to Firebase `system_logs` collection

## Manual Management

Use the web interface at `crm/heyreach_campaigns.html` to:

- View all campaigns for each customer
- See campaign status, progress, and statistics
- Manually resume individual campaigns
- Resume all priority campaigns at once
- Test the auto-resume process

## Troubleshooting

### Script doesn't run

1. Check Task Scheduler history:
   - Task Scheduler → View → Show All Running Tasks
   - Find your task → History tab

2. Verify Node.js path:
   ```batch
   where node
   ```
   Update the path in Task Scheduler if needed

### "No customers found"

1. Check Firebase:
   - Customers must have `heyreachEnabled: true`
   - Customers must have `status: 'active'`
   - Customers must have a valid `heyreachApiKey`

2. Verify in `admin/email_controls.html`:
   - Enable HeyReach for at least one customer
   - Add their HeyReach API key

### "API key error"

1. Verify API key is correct:
   - Log into HeyReach
   - Go to Settings → API
   - Copy the API key
   - Update in Firebase customer document

2. Check Railway proxy is running:
   - The script uses `clemailapi-production.up.railway.app`
   - Verify the proxy is accessible

### Campaigns not resuming

1. Check campaign names:
   - Must contain "connect", "connection", "message", or "msg"
   - Case-insensitive

2. Check campaign status:
   - Only paused (2) or completed (3) campaigns are resumed
   - Running campaigns (1) are skipped

3. Verify in web interface:
   - Open `crm/heyreach_campaigns.html`
   - Click "Test Auto-Resume Process"
   - Check console for errors

## Monitoring

### View Logs

Check Firebase Firestore `system_logs` collection for entries:

```javascript
{
  type: "heyreach_auto_resume",
  timestamp: "2024-11-25T02:00:00Z",
  status: "completed",
  totalCustomersProcessed: 2,
  successfulCustomers: 2,
  totalCampaignsResumed: 3,
  duration: 4.52,
  results: [...]
}
```

### Email Notifications (Future Enhancement)

To add email notifications when campaigns are resumed:

1. Install nodemailer:
   ```bash
   npm install nodemailer
   ```

2. Add email configuration to `heyreach-auto-resume.js`

3. Send email summary at the end of the job

## Configuration

### Environment Variables

You can set these environment variables:

- `RAILWAY_API_URL` - Override the Railway proxy URL (default: `https://clemailapi-production.up.railway.app`)
- `FIREBASE_SERVICE_ACCOUNT` - Path to service account key file

Example:

```batch
set RAILWAY_API_URL=https://your-custom-proxy.com
node heyreach-auto-resume.js
```

### Change Schedule

To run at a different time, update the scheduled task:

1. Open Task Scheduler
2. Right-click "HeyReach Auto-Resume" → Properties
3. Go to Triggers tab
4. Edit the trigger and change the time

## Support

For issues or questions:

1. Check the logs in `system_logs` collection
2. Test manually via `crm/heyreach_campaigns.html`
3. Run the script manually to see detailed output:
   ```bash
   node heyreach-auto-resume.js
   ```

## Future Enhancements

- [ ] Email notifications for resumed campaigns
- [ ] Slack/Teams notifications
- [ ] Dashboard showing auto-resume history
- [ ] Configurable campaign types (not just Connect & Message)
- [ ] Per-customer scheduling preferences
- [ ] Retry logic for failed resumes
- [ ] Campaign performance analytics











