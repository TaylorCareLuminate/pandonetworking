# CRM Page Usage Tracking System

## 🎯 Overview

This system tracks which CRM pages are being used, how often, and by whom. It's designed to help you identify unused or underutilized pages so you can make informed decisions about cleaning up and streamlining your CRM.

## 📦 What's Been Created

### 1. **Page Usage Analytics Dashboard** (`page-usage-analytics.html`)
The main dashboard for viewing usage data. Features include:
- **Summary Statistics**: Total pages, visits, active users, and unused pages
- **Category Organization**: Pages grouped by function (matching your CRM home page)
- **Time Period Filters**: View data for today, this week, this month, 90 days, or all time
- **Usage Level Filters**: Filter by unused, low, medium, or high usage
- **User Tracking**: See who is accessing each page
- **Last Visit Dates**: Identify stale/abandoned pages
- **CSV Export**: Export data for deeper analysis in Excel

### 2. **Tracking Script** (`../js/page-usage-tracker.js`)
A lightweight JavaScript file that:
- Automatically logs each page visit to Firebase
- Captures user info, timestamp, page details
- Only tracks authenticated users
- Runs silently in the background
- Requires no configuration

### 3. **Installation Helper** (`install-tracking-helper.html`)
A tool to help you add tracking to pages:
- Shows all CRM pages organized by category
- Displays tracking status for each page
- Provides copy-paste code snippets
- Shows installation instructions
- Tracks your progress (pages covered vs remaining)

### 4. **Setup Guide** (`USAGE_TRACKING_SETUP.md`)
Comprehensive documentation covering:
- Installation steps
- Firebase setup requirements
- Data structure details
- Troubleshooting tips
- Privacy considerations
- Future enhancement ideas

## 🚀 Quick Start Guide

### Step 1: Add Tracking to Your Pages

You need to add one line of code to each CRM page you want to track. Add this just before the closing `</body>` tag:

```html
<script src="../js/page-usage-tracker.js"></script>
```

**Important**: The page must already have Firebase initialized and the user must be authenticated for tracking to work.

### Step 2: Visit the Installation Helper

Go to: `crm/install-tracking-helper.html`

This page shows you:
- All 100+ CRM pages organized by function
- Which ones need tracking added
- Copy-paste code snippets
- Your installation progress

### Step 3: Let It Run

After adding tracking to pages:
1. Let it run for **2-4 weeks** to gather meaningful data
2. Encourage your team to use the CRM normally
3. Don't make any cleanup decisions yet

### Step 4: Review the Data

Go to: `crm/page-usage-analytics.html`

Here you can:
- See which pages are **never used**
- Identify pages with **low usage** (candidates for consolidation)
- Find pages that are **heavily used** (critical workflows)
- See **who** is using each page
- Track **when** pages were last accessed

## 📊 Understanding the Data

### Usage Levels

The system categorizes pages into four levels:

- **None** (Red): Never visited - strong candidates for removal
- **Low** (Orange): 1-4 visits in the time period - consider consolidating
- **Medium** (Yellow): 5-19 visits - monitoring recommended
- **High** (Green): 20+ visits - critical pages to keep

### Time Period Recommendations

- **Today/This Week**: Good for identifying active workflows
- **This Month**: Balance between recent activity and patterns
- **90 Days**: Best for making cleanup decisions
- **All Time**: Historical perspective, but may hide current reality

### Making Cleanup Decisions

Before removing any page, consider:

1. **Zero usage for 90+ days**: Strong candidate for removal
2. **Last visit > 6 months ago**: Probably safe to archive
3. **Only 1-2 users ever accessed**: May be a specialized tool
4. **Many visits but old last visit**: Workflow may have changed
5. **Test/diagnostic pages**: May be needed for emergencies even if rarely used

## 🔗 Access Points

The new tracking tools are integrated into your CRM:

1. **From CRM Home** (`crm/home.html`):
   - Look in the "Analytics & Monitoring" section
   - "Page Usage Analytics" - highlighted in yellow
   - "Install Tracking Helper" - highlighted in blue

2. **Direct URLs**:
   - Analytics: `/crm/page-usage-analytics.html`
   - Helper: `/crm/install-tracking-helper.html`

## 📈 What Gets Tracked

For each page visit, the system logs:

```javascript
{
  pagePath: "mainpage.html",           // Filename
  pageFullPath: "/crm/mainpage.html",  // Full path
  pageTitle: "CRM Dashboard",          // Page title
  userId: "abc123...",                 // Firebase user ID
  userEmail: "user@example.com",       // User's email
  timestamp: Firestore.Timestamp,      // Visit timestamp
  userAgent: "Mozilla/5.0...",         // Browser info
  referrer: "https://..."              // Where they came from
}
```

