# Worklist Data Reference

## Data Source

The Worklist page pulls data from **Firebase Firestore**, specifically the `outreach_sets` collection.

### Query Filter
```javascript
where('outcomeStatus', '==', 'interested')
```

Only contacts marked as "Interested but Not Scheduled" in the `outcomes.html` page will appear in the worklist.

---

## Contact Data Structure

Each contact in the `outreach_sets` collection has the following fields:

### Primary Fields (Root Level)
- `firstName` - Contact's first name
- `lastName` - Contact's last name  
- `email` - Contact's email address
- `phone` - Contact's phone number
- `title` - Job title (e.g., "VP of Sales", "CEO")
- `prospectOrgName` - Organization/company name

### Custom Fields Object
The system also checks `customFields` for backward compatibility:
- `customFields.first_name`
- `customFields.last_name`
- `customFields.title` ← **This is where incorrect titles often are**
- `customFields.company_name`
- `customFields.phone`

### Worklist-Specific Fields
- `outcomeStatus` - Set to 'interested' for worklist contacts
- `outcomeDate` - When the contact was marked as interested
- `outcomeNotes` - Initial notes from outcomes page
- `priority` - 'high', 'medium', or 'low' (defaults to 'medium')
- `followUpDate` - Scheduled follow-up date
- `lastActivityDate` - Last time contact was updated
- `lastActivityNote` - Most recent note
- `activityHistory` - Array of all activities/updates

---

## How to Edit Contact Data

### Using the Worklist Interface

1. **Open Contact Details**
   - Click on any contact card in the worklist

2. **Edit Contact Information**
   - Click the "Edit Contact Information" button
   - An editing form will appear with all editable fields:
     - First Name
     - Last Name
     - Job Title ← **Fix incorrect titles here**
     - Company Name
     - Email
     - Phone

3. **Save Changes**
   - Click "Save Contact Info" button
   - Changes are saved to BOTH root fields AND customFields for compatibility
   - An activity log entry is automatically created

### What Gets Updated

When you save contact information, the system updates:

```javascript
{
  // Root level fields
  firstName: "John",
  lastName: "Doe", 
  title: "VP of Sales",
  email: "john@company.com",
  phone: "555-1234",
  prospectOrgName: "Company Inc",
  
  // Custom fields (for compatibility)
  customFields: {
    first_name: "John",
    last_name: "Doe",
    title: "VP of Sales",
    company_name: "Company Inc",
    phone: "555-1234"
  },
  
  // Audit fields
  updatedAt: [timestamp],
  activityHistory: [array of changes]
}
```

---

## Data Flow

```
outcomes.html → marks contact as 'interested'
                     ↓
              Firebase Firestore
              (outreach_sets collection)
                     ↓
              worklist.html → pulls interested contacts
                     ↓
              Edit functionality → updates contact data
                     ↓
              Changes saved back to Firebase
                     ↓
              All pages see updated data
```

---

## Common Issues & Solutions

### Issue: Wrong Job Titles
**Cause**: Data may be in `customFields.title` OR root `title` field  
**Solution**: Use the "Edit Contact Information" button to fix titles - saves to both locations

### Issue: Contact not appearing in worklist
**Cause**: `outcomeStatus` is not set to 'interested'  
**Solution**: Mark contact as "Interested but Not Scheduled" in outcomes.html

### Issue: Company name shows as domain (e.g., "company.com")
**Cause**: Only `prospectOrgName` is set, no `customFields.company_name`  
**Solution**: Edit the company name in worklist - saves to both fields

---

## Best Practices

1. **Always use the edit function** rather than manually updating Firebase
2. **Add notes** when making changes to track why data was updated
3. **Set follow-up dates** to keep contacts organized
4. **Assign priorities** (High/Medium/Low) for better workflow management
5. **Review activity history** before making changes to understand context

---

## Technical Notes

- All edits are timestamped and logged in `activityHistory`
- The system maintains dual fields (root + customFields) for backward compatibility
- Email validation is enforced when editing
- Changes are immediately reflected across all CRM pages
- The worklist automatically refreshes after saving edits

