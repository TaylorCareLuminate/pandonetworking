# CRM Page Usage Tracking Setup Guide

## Overview

This system tracks which CRM pages are being used, how often, and by whom. It helps identify unused pages for potential cleanup.

## Components

1. **page-usage-tracker.js** - Lightweight tracking script that logs page visits
2. **page-usage-analytics.html** - Dashboard to view usage statistics
3. **Firebase Collection** - `pageUsageTracking` stores all visit data

## Installation

### Step 1: Add Tracking to Pages

Add this line **at the bottom** of each CRM page you want to track (before the closing `</body>` tag):

```html
<script src="../js/page-usage-tracker.js"></script>
```

**Important:** The tracking script requires:
- Firebase to be initialized on the page
- User to be authenticated
- The page to already have Firebase Auth scripts loaded

### Step 2: Quick Bulk Installation

To add tracking to multiple pages at once, you can:

1. **Manual approach:** Search for `</body>` in each CRM HTML file and add the script tag just before it

2. **Semi-automated:** Use find/replace in your code editor:
   - Find: `</body>`
   - Replace with:
   ```html
   <script src="../js/page-usage-tracker.js"></script>
</body>
   ```

### Step 3: Test the Tracking

1. Open any CRM page with the tracking script
2. Open browser console (F12)
3. Look for: `Page view tracked: [page-name].html`
4. Check Firebase Console > Firestore > `pageUsageTracking` collection for new entries

## Viewing Analytics

Open the analytics dashboard:
- URL: `/crm/page-usage-analytics.html`
- Features:
  - View usage by category (matching CRM home page structure)
  - Filter by time period (today, week, month, 90 days, all time)
  - Filter by usage level (unused, low, medium, high)
  - See who is using each page
  - Export data to CSV
  - View last visit dates

## Data Structure

Each page visit creates a document in Firestore with:

```javascript
{
  pagePath: "mainpage.html",           // Just the filename
  pageFullPath: "/crm/mainpage.html",  // Full path
  pageTitle: "CRM Dashboard",          // Page title
  userId: "abc123...",                 // Firebase user ID
  userEmail: "user@healthluminate.com", // User email
  timestamp: Firestore.Timestamp,      // When visited
  userAgent: "Mozilla/5.0...",         // Browser info
  referrer: "https://..."              // Where they came from
}
```

## Firebase Setup

Make sure you have the appropriate Firestore indexes:
- Single field index on `pagePath` (Ascending)
- Single field index on `timestamp` (Descending)
- Single field index on `userEmail` (Ascending)

These will be created automatically when you first query the data, but you may need to follow the links in the Firebase console if you see index errors.

## Usage Recommendations

### For identifying unused pages:

1. Let the tracking run for 2-4 weeks to gather meaningful data
2. Open the analytics dashboard
3. Set filter to "Last 90 Days" or "This Month"
4. Set usage filter to "Unused Only"
5. Review the list with your team before removing any pages

### For understanding workflow patterns:

1. Use the "Users" column to see who is using which pages
2. Check "Last Visit" to identify abandoned workflows
3. Export to CSV for deeper analysis in Excel/Google Sheets

## Maintenance

### To add new pages to tracking:
1. Just include the tracking script in the new page
2. Add the page to the `crmPages` object in `page-usage-analytics.html` so it appears in reports

### To stop tracking a page:
1. Simply remove the script tag from that page

### Privacy Note:
- Only tracks authenticated users (requires Firebase login)
- Stores user email and ID with each visit
- Useful for understanding team usage patterns
- Consider privacy policies if tracking customer-facing pages

## Troubleshooting

**Tracking not working?**
- Check: Is Firebase initialized on the page?
- Check: Is user logged in?
- Check: Does the script path match? (`../js/page-usage-tracker.js` from `/crm/` pages)
- Check: Browser console for error messages

**Analytics dashboard empty?**
- Check: Has any page with tracking been visited since installation?
- Check: Firestore security rules allow read access to `pageUsageTracking`
- Check: Browser console for Firebase permission errors

**Wrong page counts?**
- Check: Are there duplicate script includes?
- Check: Is the same page loaded in multiple browser tabs?
- Note: Each page load = 1 visit (this is intentional)

## Future Enhancements

Possible additions:
- Track time spent on page
- Track user interactions/clicks
- A/B testing support
- Heat maps for page sections
- Session recording integration
- Automated weekly usage reports via email
