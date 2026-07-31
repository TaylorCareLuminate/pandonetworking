# Prospect Contact Upload Guide

## Overview

The Prospect Contact Upload feature allows you to upload CSV files containing your target LinkedIn prospects and automatically track your connection progress over time. The system includes intelligent field mapping that works with any CSV format.

## Key Features

### ✨ Smart Field Mapping
- **No exact column names required** - Your CSV can have any column names
- **Auto-detection** - System automatically suggests field mappings based on common column name variations
- **Visual validation** - See exactly which fields are mapped before uploading
- **CSV preview** - View your data before confirming the upload

### 🔄 Automatic Connection Tracking
- Compares prospects against your existing LinkedIn connections
- Marks prospects as "Already Connected" on upload
- Detects new connections when you click "Check for New Connections"
- Celebrates new connections with congratulations banner

### 📊 Progress Monitoring
- Connection percentage tracker
- Connected vs. Not Connected statistics
- New connections this session counter
- Category-based organization

## How to Upload Prospects

### Step 1: Prepare Your CSV File

Your CSV must include data for these fields (column names can be anything):

**Required Fields:**
- First Name
- Last Name
- Company
- Company Domain (e.g., company.com)
- Category (e.g., Healthcare IT, Vendors, Decision Makers)
- LinkedIn URL (full profile URL)

**Optional Fields:**
- Notes (any additional information)

### Step 2: Upload the File

1. Go to **Manage My LinkedIn Data** page
2. Scroll to **"Upload Prospect Contacts"** section
3. Click the upload area or drag and drop your CSV file
4. File must be CSV format, maximum 10MB

### Step 3: Map Your Fields

After selecting your file, a **Field Mapping Modal** will appear:

1. **CSV Preview** - Shows first 3 rows of your data
2. **Auto-detected mappings** - Fields marked with "Auto-detected" badge
3. **Manual mapping** - Use dropdowns to map any fields not auto-detected
4. **Validation** - Required fields show in red if unmapped
5. **Statistics** - See mapped/unmapped counts in real-time

**Visual Indicators:**
- 🟢 Green border = Field successfully mapped
- 🔴 Red border = Required field not mapped
- 🟢 "Auto-detected" badge = System found a match

### Step 4: Confirm and Upload

1. Ensure all required fields are mapped (button will be disabled if not)
2. Click **"Proceed with Upload"**
3. Watch the progress bar as prospects are processed
4. View upload results in the statistics

## Field Mapping Intelligence

The system recognizes common variations of field names:

### First Name
- first name, firstname, first, fname, given name

### Last Name
- last name, lastname, last, lname, surname, family name

### Company
- company, company name, organization, employer

### Company Domain
- company domain, companydomain, domain, website, company website

### Category
- category, type, industry, segment

### LinkedIn URL
- linkedin url, linkedin, linkedin profile, profile url, url, linkedin link

### Notes
- notes, note, comments, comment, description

## Sample CSV Formats

### Example 1: Standard Format
```csv
First Name,Last Name,Company,Company Domain,Category,LinkedIn URL,Notes
John,Smith,Acme Healthcare,acmehealthcare.com,Healthcare IT,https://linkedin.com/in/johnsmith,Met at conference
```

### Example 2: Alternate Format (will auto-map)
```csv
FirstName,LastName,Organization,Domain,Industry,Profile,Comments
John,Smith,Acme Healthcare,acmehealthcare.com,Healthcare IT,https://linkedin.com/in/johnsmith,Met at conference
```

Both formats will work! The field mapper will detect the correct columns.

## After Upload

### View Your Prospects
1. Navigate to **Prospect Contacts** page
2. See all uploaded prospects in one place
3. Filter by connection status, category
4. Search by name, company, or category
5. Sort by various criteria

### Check for New Connections
1. Click **"Check for New Connections"** button
2. System compares prospects against your LinkedIn connections
3. New connections are highlighted at the top
4. Congratulations banner displays for new connections
5. Statistics update automatically

### Manage Categories
1. Click on any category pill to edit
2. Change to existing category or create new one
3. Changes save immediately

## Best Practices

### Data Quality
- ✅ Use complete LinkedIn profile URLs (not vanity URLs that might change)
- ✅ Include company domains for better tracking
- ✅ Use consistent category names for better organization
- ✅ Add notes for context and follow-up reminders

### Connection Tracking
- 🔄 Run "Check for New Connections" weekly to track progress
- 📊 Use categories to segment your outreach strategy
- 🎯 Focus on "Not Connected" prospects for outreach campaigns
- 📝 Update notes as relationships progress

### File Management
- 📁 Keep a master CSV file that you update regularly
- 🔄 Re-upload periodically to add new prospects
- ✅ Existing prospects will be updated (not duplicated)
- 💾 Export from CRM systems for seamless integration

## Troubleshooting

### "Required field is not mapped"
**Solution:** Use the dropdown to manually select the correct CSV column for that field

### "No LinkedIn accounts configured"
**Solution:** Contact your administrator to set up your LinkedIn account in the system

### "Could not match CSV messages"
**Solution:** Ensure your LinkedIn profile URL in the CSV matches your configured account

### "File size exceeds 10MB limit"
**Solution:** Split your CSV into smaller files or remove unnecessary columns

### Duplicate prospects
**Solution:** System uses LinkedIn URL as unique identifier. Same URL will update existing record.

## Sample Files

We provide two sample CSV files:
1. `sample_prospects.csv` - Standard format
2. `sample_prospects_alternate_format.csv` - Alternate column names (demonstrates auto-mapping)

Download these to see the expected format or use as templates.

## Data Storage

- Prospects stored in Firebase Firestore (`prospect_contacts` collection)
- Associated with your user account and LinkedIn account ID
- Secure and accessible only to authenticated users
- Updates tracked with timestamps

## Privacy & Security

- ✅ Data encrypted in transit and at rest
- ✅ Only you can see your prospects
- ✅ LinkedIn connections checked securely
- ✅ No data shared with third parties
- ✅ Full authentication required

## Support

For questions or issues:
1. Check this guide first
2. Review sample CSV files
3. Contact your system administrator
4. Check browser console for detailed error messages

---

**Last Updated:** November 2024  
**Feature Version:** 2.0 (Smart Field Mapping)




