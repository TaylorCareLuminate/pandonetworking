# Email Send Monitoring Page

**File:** `send_monitoring.html`  
**Created:** November 11, 2025  
**Purpose:** Real-time monitoring and analytics of all outbound emails

---

## Overview

The Email Send Monitoring page provides a comprehensive, real-time view of all emails sent through your system. It groups emails by sender, organization, and provides detailed domain analytics.

---

## Features

### 📊 Real-Time Statistics

**5 Key Metrics:**
1. **Total Emails Sent** - All emails in selected time range
2. **Scheduled Emails** - Automated campaign emails
3. **Manual Sends** - Emails sent via compose.html
4. **Unique Domains** - Number of different recipient domains
5. **Active Senders** - Number of unique email accounts sending

### 🔍 Advanced Filtering

**Time Range Filters:**
- Today
- Yesterday
- Last 7 Days (default)
- Last 30 Days
- All Time

**Email Type Filters:**
- All Emails
- Scheduled Only (automated campaigns)
- Manual Only (compose.html sends)

**Source Filters:**
- All Sources
- SMTP (sent via system)
- IMAP (external sends)

**Search:**
- Search by recipient email
- Search by subject
- Search by sender

### 👥 Emails by Sender

**Groups emails by individual email account:**
- Sender name and email
- Organization/customer
- Total emails sent
- Scheduled vs manual breakdown
- Number of unique domains reached
- Expandable list of recent emails

**Features:**
- Click any sender to expand/collapse email list
- Shows up to 20 most recent emails per sender
- Color-coded by email type (scheduled = green, manual = yellow)
- Sorted by total email count (most active first)

### 🏢 Emails by Organization

**Groups emails by customer/organization:**
- Organization name
- Total emails sent
- Number of senders from this organization
- Scheduled vs manual breakdown
- Number of unique domains reached
- Expandable list of recent emails

**Features:**
- Click any organization to expand/collapse email list
- Shows up to 20 most recent emails per organization
- Sorted by total email count (most active first)

### 🌐 Domain Analytics

**Shows recipient domain statistics:**
- Domain name
- Total emails sent to domain
- Number of unique senders to domain
- Scheduled vs manual breakdown

**Features:**
- Grid layout for easy scanning
- Top 50 domains by email volume
- Click-to-expand for more details

---

## Data Sources

### Primary Data: Firebase `sentEmailsDatabase` Collection
- Loads up to 5,000 most recent emails based on filters
- Real-time query with time range filtering
- Auto-refreshes every 30 seconds

### Supporting Data:
- **Email Accounts** from `emailAccounts` collection
- **Customers** from `customerList` collection

---

## Usage

### Accessing the Page

```
https://your-domain.com/crm/send_monitoring.html
```

### Basic Workflow

1. **Select Time Range** - Choose the date range you want to analyze
2. **Apply Filters** - Filter by email type, source, or search terms
3. **Click Refresh** - Manually refresh data (or wait for auto-refresh)
4. **Expand Groups** - Click on any sender/organization to see individual emails
5. **Export Data** - Download CSV for external analysis

### Example Use Cases

#### Use Case 1: Monitor Daily Activity
```
1. Select "Today" from time range
2. View total emails sent today
3. Check which senders are most active
4. Verify scheduled campaigns are running
```

#### Use Case 2: Organization Performance
```
1. Select "Last 7 Days"
2. Scroll to "Emails by Organization"
3. Expand your organization
4. Review scheduled vs manual breakdown
5. Check domain diversity
```

#### Use Case 3: Domain Reach Analysis
```
1. Select desired time range
2. Scroll to "Domain Analytics"
3. View top domains by email volume
4. Identify concentration vs diversity
```

#### Use Case 4: Find Specific Emails
```
1. Enter recipient email in search box
2. Click Refresh
3. View all emails to that recipient
4. Expand to see details
```

---

## Visual Indicators

