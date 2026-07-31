# Firebase Indexes Deployment Guide

## Problem
The `phone-calls.html` page and `team-performance.html` are getting 400 errors because required Firestore indexes are missing.

## Required Indexes

### 1. campaign_call_tracking Index
- **Fields**: `campaignId` (Ascending), `timestamp` (Descending)
- **Purpose**: Enables queries to calculate qualifying calls and achievement pool values

### 2. phone_activities Index (Multi-field)
- **Fields**: `campaignId`, `completedBy`, `status`, `completedAt` (all Ascending)
- **Purpose**: Enables queries to load agent recent calls

### 3. phone_activities Index (Status + CompletedAt)
- **Fields**: `status` (Ascending), `completedAt` (Ascending)
- **Purpose**: Enables cooldown filter queries

### 4. phone_activities Index (Outcome)
- **Fields**: `outcome` (Ascending)
- **Purpose**: Enables declined contacts filter queries

---

## Deployment Options

### Option 1: One-Click Links (Easiest - Requires Firebase Console Access)

Someone with Firebase Console access can click these links to auto-create the indexes:

1. **campaign_call_tracking index:**
   ```
   https://console.firebase.google.com/v1/r/project/clemail/firestore/indexes?create_composite=ClZwcm9qZWN0cy9jbGVtYWlsL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jYW1wYWlnbl9jYWxsX3RyYWNraW5nL2luZGV4ZXMvXxABGg4KCmNhbXBhaWduSWQQARoNCgl0aW1lc3RhbXAQAhoMCghfX25hbWVfXxAC
   ```

2. **phone_activities index:**
   ```
   https://console.firebase.google.com/v1/r/project/clemail/firestore/indexes?create_composite=ClBwcm9qZWN0cy9jbGVtYWlsL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9waG9uZV9hY3Rpdml0aWVzL2luZGV4ZXMvXxABGg4KCmNhbXBhaWduSWQQARoPCgtjb21wbGV0ZWRCeRABGgoKBnN0YXR1cxABGg8KC2NvbXBsZXRlZEF0EAEaDAoIX19uYW1lX18QAQ
   ```

**Steps:**
1. Click each link above
2. Click "Create Index" button
3. Wait 1-2 minutes for indexing to complete
4. Refresh the phone-calls.html page

---

### Option 2: Firebase CLI Deployment (Requires CLI Access)

If you have Firebase CLI installed and authenticated:

```bash
# 1. Make sure you're in the project root directory
cd C:\Projects\HealthLuminateSiteFromLocal

# 2. Deploy the indexes
firebase deploy --only firestore:indexes

# 3. Wait for deployment to complete (1-2 minutes)
```

**Prerequisites:**
- Firebase CLI installed: `npm install -g firebase-tools`
- Authenticated: `firebase login`
- Project initialized: `firebase init` (select Firestore)

---

### Option 3: Manual Creation in Firebase Console

If the links don't work, manually create in Firebase Console:

1. Go to: https://console.firebase.google.com/project/clemail/firestore/indexes
2. Click "Create Index" button
3. For each index, enter:

**Index 1:**
- Collection: `campaign_call_tracking`
- Fields:
  - `campaignId`: Ascending
  - `timestamp`: Descending

**Index 2:**
- Collection: `phone_activities`
- Fields:
  - `campaignId`: Ascending
  - `completedBy`: Ascending
  - `status`: Ascending
  - `completedAt`: Ascending

**Index 3:**
- Collection: `phone_activities`
- Fields:
  - `status`: Ascending
  - `completedAt`: Ascending

**Index 4:**
- Collection: `phone_activities`
- Fields:
  - `outcome`: Ascending

4. Click "Create" for each index
5. Wait 1-2 minutes for indexing to complete

---

## Verification

After deployment, verify the indexes are working:

1. Open: https://console.firebase.google.com/project/clemail/firestore/indexes
2. Ensure all indexes show status: **"Enabled" (green)**
3. Test by refreshing `phone-calls.html` and clicking the "4A" campaign button
4. Check browser console - should see "✅ API Success" instead of "400" errors

---

## Files

- `firestore.indexes.json` - Index configuration file (for Firebase CLI deployment)
- This file - Deployment instructions

---

## Support

If you encounter issues:
1. Check that you're authenticated to the correct Firebase project (`clemail`)
2. Verify you have "Editor" or "Owner" role in Firebase project
3. Check Firebase Console for index creation status
4. Allow 1-2 minutes for indexes to build after creation

---

## Impact

Once deployed, these fixes will enable:
- ✅ 4A campaign to load properly in phone-calls.html
- ✅ Achievement pool calculations to work correctly
- ✅ Recent calls filtering to work (cooldown logic)
- ✅ Declined contacts filtering to work
- ✅ Faster query performance across the board

