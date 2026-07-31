# HeyReach Weekend & Holiday Pause System

## Overview

This document outlines the system for automatically pausing HeyReach campaigns during weekends and holidays, and resuming them on business days.

## Current Implementation Status

✅ **Complete:**
- Manual pause/resume functionality in web interface
- Pause/resume API endpoints in Railway
- Manual bulk pause/resume for priority campaigns
- HeyReach API integration

🚧 **Planned:**
- Automated weekend pause (Friday EOD)
- Automated Monday resume
- Holiday pause integration
- Smart scheduling based on email calendar

---

## Holiday Definition

Holidays are defined identically to the email calendar system (`email_calendar.html`):

### US Federal Holidays
- New Year's Day (January 1)
- Martin Luther King Jr. Day (3rd Monday in January)
- Presidents' Day (3rd Monday in February)
- Memorial Day (Last Monday in May)
- Independence Day (July 4)
- Labor Day (1st Monday in September)
- Veterans Day (November 11)

### Extended Holiday Periods
- **Thanksgiving Period:**
  - Wednesday before Thanksgiving
  - Thanksgiving Day
  - Day after Thanksgiving (Black Friday)
  
- **Winter Holiday Period:**
  - December 20 through January 2
  - Includes Christmas, New Year's, and surrounding days

### Weekends
- **Saturday** and **Sunday** - No campaign activity

---

## Implementation Plan

### Phase 1: Basic Automation ✅ (Current)

**Capabilities:**
- Manual pause/resume via web interface
- Manual bulk operations
- Campaign status monitoring

**Files:**
- `crm/heyreach_campaigns.html` - Web interface with pause/resume
- `RailwayCLemail/server.js` - Pause/resume API endpoints

### Phase 2: Weekend Automation 🚧 (Next)

**Objective:** Automatically pause priority campaigns on Friday evening and resume on Monday morning.

**New Files:**
- `jobs/heyreach-weekend-pause.js` - Friday pause job
- `jobs/heyreach-monday-resume.js` - Monday resume job (reuses existing logic)

**Schedule:**
- **Friday 5:00 PM MT**: Pause all priority campaigns
- **Monday 6:00 AM MT**: Resume all priority campaigns

**Cron Setup:**
```bash
# Friday at 5:00 PM
0 17 * * 5 cd /path/to/jobs && node heyreach-weekend-pause.js

# Monday at 6:00 AM  
0 6 * * 1 cd /path/to/jobs && node heyreach-monday-resume.js
```

**Logic:**
```javascript
// Friday evening
- Get all customers with HeyReach enabled
- For each customer:
  - Get all campaigns
  - Filter for priority campaigns (Connect & Message)
  - Filter for running campaigns (status = 1)
  - Pause each campaign
  - Log to Firebase

// Monday morning
- Get all customers with HeyReach enabled
- For each customer:
  - Get all campaigns
  - Filter for priority campaigns
  - Filter for paused campaigns (status = 2)
  - Check if it's a business day (not holiday)
  - Resume each campaign
  - Log to Firebase
```

### Phase 3: Holiday Integration 🚧 (Future)

**Objective:** Pause campaigns before holidays and resume after.

**New Files:**
- `jobs/heyreach-holiday-manager.js` - Smart holiday pause/resume

**Features:**
- **Holiday Detection**: Check upcoming holidays from email calendar
- **Pre-Holiday Pause**: Pause campaigns on business day before holiday
- **Post-Holiday Resume**: Resume campaigns on next business day after holiday
- **Extended Periods**: Handle multi-day holiday periods (Thanksgiving, Christmas)

**Schedule:**
```bash
# Daily check at 5:00 PM to see if tomorrow is a holiday
0 17 * * * cd /path/to/jobs && node heyreach-holiday-manager.js check

# Daily check at 6:00 AM to see if holiday period ended
0 6 * * * cd /path/to/jobs && node heyreach-holiday-manager.js resume
```

**Holiday Logic:**
```javascript
// Daily evening check
- Get current date
- Check email_calendar holidays list
- If tomorrow is holiday OR weekend:
  - Pause all running priority campaigns
  - Mark campaigns with "holiday_paused" flag
  - Log pause reason (weekend/holiday name)

// Daily morning check  
- Get current date
- Check email_calendar holidays list
- If today is business day AND campaigns were holiday_paused:
  - Resume all priority campaigns
  - Clear "holiday_paused" flag
  - Log resume
```