### Email Type Colors

- **Green Border** - Scheduled email (automated campaign)
- **Yellow Border** - Manual email (compose.html)

### Tags

- **Green Tag** - Scheduled
- **Yellow Tag** - Manual
- **Blue Tag** - SMTP (sent via system)
- **Purple Tag** - IMAP (external send)
- **Gray Tag** - Recipient domain

---

## Performance

### Load Times
- Initial load: 2-5 seconds (depending on data volume)
- Refresh: 1-2 seconds
- Auto-refresh: Every 30 seconds

### Data Limits
- Maximum 5,000 emails loaded per query
- Shows top 50 domains in analytics
- Shows up to 20 emails per sender/organization group

### Optimization
- Efficient grouping algorithms
- Lazy loading of email details (expand on click)
- Client-side filtering for instant results

---

## Export Functionality

### CSV Export

Click the **"Export"** button to download all filtered emails as CSV.

**CSV Columns:**
- Sent At (ISO timestamp)
- From (sender email)
- To (recipient email)
- Subject
- Type (Scheduled/Manual)
- Source (SMTP/IMAP)
- Domain (recipient domain)
- Customer (organization ID)

**File Name Format:**
```
email_monitoring_YYYY-MM-DD.csv
```

---

## Integration

### API Endpoints Used

1. **GET /sent-emails/stats**
   - Fetches overall statistics
   - Used for dashboard metrics

2. **Firebase Query: sentEmailsDatabase**
   - Fetches detailed email records
   - Supports time range and ordering

### Auto-Refresh

The page automatically refreshes every 30 seconds to show the latest data. You can also manually refresh at any time.

---

## Troubleshooting

### Issue: No emails showing

**Possible Causes:**
1. No emails in selected time range
2. Filters too restrictive
3. Firebase not loading

**Solutions:**
1. Change time range to "All Time"
2. Clear all filters
3. Check browser console for errors
4. Verify Firebase connection

### Issue: Slow loading

**Possible Causes:**
1. Large data set (thousands of emails)
2. Network latency
3. Browser performance

**Solutions:**
1. Use shorter time ranges (Today, Last 7 Days)
2. Apply filters to reduce data volume
3. Close other browser tabs

### Issue: Organizations showing as "Unknown"

**Possible Cause:**
- Customer data not loaded from Firebase

**Solution:**
1. Refresh the page
2. Check Firebase `customerList` collection exists
3. Verify customer IDs match between collections

---

## Best Practices

### Daily Monitoring
1. Check "Today" view each morning
2. Verify expected senders are active
3. Spot-check scheduled campaign execution

### Weekly Review
1. Use "Last 7 Days" view
2. Review organization performance
3. Check domain diversity
4. Export for reporting

### Campaign Analysis
1. Filter by "Scheduled Only"
2. Select campaign time range
3. Verify delivery to all domains
4. Check for any failures

### Quality Control
1. Filter by "Manual Only"
2. Review manual sends for patterns
3. Ensure no accidental duplicates
4. Verify appropriate domains

---

## Technical Details

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile: Responsive design

### Security
- Protected by folder-protection.js
- Requires CRM access
- Firebase security rules apply

### Dependencies
- Firebase Firestore
- Font Awesome icons
- Modern JavaScript (ES6+)

---

## Future Enhancements

Potential improvements:
1. **Charts & Graphs** - Visual trend analysis
2. **Email Preview** - Click to view full email content
3. **Advanced Search** - Filter by subject keywords, date ranges
4. **Alerts** - Set up notifications for anomalies
5. **Comparison Views** - Compare time periods
6. **Drill-Down Analysis** - Click domain to see all recipients

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Railway API is running
3. Check Firebase collections exist
4. Review sent email database documentation

---

**Created:** November 11, 2025  
**Last Updated:** November 11, 2025  
**Status:** ✅ Production Ready  
**Access:** CRM folder (requires authentication)