## 🔐 Privacy & Security

- Only tracks **authenticated users** (requires Firebase login)
- Stores **user email** with each visit
- Useful for **internal analytics** and understanding team workflows
- Consider your privacy policy if tracking customer-facing pages
- Data stored in Firebase collection: `pageUsageTracking`

## 🛠️ Firebase Setup

### Required Firestore Indexes

The system will automatically request these indexes when first used:
- `pagePath` (Ascending)
- `timestamp` (Descending)
- `userEmail` (Ascending)

If you see index errors in the console, click the Firebase link to create them.

### Security Rules

Make sure your Firestore rules allow:
- **Write access** to `pageUsageTracking` for authenticated users
- **Read access** to `pageUsageTracking` for admin users

Example rules:
```javascript
match /pageUsageTracking/{document} {
  // Allow authenticated users to create tracking entries
  allow create: if request.auth != null;
  
  // Allow admins to read all tracking data
  allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

## 📋 Installation Checklist

Use this checklist to track your progress:

- [ ] Review the tracking system documentation
- [ ] Test tracking on 1-2 pages first
- [ ] Verify data appears in Firebase
- [ ] Verify data appears in analytics dashboard
- [ ] Add tracking to all active CRM pages
- [ ] Notify team that tracking is in place
- [ ] Wait 2-4 weeks for data collection
- [ ] Review analytics dashboard
- [ ] Identify unused pages
- [ ] Discuss findings with team
- [ ] Make cleanup decisions
- [ ] Archive or remove unused pages
- [ ] Document changes

## 🎓 Best Practices

### Rolling Out Tracking

1. **Start small**: Add to 5-10 key pages first
2. **Test thoroughly**: Verify data collection works
3. **Then expand**: Add to all remaining pages
4. **Communicate**: Let team know tracking is active

### Using the Analytics

1. **Weekly reviews**: Quick check on recent activity
2. **Monthly deep dives**: Look for patterns and trends
3. **Quarterly cleanup**: Make decisions on unused pages
4. **Annual audit**: Review entire page catalog

### Making Decisions

1. **Don't rush**: Collect data for adequate time period
2. **Ask questions**: Why was this page created? Still needed?
3. **Check with users**: Some pages may be rarely used but critical
4. **Archive first**: Don't immediately delete - move to archive folder
5. **Document**: Keep notes on why pages were removed

## 🔄 Next Steps

### Immediate Actions (Today)

1. Open `install-tracking-helper.html` to see all pages
2. Add tracking to your 10 most important pages
3. Test by visiting those pages
4. Check `page-usage-analytics.html` to verify data appears

### Short-term (This Week)

1. Add tracking to remaining CRM pages
2. Verify tracking works on all pages
3. Review initial data in analytics dashboard
4. Note any pages that are clearly unused

### Medium-term (Next Month)

1. Review 30-day usage data
2. Identify obvious unused pages
3. Discuss with team
4. Create list of candidates for removal

### Long-term (Next Quarter)

1. Review 90-day usage data
2. Make cleanup decisions
3. Archive or remove unused pages
4. Document the cleanup process
5. Plan regular quarterly reviews

## ❓ FAQ

**Q: How much data will this collect?**
A: Each page visit creates one small document in Firebase (< 1KB). Even with heavy usage, this is minimal storage.

**Q: Will this slow down my pages?**
A: No. The tracking script is lightweight and runs asynchronously. It won't impact page load times.

**Q: What if I remove a page someone needs?**
A: That's why we recommend 2-4 weeks of data collection first. You can also archive pages instead of deleting them.

**Q: Can I track external pages?**
A: Yes, as long as they have Firebase initialized and users are authenticated.

**Q: How do I stop tracking a page?**
A: Simply remove the tracking script line from that page.

**Q: Can I track anonymous users?**
A: The current implementation requires authentication. You'd need to modify the tracker for anonymous tracking.

**Q: Where is the data stored?**
A: In your Firebase Firestore database in the `pageUsageTracking` collection.

## 📞 Support

If you run into issues:

1. Check the browser console for error messages
2. Verify Firebase is initialized on the page
3. Verify user is authenticated
4. Check Firestore security rules
5. Review the troubleshooting section in `USAGE_TRACKING_SETUP.md`

## 🎉 Summary

You now have a complete page usage tracking system that will help you:

✅ Identify unused pages  
✅ Understand usage patterns  
✅ Track who uses what  
✅ Make data-driven cleanup decisions  
✅ Streamline your CRM  
✅ Improve team efficiency  

**Next step**: Open `crm/install-tracking-helper.html` and start adding tracking to your pages!
