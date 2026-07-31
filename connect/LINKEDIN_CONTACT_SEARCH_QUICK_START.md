# 🚀 LinkedIn Contact Search - Background Job System

## ✅ COMPLETE - Ready to Use!

### 📁 Files Created/Modified

#### Frontend (HealthLuminateSiteFromLocal/connect/)
- ✅ **linkedin_contact_search.html** - NEW simplified job submission interface
- ✅ **linkedin_contact_search_steps.html** - Original step-by-step version (saved)
- ✅ **linkedin_contact_search_template.csv** - CSV template for uploads
- ✅ **LINKEDIN_CONTACT_SEARCH_BACKGROUND_JOBS.md** - Complete documentation

#### Backend (RailwayCLemail/)
- ✅ **services/linkedin_contact_search_job_processor.js** - NEW background job processor
- ✅ **server.js** - Added job processor, endpoints, and cron job (every 5 minutes)

---

## 🎯 Key Features

### 1. **Submit & Close Browser**
- Upload CSV with companies
- Configure search criteria
- Select BDR to assign prospects
- Submit job → Close browser
- Job processes in background automatically

### 2. **CSV Upload Support**
Upload a CSV with these columns:
- **company_name** *(required)* - Company name
- **company_domain** *(optional)* - Website domain
- **company_city** *(optional)* - City location
- **company_state** *(optional)* - State location  
- **company_industry** *(optional)* - Industry type

**Download template:** `linkedin_contact_search_template.csv`

### 3. **Automatic Cost Tracking**
Costs are calculated and saved automatically:
- **Bebity**: $0.001 per company search
- **Harvest**: $8 per 1,000 contacts + $20 per 1,000 API calls
- **Total cost** displayed in search history

### 4. **Job Logging & Status**
All jobs saved to Firebase: `connect_contact_search_log`

Status updates:
- **Pending** → Waiting to be processed
- **Running** → Currently processing
- **Completed** → Finished, contacts saved
- **Failed** → Error occurred (check logs)

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  USER SUBMITS JOB                                           │
│  • Upload CSV with companies                                │
│  • Select criteria (functions, seniority, max employees)    │
│  • Optional: Add filter prompt                              │
│  • Select BDR to assign prospects                           │
│  • Click "Submit Search Job"                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  JOB CREATED IN FIREBASE                                    │
│  • Collection: connect_contact_search_log                   │
│  • Status: pending                                          │
│  • User can close browser                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  CRON JOB (Every 5 Minutes)                                 │
│  • Railway backend checks for pending jobs                  │
│  • Picks up max 5 jobs at a time                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  JOB PROCESSOR RUNS                                         │
│  1. Find company LinkedIn URLs (Gemini + Bebity)            │
│     → Calculates Bebity cost                                │
│  2. Search for employees (Harvest API)                      │
│     → Calculates Harvest cost                               │
│  3. Filter contacts (GPT) - if filter prompt provided       │
│  4. Validate company matches (GPT) - ensure accuracy        │
│  5. Save to prospect_contacts collection                    │
│     → Assigns to selected BDR                               │
│  6. Update job status: completed                            │
│     → Save final costs and results                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  RESULTS VISIBLE IN UI                                      │
│  • User returns to page                                     │
│  • Sees job status: completed                               │
│  • Views contacts saved and total cost                      │
│  • Prospects are in BDR's account ready for outreach        │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Examples

### Small Search (5 companies, 25 contacts)
- Bebity: $0.005
- Harvest: $0.30
- **Total: $0.305**

### Medium Search (50 companies, 500 contacts)
- Bebity: $0.05
- Harvest: $5.00
- **Total: $5.05**

### Large Search (100 companies, 2000 contacts)
- Bebity: $0.10
- Harvest: $18.00
- **Total: $18.10**

---

## 🔗 API Endpoints

### Process Specific Job
```bash
POST /api/linkedin-contact-search/process-job/:jobId
```

### Process All Pending Jobs (Manual Trigger)
```bash
POST /api/linkedin-contact-search/process-pending-jobs
```

