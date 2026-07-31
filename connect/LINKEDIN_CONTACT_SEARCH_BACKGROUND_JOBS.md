# LinkedIn Contact Search - Background Job System

## Overview

The LinkedIn Contact Search system has been split into two versions:

1. **`linkedin_contact_search.html`** - Simplified job submission interface (submit and close browser)
2. **`linkedin_contact_search_steps.html`** - Step-by-step interactive version (original)

## Key Features

### Background Job Processing
- Submit a search job and close your browser
- Jobs are processed automatically by the Railway backend every 5 minutes
- All progress is tracked in Firebase at `connect_contact_search_log`

### CSV Upload
- Upload a CSV file with company data
- Required field: `company_name`
- Optional fields: `company_domain`, `company_city`, `company_state`, `company_industry`
- Template available for download: `linkedin_contact_search_template.csv`

### Cost Tracking
- **Bebity**: $0.001 per company search
- **Harvest API**: $8 per 1,000 contacts found + $20 per 1,000 API calls
- Costs are automatically calculated and saved to the job log
- Displayed in the search history table

## Architecture

### Frontend (linkedin_contact_search.html)
1. User uploads CSV with companies
2. Selects search criteria (job functions, seniority levels, max employees)
3. Optionally provides a filter prompt for GPT-based contact filtering
4. Selects a BDR to assign prospects to
5. Submits job to Firebase → job is created with status "pending"
6. User can view recent searches and their status in real-time

### Backend Processing Flow
1. **Cron Job**: Every 5 minutes, the backend checks for pending jobs
2. **Job Processor** (`linkedin_contact_search_job_processor.js`):
   - Updates job status to "running"
   - **Step 1**: Find company LinkedIn URLs (Gemini + Bebity)
     - Calculates Bebity cost: `companyCount * $0.001`
   - **Step 2**: Search for employees (Harvest API)
     - Calculates Harvest cost: `(contacts/1000 * $8) + (apiCalls/1000 * $20)`
   - **Step 3**: Filter contacts (GPT-5-nano) - if filter prompt provided
   - **Step 4**: Save contacts to `prospect_contacts` collection
   - Updates job status to "completed"
   - Saves final results and costs to Firebase

### Firebase Structure

#### Collection: `connect_contact_search_log`
```javascript
{
  status: 'pending' | 'running' | 'completed' | 'failed',
  submittedBy: 'user@example.com',
  submittedAt: Timestamp,
  startedAt: ISO String,
  completedAt: ISO String,
  bdrEmail: 'bdr@example.com',
  companies: [
    {
      company_name: 'Mayo Clinic',
      domain: 'mayoclinic.org',
      city: 'Rochester',
      state: 'MN',
      industry: 'Healthcare'
    },
    // ... more companies
  ],
  companyCount: 5,
  criteria: {
    function_ids: [],  // Empty = all
    seniority_level_ids: [],  // Empty = all
    max_employees: 25,
    filter_prompt: 'Only include...' | null
  },
  results: {
    companies_found: 4,
    employees_found: 87,
    contacts_saved: 87
  },
  costs: {
    bebity: 0.005,
    harvest: 0.696,
    total: 0.701
  },
  error: 'Error message' // Only present if status = 'failed'
}
```

## API Endpoints

### POST /api/linkedin-contact-search/process-job/:jobId
Process a specific job by ID (for manual triggering)

### POST /api/linkedin-contact-search/process-pending-jobs
Process all pending jobs (for manual triggering)

Both endpoints start processing in the background and return immediately.

## Cost Calculation Examples

### Example 1: Small Search
- **Input**: 5 companies, 25 employees found
- **Bebity**: 5 * $0.001 = $0.005
- **Harvest**: (25/1000 * $8) + (5/1000 * $20) = $0.20 + $0.10 = $0.30
- **Total**: $0.305

### Example 2: Large Search
- **Input**: 100 companies, 2,000 employees found
- **Bebity**: 100 * $0.001 = $0.10
- **Harvest**: (2000/1000 * $8) + (100/1000 * $20) = $16.00 + $2.00 = $18.00
- **Total**: $18.10

## Files Modified/Created

### Frontend
- ✅ **Created**: `linkedin_contact_search.html` - New simplified job submission interface
- ✅ **Created**: `linkedin_contact_search_steps.html` - Original step-by-step version (renamed)
- ✅ **Created**: `linkedin_contact_search_template.csv` - CSV template for uploads

### Backend
- ✅ **Created**: `services/linkedin_contact_search_job_processor.js` - Background job processor
- ✅ **Modified**: `server.js` - Added job processor initialization, endpoints, and cron job

## Usage Instructions

### For Users
1. Go to `linkedin_contact_search.html`
2. Download the CSV template
3. Fill in your company data (at minimum, company names)
4. Upload the CSV
5. Select job functions and seniority levels (or leave blank for all)
6. Enter max employees per company
7. Optionally provide a filter prompt
8. Select a BDR to assign prospects to
9. Click "Submit Search Job"
10. Close your browser - the job will process in the background
11. Return later to check the "Recent Searches" table for results

### For Developers
To manually trigger job processing (for testing):
```bash
curl -X POST https://railwayclemail-production.up.railway.app/api/linkedin-contact-search/process-pending-jobs
```

## Monitoring

Jobs are logged extensively in Railway:
- Search initiation
- Company URL discovery progress
- Employee search progress
- Cost calculations
- Contact filtering
- Final save to prospects

Check Railway logs to debug any issues.

## Next Steps / Future Enhancements

1. **Email Notifications**: Notify users when their job completes
2. **Progress Updates**: Update job document with progress percentage
3. **Priority Queue**: Allow high-priority jobs to jump the queue
4. **Rate Limiting**: Implement per-user rate limits
5. **Retry Logic**: Automatically retry failed jobs
6. **Export Results**: Allow users to download their found contacts as CSV
