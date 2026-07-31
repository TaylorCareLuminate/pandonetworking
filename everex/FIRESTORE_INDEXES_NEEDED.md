# Firestore Indexes Required for Client Portal Performance

## Performance Issue
The client portal was taking 15+ minutes to load because it was querying all conversations across all BDRs without proper indexes.

## Solution Applied (v1.3.8)
1. **Parallel queries** instead of `or()` queries (faster)
2. **Time filtering** - only load conversations since Jan 1, 2026 (matches activity stats)
3. **Query limits** - max 500 conversations per BDR as safety
4. **Graceful fallback** - if index doesn't exist, falls back to simpler query

## Required Firestore Composite Indexes

To get optimal performance, create these composite indexes in Firebase Console:

### Collection: `heyreach_inbox_conversations`

**Index 1:**
- Field: `bdrEmail` (Ascending)
- Field: `lastMessageAt` (Descending)

**Index 2 (if using timestamp field instead):**
- Field: `bdrEmail` (Ascending)  
- Field: `timestamp` (Descending)

## How to Create Indexes

### Option 1: Via Firebase Console
1. Go to: https://console.firebase.google.com/
2. Select your project
3. Navigate to: **Firestore Database** → **Indexes** tab
4. Click **Create Index**
5. Collection ID: `heyreach_inbox_conversations`
6. Add fields:
   - `bdrEmail` (Ascending)
   - `lastMessageAt` (Descending)
7. Click **Create**

### Option 2: Via Error Link
When the code runs without indexes, Firestore will log an error with a direct link to create the index. Click that link and it will auto-populate the index configuration.

### Option 3: Via firebase.json
Add to your `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "heyreach_inbox_conversations",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "bdrEmail",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "lastMessageAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

Then deploy:
```bash
firebase deploy --only firestore:indexes
```

## Expected Performance Improvement

**Before optimization:**
- Loading all conversations across all time
- Using slow `or()` query 
- No indexes
- **Result: 15+ minutes**

**After optimization (with indexes):**
- Parallel queries per BDR
- Time-filtered (only 2026 data)
- Composite indexes on (bdrEmail, lastMessageAt)
- Query limits (500 per BDR)
- **Expected result: < 5 seconds**

**Without indexes (fallback mode):**
- Falls back to simpler query (bdrEmail only)
- Client-side time filtering
- Still uses parallel queries + limits
- **Expected result: 30-60 seconds** (much better than 15 min, but not as fast as with indexes)

## Notes

- The code will work WITHOUT indexes (using fallback), but will be slower
- Creating indexes takes 5-10 minutes after submission
- Once built, indexes are permanent and automatic
- The fallback ensures the page loads even if indexes aren't created yet
