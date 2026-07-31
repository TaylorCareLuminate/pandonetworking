# Team Management System

## Overview

The Team Management System (`team.html`) provides a comprehensive solution for synchronizing consultant data with internal team records and managing team assignments. This system addresses the challenge of keeping team data current when consultant information changes frequently in external systems.

## Key Features

### 🔄 **Data Synchronization**
- **Import from Consultants**: Automatically imports data from `ppccare/consultants` table
- **Intelligent Matching**: Uses name and email similarity algorithms to identify potential matches
- **Conflict Resolution**: Provides user-friendly interface to resolve data conflicts
- **Batch Processing**: Handles multiple conflicts efficiently in a single session

### 👥 **Team Management**
- **Manual CRUD Operations**: Add, edit, and delete team members manually
- **Customer Assignments**: Assign team members to specific customers
- **Team Categories**: Organize members into validated team groups
- **Email Validation**: Special handling for Pivot Point Consulting vs. external email addresses

### 📊 **Data Integration**
- **Customer Mapping**: Automatically maps consultant clients to customer IDs
- **Cross-Reference**: Links data across three database tables
- **Real-time Updates**: Immediate reflection of changes across the system

## Database Structure

### Data Sources

#### `ppccare/consultants`
Source table containing consultant information:
- `id`: Unique consultant identifier
- `name`: Full name of consultant
- `mobile`: Mobile phone number
- `owner`: Owner/manager of consultant relationship
- `email`: Email address
- `Clients`: Comma-separated list of customer names

#### `ppccare/team` (Target Table)
Internal team records with enhanced structure:
- `id`: Unique identifier (defaults to email)
- `email`: Email address (editable)
- `name`: Full name (first and last)
- `team`: Team category (validated against existing teams)
- `customers`: Array of customer IDs (bullhornid references)
- `createdDate`: When record was created
- `createdBy`: Who created the record
- `lastUpdated`: Last modification timestamp
- `updatedBy`: Who last modified the record

#### `ppccare/companies` (Reference Table)
Customer data for mapping:
- `org`: Organization/customer name
- `bullhornid`: Unique customer identifier

## Synchronization Process

### 1. Import Phase
```
ppccare/consultants → Analysis → Conflict Detection
```

### 2. Matching Algorithm
- **Exact Email Match**: 100% confidence for identical email addresses
- **Name Similarity**: 80%+ confidence using Levenshtein distance algorithm
- **Email Similarity**: 70%+ confidence for similar email patterns

### 3. Conflict Types

#### **Potential Matches**
When consultants match existing team members:
- **Update Existing**: Overwrite team member with consultant data
- **Add as New**: Keep both records separately
- **Skip**: Ignore the consultant record

#### **New Consultants**
When consultants have no matches:
- **Add to Team**: Create new team member
- **Skip**: Don't import this consultant

#### **Orphaned Team Members**
When team members with non-Pivot Point Consulting emails aren't found in consultants:
- **Keep Member**: Retain in team database
- **Remove Member**: Delete from team database

### 4. Customer Mapping
Automatically converts comma-separated client names to customer IDs:
```
"Hospital A, Clinic B" → ["HOSP001", "CLIN002"]
```

## User Interface

### Main Sections

#### **Synchronization Panel**
- Import button to start synchronization
- Status messages for process feedback
- Progress indicators during operations

#### **Conflict Resolution Interface**
- Side-by-side data comparison
- Clear action buttons for each conflict
- Confidence percentages for matches
- Color-coded conflict types

#### **Team Management Table**
- Sortable columns for all team data
- Visual indicators for Pivot Point Consulting emails
- Customer assignment tags
- Inline edit and delete actions

#### **Team Member Modal**
- Form for adding/editing team members
- Team dropdown with ability to create new teams
- Multi-select customer assignment interface
- Validation for required fields

### Visual Indicators

- **🛡️ Shield Icon**: Pivot Point Consulting email addresses
- **Color Coding**: Different conflict types (orange for matches, green for new, red for orphans)
- **Confidence Badges**: Percentage match confidence for potential duplicates
- **Customer Tags**: Visual representation of customer assignments

## Usage Guide

### Setting Up Team Data

1. **Initial Import**
   - Click "Import from Consultants" button
   - Review and resolve any conflicts presented
   - Make decisions for each conflict type

2. **Manual Management**
   - Use "Add Team Member" for manual entries
   - Edit existing members using the edit button
   - Delete outdated records as needed

3. **Ongoing Maintenance**
   - Regularly run synchronization to catch updates
   - Review team categories and consolidate as needed
   - Maintain customer assignments as relationships change

### Best Practices

#### **Before Synchronization**
- Ensure consultant data is current and clean
- Review existing team categories for consistency
- Backup current team data if needed

#### **During Conflict Resolution**
- Review match confidence carefully (80%+ is typically reliable)
- When in doubt, choose "Add as New" to preserve data
- Pay special attention to email domain differences

#### **After Synchronization**
- Review team statistics for accuracy
- Verify customer assignments are correct
- Update team categories if new patterns emerge

## Technical Details

### Dependencies
- Firebase Realtime Database
- Font Awesome icons
- Existing authentication system (`../js/auth.js`)

### Performance Features
- **Lazy Loading**: Data fetched only when needed
- **Client-side Processing**: Fast matching algorithms
- **Batch Operations**: Multiple updates in single transactions
- **Caching**: Local data storage to minimize database calls

### Security Considerations
- **Authentication Required**: Only authenticated users can access
- **Audit Trail**: All changes tracked with user and timestamp
- **Domain Validation**: Special handling for organizational email addresses

## Troubleshooting

### Common Issues

#### **No Conflicts Appear**
- Verify consultant data exists in `ppccare/consultants`
- Check that team data exists in `ppccare/team`
- Ensure database connections are working

#### **Customer Names Not Mapping**
- Verify customer data exists in `ppccare/companies`
- Check that `bullhornid` fields are populated
- Review consultant client name formatting

#### **Team Categories Not Saving**
- Ensure team names don't contain special characters
- Check that user has proper permissions
- Verify database write permissions

#### **Slow Performance**
- Large datasets may take time to process
- Consider breaking imports into smaller batches
- Check network connectivity to Firebase

### Error Messages

- **"No consultants data found"**: Check `ppccare/consultants` table
- **"Failed to save team member"**: Verify database permissions
- **"Customer mapping failed"**: Check `ppccare/companies` data integrity

## Integration Points

### With Other Systems
- **Customer Overview**: Team assignments visible on customer cards
- **Task Management**: Team members can be assigned to tasks
- **Roles Management**: Team categories align with role definitions

### Future Enhancements
- **Automated Sync**: Scheduled synchronization without user intervention
- **Advanced Matching**: Machine learning-based duplicate detection
- **Bulk Operations**: Multi-select actions for efficiency
- **Export Functionality**: CSV export of team data
- **Reporting**: Team performance and assignment analytics

---

*This system ensures your team data stays current with external consultant information while maintaining the flexibility to manage internal team structure and assignments.* 