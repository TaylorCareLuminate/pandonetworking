# CRM Migration Scripts - Step 1 Implementation

## Overview

This directory contains the complete implementation of Step 1 from the CRM Database Migration Plan: **Create Migration Scripts**. These scripts extract legacy CRM data from `hl_crm_input_25`, transform it to the unified schema, deduplicate contacts, and build search indexes.

## Files Structure

```
migration_scripts/
├── README.md                    # This file
├── migration_interface.html     # Web interface for running migrations
├── migration_controller.js      # Main orchestration script
├── legacy_data_extractor.js     # Extracts data from hl_crm_input_25
├── data_transformer.js         # Transforms to unified schema
├── deduplication_engine.js      # Handles duplicate detection/merging
└── index_builder.js            # Creates search indexes
```

## Quick Start

### 1. Open Migration Interface
Navigate to `HealthLuminateSite/crm/migration_scripts/migration_interface.html` in your browser.

### 2. Configure Migration
- **Batch Size**: Number of contacts to process at once (default: 1000)
- **Default Customer**: Customer ID for legacy data (default: 'internal')
- **Enable Validation**: Verify migration results (recommended: checked)
- **Dry Run**: Test without writing to database (for testing)

### 3. Run Migration
Click **"Start Migration"** to begin the 5-step process:

1. **Extract** - Pull data from `hl_crm_input_25`
2. **Transform** - Convert to unified schema
3. **Deduplicate** - Merge duplicate contacts
4. **Index** - Build search indexes
5. **Validate** - Verify results

## Component Details

### 1. Legacy Data Extractor (`legacy_data_extractor.js`)

**Purpose**: Extracts all CRM data from Firebase Realtime Database at `hl_crm_input_25/{orgId}/outreach/{encodedEmail}`

**Key Features**:
- Decodes email keys (`_DOT_` → `.`, `_AT_` → `@`)
- Processes all organizations and contacts
- Extracts outreach activity history
- Validates email formats
- Generates contact IDs
- Provides detailed extraction statistics

**Usage**:
```javascript
const extractor = new LegacyDataExtractor();
const result = await extractor.extractAllLegacyData();
console.log(`Extracted ${result.contacts.length} contacts`);
```

### 2. Data Transformer (`data_transformer.js`)

**Purpose**: Converts extracted legacy data to the unified CRM schema

**Key Features**:
- Normalizes emails, phones, LinkedIn URLs
- Cleans and standardizes names/titles
- Maps activity types to unified taxonomy
- Calculates aggregated fields (total contacts, last contact date)
- Validates transformed data
- Enhances tags based on activity patterns

**Transformations Applied**:
- Email normalization (lowercase, trim)
- Phone number standardization (E.164 format)
- Name capitalization
- Company name cleaning
- Activity type mapping
- Date/time standardization

**Usage**:
```javascript
const transformer = new DataTransformer();
const result = await transformer.transformContacts(extractedContacts);
console.log(`Transformed ${result.contacts.length} contacts`);
```

### 3. Deduplication Engine (`deduplication_engine.js`)

**Purpose**: Identifies and merges duplicate contacts using multiple matching algorithms

**Matching Rules** (with confidence weights):
- **Exact Email Match**: 1.0 weight (required)
- **Phone Match**: 0.8 weight
- **LinkedIn URL Match**: 0.9 weight
- **Name Similarity**: 0.6 weight (fuzzy matching)
- **Company Match**: 0.4 weight (fuzzy matching)

**Deduplication Process**:
1. Group contacts by customer (isolation)
2. Find duplicate groups using weighted matching
3. Select primary contact (most complete data)
4. Merge contact data and outreach histories
5. Remove duplicate activities
6. Update aggregated fields

**Usage**:
```javascript
const deduplicator = new DeduplicationEngine();
const result = await deduplicator.deduplicateContacts(transformedContacts);
console.log(`Found ${result.results.duplicateGroups} duplicate groups`);
```

### 4. Index Builder (`index_builder.js`)

**Purpose**: Creates search indexes for efficient querying

**Indexes Created**:
- **by_email**: `{emailHash} → {email, contactId}`
- **by_company**: `{orgId} → {orgName, contactIds[]}`
- **recent_outreach**: `{date} → {contactIds[]}`
- **by_status**: `{status} → {contactIds[]}`
- **by_tag**: `{tag} → {contactIds[]}`

**Index Structure**:
```
crm_unified/{customerId}/indexes/
├── by_email/{emailHash}
├── by_company/{orgId}
├── recent_outreach/{YYYY-MM-DD}
├── by_status/{status}
├── by_tag/{tag}
└── _metadata/{indexName}
```

**Usage**:
```javascript
const indexBuilder = new IndexBuilder();
const result = await indexBuilder.buildIndexes(finalContacts);

// Query examples
const contact = await indexBuilder.queryByEmail('internal', 'john@example.com');
const recentContacts = await indexBuilder.queryRecentOutreach('internal', 30);
```

### 5. Migration Controller (`migration_controller.js`)

**Purpose**: Orchestrates the complete migration process

