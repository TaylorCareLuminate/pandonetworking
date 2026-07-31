# Enrichment Logic Summary

## Core Principle: ALL Revenue Plans Are ALWAYS Included

The enrichment process follows this fundamental rule:
**ALL revenue plans from `ers/revenue_plans` are ALWAYS included in `ers/enriched_revenue_plans`, regardless of whether PensionPro matches exist.**

## How It Works

### 1. Base Foundation (REQUIRED)
- Start with ALL revenue plan data from `ers/revenue_plans`
- Every plan is copied to the enriched dataset with all its fields intact
- This happens for EVERY plan, no exceptions

### 2. PensionPro Data (OPTIONAL)
- After base data is set, attempt to find a PensionPro match
- IF a match is found:
  - Add all PensionPro fields with `pp_` prefix
  - Set `pensionProEnriched: true`
  - Set `pensionProRecordId: [rowNumber]`
- IF no match is found:
  - Plan is still saved with all its revenue data
  - No PP fields are added
  - This is perfectly fine and expected

### 3. Result
- Enriched dataset contains the SAME number of plans as revenue_plans
- Some plans have PP data (extra columns)
- Some plans don't have PP data (revenue data only)
- Both types are equally valid and included

## Implementation in Each File

### reconcile.html - `buildEnrichedDataset()`

```javascript
// Process EVERY internal plan
this.plans.forEach(plan => {
    totalPlans++;
    
    // Create enriched plan with ALL revenue data
    const enrichedPlan = { ...plan, /* all fields */ };
    
    // Add RK data if matched
    if (matchedContractId) {
        // Add RK-specific fields
    }
    
    // Try to add PensionPro data (OPTIONAL)
    if (ppData && ppData.records) {
        const ppMatch = this.findPensionProMatch(plan, ppData.records);
        if (ppMatch) {
            ppEnrichedPlans++;
            this.enrichWithPensionProData(enrichedPlan, ppMatch);
            // Plan gets PP data
        } else {
            // Plan continues WITHOUT PP data (still valid)
        }
    }
    
    // ALWAYS add to enriched dataset
    enrichedData[plan.id] = enrichedPlan;
});
```

**Result**: ALL plans included, some with PP data, some without.

---

### incomplete-plans.html - `rebuildEnrichedDataset()`

```javascript
// Loop through EVERY plan in revenue_plans
for (const [planId, planData] of Object.entries(plans)) {
    // Create enriched record with ALL revenue data
    enrichedData[planId] = {
        ...planData,
        dataSource: 'internal_only',
        // ... metadata
    };
    
    // Try to add PensionPro data (OPTIONAL)
    if (ppData && ppData.records) {
        const ppMatch = findPensionProMatch(planData, ppData.records, ppMatches, planId);
        if (ppMatch) {
            enrichWithPensionProData(enrichedData[planId], ppMatch);
            ppEnrichedCount++;
            // Plan gets PP data
        } else {
            // Plan continues WITHOUT PP data (still valid)
        }
    }
    
    // Count ALL plans
    rebuiltCount++;
}

// Save ALL plans to enriched dataset
await window.firebaseRTDB.set(enrichedDbRef, enrichedData);
```

**Result**: ALL plans included, some with PP data, some without.

---

### plan-revenue.html - `rebuildEnrichedDataForPlan()`

```javascript
async rebuildEnrichedDataForPlan(planId, planData) {
    // Start with ALL revenue plan data as foundation
    const enrichedPlan = {
        id: planId,
        ...planData,  // ALL revenue data included
        dataSource: 'internal_only',
        // ... metadata
    };
    
    // Try to add PensionPro data (OPTIONAL)
    if (ppData && ppData.records) {
        const ppMatch = this.findPensionProMatch(planData, ppData.records, ppMatches, planId);
        if (ppMatch) {
            this.enrichWithPensionProData(enrichedPlan, ppMatch);
            // Plan gets PP data
        } else {
            // Plan continues WITHOUT PP data (still valid)
        }
    }
    
    // ALWAYS save to enriched dataset (with or without PP data)
    await window.firebaseRTDB.set(enrichedDbRef, enrichedPlan);
}
```