### Phase 4: Smart Scheduling 🚧 (Future Enhancement)

**Objective:** Coordinate with email calendar for unified scheduling.

**Features:**
- **Unified Calendar**: Single source of truth for business days
- **Preview Mode**: Show upcoming pause/resume schedule
- **Manual Override**: Ability to override automatic pause/resume
- **Notification System**: Alert when campaigns paused/resumed
- **Dashboard**: Visualize campaign schedule

---

## Database Schema

### System Logs

All pause/resume operations are logged:

```javascript
{
  type: "heyreach_weekend_pause" | "heyreach_holiday_pause" | "heyreach_auto_resume",
  timestamp: Timestamp,
  reason: "weekend" | "holiday" | "scheduled_resume",
  holidayName: string (optional),
  customersProcessed: number,
  campaignsPaused: number,
  campaignsResumed: number,
  results: [{
    customerId: string,
    customerName: string,
    success: boolean,
    campaignsAffected: number,
    campaigns: [{
      id: number,
      name: string,
      type: "connect" | "message",
      previousStatus: number,
      newStatus: number
    }]
  }],
  status: "completed" | "error"
}
```

### Campaign Metadata (Optional)

Track pause history on campaigns:

```javascript
{
  campaignId: number,
  customerI: string,
  lastPauseReason: "weekend" | "holiday" | "manual",
  lastPauseTime: Timestamp,
  lastResumeTime: Timestamp,
  autoManaged: boolean,
  pauseHistory: [{
    pausedAt: Timestamp,
    resumedAt: Timestamp,
    reason: string,
    duration: number // minutes
  }]
}
```

---

## Weekend Pause Job Template

### `jobs/heyreach-weekend-pause.js`