**Features**:
- Step-by-step migration execution
- Progress tracking and reporting
- Error handling and recovery
- Validation and verification
- Batch processing for large datasets
- Comprehensive logging
- Export capabilities

**Migration Flow**:
```
Start → Extract → Transform → Deduplicate → Index → Validate → Complete
```

**Usage**:
```javascript
const controller = new MigrationController();
const results = await controller.runMigration({
  batchSize: 1000,
  enableValidation: true,
  dryRun: false
});
```

## Database Schema

The migration creates the following structure in HealthcareITDatabase:

```
crm_unified/
├── {customerId}/
│   ├── contacts/
│   │   └── {contactId}
│   │       ├── contactId: "email_based_id"
│   │       ├── email: "john@example.com"
│   │       ├── phone: "+1-555-0123"
│   │       ├── linkedInUrl: "https://linkedin.com/in/john"
│   │       ├── firstName: "John"
│   │       ├── lastName: "Doe"
│   │       ├── company: "Example Corp"
│   │       ├── orgId: "example_corp"
│   │       ├── outreach: {
│   │       │   email: { lastContact, totalContacts, activities[] },
│   │       │   linkedin: { lastContact, totalContacts, activities[] },
│   │       │   phone: { lastContact, totalContacts, activities[] }
│   │       │ }
│   │       ├── lastAnyContact: "2024-01-15T10:00:00Z"
│   │       ├── totalContacts: 5
│   │       ├── hasRecentContact: true
│   │       └── status: "active"
│   └── indexes/
│       ├── by_email/{emailHash}
│       ├── by_company/{orgId}
│       ├── recent_outreach/{date}
│       ├── by_status/{status}
│       └── by_tag/{tag}
```

## Query Examples

### Check if Email Exists
```javascript
const indexBuilder = new IndexBuilder();
const contact = await indexBuilder.queryByEmail('internal', 'john@example.com');
if (contact) {
  console.log(`Contact found: ${contact.contactId}`);
}
```

### Get Recent Outreach (Last 30 Days)
```javascript
const recentContactIds = await indexBuilder.queryRecentOutreach('internal', 30);
console.log(`${recentContactIds.length} contacts had recent outreach`);
```

### Get All Contacts from Company
```javascript
const companyData = await indexBuilder.queryByCompany('internal', 'example_corp');
console.log(`Company has ${companyData.contactCount} contacts`);
```

### Get Contacts by Status
```javascript
const activeContacts = await indexBuilder.queryByStatus('internal', 'active');
console.log(`${activeContacts.contactCount} active contacts`);
```

## Error Handling

Each component includes comprehensive error handling:

- **Validation Errors**: Invalid email formats, missing required fields
- **Data Errors**: Malformed legacy data, encoding issues
- **Firebase Errors**: Network issues, permission problems
- **Processing Errors**: Transformation failures, deduplication issues

All errors are logged with context and can be exported in the migration report.

## Performance Considerations

- **Batch Processing**: Processes contacts in configurable batches (default: 1000)
- **Memory Management**: Streams large datasets to avoid memory issues
- **Index Optimization**: Creates composite indexes for common query patterns
- **Concurrent Processing**: Uses Firebase transactions for safe concurrent access

## Validation & Quality Assurance

The migration includes multiple validation steps:

1. **Data Validation**: Email formats, required fields, data types
2. **Count Validation**: Ensures no data loss during migration
3. **Integrity Validation**: Verifies relationships and references
4. **Index Validation**: Confirms all indexes were created successfully

## Export Capabilities

The system can export data at each step:
- **Extracted Data**: Raw legacy data in JSON format
- **Transformed Data**: Cleaned and normalized data
- **Deduplication Report**: Details on duplicates found and merged
- **Migration Report**: Complete migration summary with statistics

## Troubleshooting

### Common Issues

1. **"No legacy data found"**
   - Verify `hl_crm_input_25` exists in HealthcareITDatabase
   - Check Firebase permissions

2. **"Authentication required"**
   - Ensure user is logged in via `auth.js`
   - Verify user has database access

3. **"Migration validation failed"**
   - Review validation details in migration report
   - Check for data integrity issues

4. **Performance issues**
   - Reduce batch size
   - Enable dry run mode for testing
   - Check Firebase quotas

### Debug Mode

Enable detailed logging by opening browser console and setting:
```javascript
console.log('🔍 Debug mode enabled');
```

## Next Steps

After running Step 1 (Create Migration Scripts):

1. **Test Migration**: Run with dry-run enabled first
2. **Validate Results**: Review migration report and validation results
3. **Backup Data**: Ensure legacy data is backed up before production migration
4. **Monitor Performance**: Watch Firebase usage during migration
5. **Proceed to Step 2**: Test migration with small dataset

## Support

For issues or questions:
1. Check browser console for detailed error messages
2. Review migration log in the interface
3. Export and review migration report
4. Check Firebase console for database issues

---

**Status**: ✅ Step 1 Complete - Migration Scripts Implemented  
**Next**: Step 2 - Test Migration with Sample Data