**Result**: Plan is ALWAYS saved with revenue data. PP data added only if match exists.

---

## PensionPro Fields Added (When Match Exists)

When a match is found, these fields are added with `pp_` prefix:

- `pp_clientId`
- `pp_clientInternalId`
- `pp_clientCompanyName`
- `pp_clientStatus`
- `pp_clientCategory`
- `pp_clientCategoryDescription`
- `pp_clientLocationName`
- `pp_planId`
- `pp_planName`
- `pp_planType`
- `pp_planTypeDescription`
- `pp_primaryAdvisorFullName`
- `pp_primaryAdvisorEmail`
- `pp_allAdvisorsCount`
- `pp_allAdvisorsNames`
- `pp_projectNames`
- `pensionProEnriched` (boolean flag)
- `pensionProRecordId` (row number)

### Fields That Overwrite Revenue Data

Some PensionPro fields will **overwrite** the corresponding revenue data field in the enriched dataset (NOT in the original revenue_plans):

#### Status Overwrite
- **Source Field**: `ppRecord.clientStatus` (from PensionPro)
- **Target Field**: `enrichedPlan.status` (overwrites in enriched dataset only)
- **Condition**: Only overwrites if PensionPro status is not empty
- **Tracking**: `statusSource` field added to track origin ('pensionpro' or 'revenue')
- **Example Values**: Active, Onboarding, Terminated

**Important Notes:**
- Original revenue data in `ers/revenue_plans` remains unchanged
- Status overwrite only happens in `ers/enriched_revenue_plans`
- If PensionPro status is empty, revenue status is kept
- Console logs show when status is overwritten: `🔄 Overwrote status with PensionPro value: Active`

## Console Output Examples

### reconcile.html Output:
```
📊 Enriched dataset built:
   Total plans: 335 (ALL revenue plans included)
   Enriched with RK data: 280
   Enriched with PP data: 245
   Plans without PP data: 90
   Internal data only: 55
```

### incomplete-plans.html Output:
```
✅ Rebuilt 335 plans in enriched dataset (ALL revenue plans included)
   Plans with PP data: 245
   Plans without PP data: 90
```

### plan-revenue.html Output (per plan):
```
✨ Added PensionPro data to plan: ABC Company 401(k)
✅ Successfully rebuilt enriched dataset entry for plan: plan_123
```

OR

```
ℹ️ No PensionPro match found (plan still saved with revenue data only)
✅ Successfully rebuilt enriched dataset entry for plan: plan_456
```

## Key Takeaways

1. ✅ **ALL revenue plans are ALWAYS in the enriched dataset**
2. ✅ **PensionPro data is an enhancement, not a requirement**
3. ✅ **Plans without PP matches are fully valid and functional**
4. ✅ **The enriched dataset count = revenue_plans count**
5. ✅ **Matching is best-effort; failures don't block the process**

## Data Flow

```
Revenue Plans (ers/revenue_plans)
        ↓
    [ALL plans loaded]
        ↓
    [Create enriched record with ALL revenue data]
        ↓
    [Try to find PP match]
        ↓
    ┌─────────────────┬─────────────────┐
    │  Match Found    │  No Match       │
    │  Add PP fields  │  Skip PP fields │
    └─────────────────┴─────────────────┘
        ↓                   ↓
    [Save to enriched dataset]
        ↓
Enriched Dataset (ers/enriched_revenue_plans)
  - Contains ALL revenue plans
  - Some with PP data (extra columns)
  - Some without PP data (revenue only)
```

## Testing Verification

To verify this works correctly:

1. Check total count: `ers/revenue_plans` count = `ers/enriched_revenue_plans` count
2. Check logs: Should see "plan still included" messages for non-matches
3. Check data: Plans without `pp_*` fields should still exist in enriched dataset
4. Check alerts: Should say "ALL revenue plans included"

---

**Last Updated**: January 15, 2026
**Files Affected**: reconcile.html, incomplete-plans.html, plan-revenue.html