Both endpoints start processing in background and return immediately.

---

## 📊 Firebase Data Structure

### Collection: `connect_contact_search_log`
```javascript
{
  // Status & Timing
  status: 'pending' | 'running' | 'completed' | 'failed',
  submittedAt: Timestamp,
  submittedBy: 'user@example.com',
  startedAt: ISO String,
  completedAt: ISO String,
  
  // Configuration
  bdrEmail: 'bdr@example.com',
  companyCount: 5,
  companies: [
    {
      company_name: 'Mayo Clinic',
      domain: 'mayoclinic.org',
      city: 'Rochester',
      state: 'MN',
      industry: 'Healthcare'
    }
  ],
  criteria: {
    function_ids: [],  // Empty = all
    seniority_level_ids: [],  // Empty = all
    max_employees: 25,
    filter_prompt: 'string' | null
  },
  
  // Results
  results: {
    companies_found: 4,
    employees_found: 87,
    contacts_saved: 87
  },
  
  // Costs
  costs: {
    bebity: 0.005,
    harvest: 0.696,
    total: 0.701
  },
  
  // Error (if failed)
  error: 'Error message'
}
```

---

## 🧪 Testing

### 1. Submit a Test Job
1. Go to: `https://healthluminate.com/connect/linkedin_contact_search.html`
2. Upload the template CSV (or create your own)
3. Configure search criteria
4. Select a BDR
5. Click "Submit Search Job"
6. Note the Job ID in the alert

### 2. Monitor in Firebase
1. Open Firebase Console
2. Navigate to Firestore
3. Open collection: `connect_contact_search_log`
4. Find your job document
5. Watch status change: pending → running → completed

### 3. Check Railway Logs
```bash
# In Railway dashboard, view logs
# Look for:
🚀 Processing job: {jobId}
📋 Job details: ...
✅ Found X company URLs
✅ Found Y employees
✅ Saved Z contacts to prospects
💰 Total cost: $X.XX
```

### 4. Verify Prospects Saved
1. Check `prospect_contacts` collection in Firebase
2. Filter by `account_email` = selected BDR email
3. Filter by `sourceJobId` = your job ID
4. Verify all contacts are present

---

## 🎓 Usage Tips

### CSV Best Practices
- Include company_domain when possible for better matching
- Include location (city/state) for more accurate results
- Include industry to help AI understand context
- Clean company names (remove "Inc.", "LLC", etc.)

### Search Criteria
- **Leave blank** for job functions/seniority = search ALL
- **Max employees**: Start with 25-50 for testing
- **Filter prompt**: Be specific but not too restrictive

### Cost Management
- Review search history regularly
- Start with small batches (5-10 companies)
- Use filter prompts to reduce unwanted contacts
- Monitor costs in the search history table

---

## 🚨 Troubleshooting

### Job Stuck in "Pending"
- Wait 5 minutes (cron job interval)
- Check Railway is running: `https://railwayclemail-production.up.railway.app/health`
- Manually trigger: POST to `/api/linkedin-contact-search/process-pending-jobs`

### Job Status: "Failed"
- Check Railway logs for detailed error
- Check job document in Firebase for `error` field
- Verify CSV format is correct
- Verify company names are valid

### No Contacts Found
- Check Railway logs: "Found 0 employees"
- Verify company LinkedIn URLs were found
- Try expanding search criteria (more job functions, seniority levels)
- Try different max_employees setting

---

## 📚 Additional Documentation

See **LINKEDIN_CONTACT_SEARCH_BACKGROUND_JOBS.md** for complete technical details.

---

## ✅ Deployment Checklist

- [x] Frontend files created and uploaded
- [x] Backend service created (job processor)
- [x] Server.js updated with endpoints and cron job
- [x] Firebase collection structure defined
- [x] Cost tracking implemented
- [x] CSV template created
- [x] Documentation written

**Status: READY FOR USE** 🚀

---

**Created**: January 10, 2026  
**Version**: 1.0.0  
**Author**: AI Assistant with Taylor Davis
