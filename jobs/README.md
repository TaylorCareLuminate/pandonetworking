# HealthLuminate Background Jobs

This directory contains background jobs and scheduled tasks for the HealthLuminate system.

## Available Jobs

### 1. HeyReach Auto-Resume (`heyreach-auto-resume.js`)

Automatically resumes paused or completed priority HeyReach campaigns (Connect & Message types).

**Schedule**: Daily at 2:00 AM

**Setup**: See [HEYREACH_AUTO_RESUME_SETUP.md](./HEYREACH_AUTO_RESUME_SETUP.md)

**Quick Start**:
```bash
# Install dependencies
npm install

# Test the job
npm run heyreach-resume

# Schedule (Windows)
schedule-heyreach-auto-resume.bat
```

**Features**:
- Automatically detects Connect and Message campaigns
- Resumes only paused/completed campaigns
- Processes all customers with HeyReach enabled
- Logs results to Firebase `system_logs` collection
- Handles rate limiting and API errors gracefully

**Web Interface**: `crm/heyreach_campaigns.html`

### 2. Call Assignment Jobs (`call-assignment-jobs.js`)

Maintains call assignment system data.

**Schedule**: As needed

**Run**:
```bash
npm start
```

## Setup

### Prerequisites

1. Node.js 16 or higher
2. Firebase Admin SDK credentials (`serviceAccountKey.json`)
3. Access to Firebase Firestore
4. Windows Task Scheduler (Windows) or cron (Linux/Mac)

### Installation

```bash
cd jobs
npm install
```

### Configuration

Place your Firebase service account key in this directory:

```
jobs/
  └── serviceAccountKey.json
```

Get the key from:
- Firebase Console → Project Settings → Service Accounts → Generate New Private Key

## Scheduling Jobs

### Windows

Use the provided batch/PowerShell scripts:

```batch
REM HeyReach Auto-Resume
schedule-heyreach-auto-resume.bat
```

Or manually via Task Scheduler (`taskschd.msc`)

### Linux/Mac

Add to crontab:

```bash
# HeyReach Auto-Resume (daily at 2 AM)
0 2 * * * cd /path/to/jobs && node heyreach-auto-resume.js >> /var/log/heyreach.log 2>&1
```

## Monitoring

### View Logs

Check Firebase Firestore `system_logs` collection:

```javascript
db.collection('system_logs')
  .where('type', 'in', [
    'heyreach_auto_resume',
    'call_assignment_job'
  ])
  .orderBy('timestamp', 'desc')
  .limit(100)
```

### Log Structure

```javascript
{
  type: "heyreach_auto_resume",
  timestamp: Timestamp,
  status: "completed" | "error",
  totalCustomersProcessed: number,
  successfulCustomers: number,
  totalCampaignsResumed: number,
  duration: number, // seconds
  results: Array<CustomerResult>
}
```

## Troubleshooting

### Job doesn't run

1. Check Task Scheduler history (Windows)
2. Check cron logs (Linux: `/var/log/syslog`)
3. Verify Node.js path: `which node` or `where node`
4. Test manually: `node <job-name>.js`

### Permission errors

- Windows: Run Task Scheduler as Administrator
- Linux: Check file permissions and cron permissions

### Firebase errors

1. Verify `serviceAccountKey.json` exists and is valid
2. Check Firebase project permissions
3. Ensure Firestore is enabled

### API errors

1. Verify API keys are configured in Firebase
2. Check Railway proxy is running
3. Test API endpoints manually

## Adding New Jobs

1. Create new job file: `new-job.js`
2. Add script to `package.json`:
   ```json
   "scripts": {
     "new-job": "node new-job.js"
   }
   ```
3. Create documentation
4. Create scheduling script if needed
5. Test thoroughly before scheduling

## Job Template

```javascript
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function main() {
    console.log('Starting job...');
    
    try {
        // Your job logic here
        
        // Log success to Firebase
        await db.collection('system_logs').add({
            type: 'your_job_type',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed'
        });
        
        console.log('Job completed successfully');
        
    } catch (error) {
        console.error('Job failed:', error);
        
        // Log error to Firebase
        await db.collection('system_logs').add({
            type: 'your_job_type',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'error',
            error: error.message
        });
        
        process.exit(1);
    }
}

if (require.main === module) {
    main().then(() => process.exit(0))
          .catch(error => {
              console.error(error);
              process.exit(1);
          });
}

module.exports = { main };
```

## Support

For issues or questions:
1. Check the job's specific documentation
2. Review logs in Firebase `system_logs`
3. Test job manually with verbose output
4. Check Task Scheduler/cron configuration

## Future Enhancements

- [ ] Email/Slack notifications for job failures
- [ ] Centralized job orchestration
- [ ] Job monitoring dashboard
- [ ] Automatic retry logic
- [ ] Job performance metrics
- [ ] Health checks and alerting











