# Webhook Filtering with Dual Mapping System

## Overview
The dashboard now uses a **dual mapping system** to filter webhook data (replies & connections) by BDR, using BOTH HeyReach Account IDs and LinkedIn Profile URLs.

## How It Works

### 1. Data Loading
When the dashboard loads, it queries the `linkedin_accounts` collection and creates TWO mappings:
- **Map 1:** `linkedInAccountIdMapping` - Maps HeyReach Account ID → BDR Email
- **Map 2:** `linkedInUrlMapping` - Maps LinkedIn Profile URL → BDR Email

### 2. Webhook Filtering
When processing webhook events, the system tries THREE methods to identify the BDR:

**Method 1:** Direct `bdrEmail` field in webhook document (if exists)
```javascript
if (data.bdrEmail) {
    webhookBdrEmail = data.bdrEmail;
}
```

**Method 2:** HeyReach Account ID mapping
```javascript
else if (data.linkedInAccountId && linkedInAccountIdMapping.has(data.linkedInAccountId)) {
    webhookBdrEmail = linkedInAccountIdMapping.get(data.linkedInAccountId);
}
```

**Method 3:** LinkedIn URL mapping (from `rawData.sender.profile_url`)
```javascript
else if (data.rawData?.sender?.profile_url) {
    const normalizedUrl = data.rawData.sender.profile_url.toLowerCase().replace(/\/$/, '');
    if (linkedInUrlMapping.has(normalizedUrl)) {
        webhookBdrEmail = linkedInUrlMapping.get(normalizedUrl);
    }
}
```

### 3. Filtering Decision
- If ANY method successfully identifies the BDR email → Filter by that email
- If NO method works → Show all webhooks (can't filter, log warning)

## What You Need to Do

### Option 1: Add `heyreachAccountId` to `linkedin_accounts` (PREFERRED)
For each document in the `linkedin_accounts` collection, add the HeyReach Account ID:

```javascript
{
  bdrEmail: "derek.moore@keybenefit.com",
  heyreachAccountId: "109476",  // ← Add this field
  accountName: "Derek Moore",
  // ... other fields
}
```

**How to find the HeyReach Account ID:**
- Check the webhook data in `heyreach_activity` collection
- Look for `linkedInAccountId` field (e.g., `"109476"`)
- Match by the account name or LinkedIn URL

### Option 2: Add `linkedInUrl` to `linkedin_accounts` (FALLBACK)
Alternatively, add the LinkedIn profile URL:

```javascript
{
  bdrEmail: "derek.moore@keybenefit.com",
  linkedInUrl: "https://www.linkedin.com/in/derek-moore",  // ← Add this field
  accountName: "Derek Moore",
  // ... other fields
}
```

**Where to find the LinkedIn URL:**
- From the webhook: `rawData.sender.profile_url`
- Or manually from LinkedIn

### Option 3: Use BOTH (BEST)
For maximum reliability, add both fields:

```javascript
{
  bdrEmail: "derek.moore@keybenefit.com",
  heyreachAccountId: "109476",
  linkedInUrl: "https://www.linkedin.com/in/derek-moore",
  accountName: "Derek Moore"
}
```

## Example Webhook Data Structure
From `heyreach_activity` collection:

```javascript
{
  eventType: "CONNECTION_REQUEST_ACCEPTED",
  linkedInAccountId: "109476",  // ← Use this for Method 2
  rawData: {
    sender: {
      profile_url: "https://www.linkedin.com/in/ryan-scanlon-mba"  // ← Use this for Method 3
    }
  }
}
```

## Console Logs to Watch For

### Success (with Account ID mapping):
```
✅ Loaded 5 LinkedIn account ID mappings
✅ Loaded 0 LinkedIn URL mappings
📦 Found 13 webhook reply events (before filtering)
✅ Matched 7 reply activities from webhooks (after user filtering)
```

### Success (with URL mapping):
```
✅ Loaded 0 LinkedIn account ID mappings
✅ Loaded 5 LinkedIn URL mappings
📦 Found 13 webhook reply events (before filtering)
✅ Matched 7 reply activities from webhooks (after user filtering)
```

### Warning (no mapping available):
```
⚠️ WARNING: No LinkedIn mappings loaded!
   Webhook data will be shown but cannot be filtered by user.
   To fix: Add heyreachAccountId or linkedInUrl to linkedin_accounts documents.
```

## Benefits of This System

1. **Flexible:** Works with either HeyReach Account IDs OR LinkedIn URLs
2. **Robust:** Tries multiple methods before giving up
3. **Graceful:** Shows all webhooks if filtering isn't possible (with warning)
4. **Future-proof:** Easy to add more filtering methods if needed

## Next Steps

1. Open Firebase Console → Firestore Database
2. Navigate to `linkedin_accounts` collection
3. For each document, add `heyreachAccountId` and/or `linkedInUrl` fields
4. Refresh the dashboard
5. Check console logs to confirm mappings are loaded
6. Verify filtering works by switching between BDRs

## Troubleshooting

**Q: I added the fields but webhooks still show everyone's data**
- Check console logs for the number of mappings loaded
- Ensure the URLs match exactly (case-insensitive, trailing slash removed)
- Verify the `linkedInAccountId` in webhooks matches the `heyreachAccountId` in `linkedin_accounts`

**Q: Where do I find the correct `heyreachAccountId` for each BDR?**
- Query the `heyreach_activity` collection in Firestore
- Look for a webhook from that BDR
- Check the `linkedInAccountId` field
- Also check `rawData.sender.id` (numeric version)

**Q: Can I test if it's working?**
- Yes! Check the console debug logs:
  ```
  🔍 DEBUG - Sample webhook reply data: {
    linkedInAccountId: "109476",
    rawDataSenderUrl: "https://www.linkedin.com/in/ryan-scanlon-mba"
  }
  ```
- Then verify your `linkedin_accounts` document has matching data