```javascript
/**
 * HeyReach Weekend Pause Job
 * 
 * Pauses priority campaigns on Friday evening before the weekend.
 * 
 * Schedule: Friday at 5:00 PM MT
 * 
 * Usage:
 *   node heyreach-weekend-pause.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const RAILWAY_API_URL = 'https://clemailapi-production.up.railway.app';
const PRIORITY_TYPES = ['connect', 'message'];

function detectCampaignType(campaignName) {
    const name = campaignName.toLowerCase();
    if (name.includes('connect') || name.includes('connection')) return 'connect';
    if (name.includes('message') || name.includes('msg')) return 'message';
    return 'other';
}

function isPriorityCampaign(campaign) {
    const type = detectCampaignType(campaign.name);
    return PRIORITY_TYPES.includes(type);
}

async function pauseCampaign(campaignId, apiKey) {
    const response = await fetch(`${RAILWAY_API_URL}/proxy/heyreach/campaign/pause`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ campaignId })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
}

async function fetchCampaigns(apiKey) {
    const response = await fetch(`${RAILWAY_API_URL}/proxy/heyreach/campaigns/getall`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ offset: 0, limit: 100 })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    return result.items || result.list || [];
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   HeyReach Weekend Pause Job                           ║');
    console.log('║   Pausing priority campaigns for the weekend           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    const startTime = Date.now();
    
    try {
        // Verify it's Friday
        const today = new Date();
        if (today.getDay() !== 5) { // 5 = Friday
            console.log('⚠️  Not Friday, skipping weekend pause');
            return;
        }
        
        console.log('📅 Today is Friday - proceeding with weekend pause');
        
        // Get customers
        const customersSnapshot = await db.collection('customers')
            .where('heyreachEnabled', '==', true)
            .where('status', '==', 'active')
            .get();
        
        if (customersSnapshot.empty) {
            console.log('⚠️  No customers with HeyReach enabled');
            return;
        }
        
        console.log(`✅ Found ${customersSnapshot.size} customers\n`);
        
        const results = [];
        let totalPaused = 0;
        
        for (const customerDoc of customersSnapshot.docs) {
            const customer = { id: customerDoc.id, ...customerDoc.data() };
            
            if (!customer.heyreachApiKey) continue;
            
            console.log(`\n📊 Processing: ${customer.name}`);
            
            const campaigns = await fetchCampaigns(customer.heyreachApiKey);
            console.log(`   📋 Found ${campaigns.length} campaigns`);
            
            let paused = 0;
            const pausedCampaigns = [];
            
            for (const campaign of campaigns) {
                const isPriority = isPriorityCampaign(campaign);
                const isRunning = campaign.status === 1;
                
                if (isPriority && isRunning) {
                    const type = detectCampaignType(campaign.name);
                    console.log(`   ⏸️  Pausing "${campaign.name}" (${type})`);
                    
                    try {
                        await pauseCampaign(campaign.id, customer.heyreachApiKey);
                        paused++;
                        totalPaused++;
                        pausedCampaigns.push({
                            id: campaign.id,
                            name: campaign.name,
                            type
                        });
                        console.log(`   ✅ Paused successfully`);
                    } catch (error) {
                        console.error(`   ❌ Failed: ${error.message}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            console.log(`   📊 Summary: ${paused} campaigns paused`);
            
            results.push({
                customerId: customer.id,
                customerName: customer.name,
                success: true,
                campaignsPaused: paused,
                pausedCampaigns
            });
        }
        
        // Log to Firebase
        await db.collection('system_logs').add({
            type: 'heyreach_weekend_pause',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            reason: 'weekend',
            duration: (Date.now() - startTime) / 1000,
            customersProcessed: results.length,
            campaignsPaused: totalPaused,
            results,
            status: 'completed'
        });
        
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║   WEEKEND PAUSE COMPLETE                               ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`\n⏸️  Total Campaigns Paused: ${totalPaused}`);
        console.log(`⏱️  Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        
        await db.collection('system_logs').add({
            type: 'heyreach_weekend_pause',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'error',
            error: error.message
        });
        
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { main };
```

---

## Testing

### Manual Testing

Use the web interface at `crm/heyreach_campaigns.html`:

1. **Pause Test:**
   - Select a customer
   - View running campaigns
   - Click "Pause" on a priority campaign
   - Verify status changes to "Paused"

2. **Bulk Pause Test:**
   - Click "Pause All Priority Campaigns"
   - Confirm the count matches
   - Verify all priority campaigns are paused

3. **Resume Test:**
   - Select paused campaigns
   - Click "Resume" or use bulk resume
   - Verify status changes to "Running"

### Automated Testing

Run the weekend pause job manually:

```bash
cd jobs
node heyreach-weekend-pause.js
```

Check Firebase logs:
```javascript
db.collection('system_logs')
  .where('type', '==', 'heyreach_weekend_pause')
  .orderBy('timestamp', 'desc')
  .limit(10)
```

---

## Deployment Checklist

### Current (Manual Pause/Resume)
- [x] Web interface with pause/resume buttons
- [x] Bulk pause/resume functionality
- [x] Pause API endpoint
- [x] Resume API endpoint  
- [x] Documentation

### Phase 2 (Weekend Automation)
- [ ] Create `heyreach-weekend-pause.js`
- [ ] Create `heyreach-monday-resume.js`
- [ ] Test both scripts manually
- [ ] Schedule Friday 5 PM job
- [ ] Schedule Monday 6 AM job
- [ ] Monitor first weekend cycle
- [ ] Update documentation

### Phase 3 (Holiday Automation)
- [ ] Create `heyreach-holiday-manager.js`
- [ ] Integrate with email calendar holidays
- [ ] Add holiday detection logic
- [ ] Schedule daily checks
- [ ] Test with upcoming holiday
- [ ] Monitor holiday cycle
- [ ] Add notification system

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Pause Operations:**
   - Number of campaigns paused
   - Time to complete
   - Success/failure rate

2. **Resume Operations:**
   - Number of campaigns resumed
   - Time to complete  
   - Campaigns that failed to resume

3. **Schedule Compliance:**
   - Jobs running on time
   - Jobs completing successfully
   - Holiday detection accuracy

### Alert Conditions

- Job fails to complete
- More than 10% of pauses/resumes fail
- Job doesn't run on schedule
- Priority campaigns running on weekend/holiday

---

## Future Enhancements

- [ ] **Smart Resume Timing**: Resume campaigns at optimal times (e.g., 9 AM in prospect's timezone)
- [ ] **Campaign-Specific Rules**: Allow certain campaigns to run on weekends
- [ ] **Activity Metrics**: Track campaign performance during pause periods
- [ ] **Calendar Integration**: Sync with Google Calendar or other calendar services
- [ ] **Notification System**: Email/Slack alerts for pause/resume operations
- [ ] **Web Dashboard**: Visual timeline of pause/resume schedule
- [ ] **API Webhooks**: Trigger pause/resume from external systems

---

**Status**: Phase 1 Complete ✅  
**Next Step**: Implement Phase 2 (Weekend Automation)  
**Target Date**: TBD











