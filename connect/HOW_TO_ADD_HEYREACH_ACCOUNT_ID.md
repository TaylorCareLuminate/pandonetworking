# How to Add HeyReach Account ID & LinkedIn URL

## What You Need to Do

You can now add the **HeyReach Account ID** and **LinkedIn URL** directly in the Admin Email Controls page!

## Step-by-Step Instructions

### 1. Go to Email Controls Page
Navigate to: **Admin → Email Controls**
- URL: `https://healthluminate.com/admin/email_controls.html`

### 2. Scroll to LinkedIn Accounts Section
- You'll see all your LinkedIn accounts listed

### 3. Edit Each LinkedIn Account
For each account:
1. Click the **"Edit"** button on the LinkedIn account card
2. You'll see two new fields:

#### **HeyReach Account ID** (Required for webhook filtering!)
- **Where to find it:** Check the dashboard console logs
  - Look for: `🔍 DEBUG - Sample webhook connection data`
  - Copy the `linkedInAccountId` value (e.g., `109476`)
- **Example:** `109476`

#### **LinkedIn URL (for Webhook Filtering)**
- **Where to find it:** Also in the dashboard console logs
  - Look for: `rawDataSenderUrl`
  - Copy the URL (e.g., `https://www.linkedin.com/in/derek-moore-2399744`)
- **Or:** Use the same URL as the LinkedIn Profile URL field above it
- **Example:** `https://www.linkedin.com/in/derek-moore-2399744`

### 4. Save the Account
Click **"Update LinkedIn Account"**

### 5. Repeat for All BDRs
Do this for each BDR's LinkedIn account.

## Based on Your Console Logs

From your dashboard debug output, here's what you need to add:

### Derek Moore's Account
```
HeyReach Account ID: 104986
LinkedIn URL: https://www.linkedin.com/in/derek-moore-2399744
```

### Taylor Davis's Account
```
HeyReach Account ID: 104063
LinkedIn URL: https://www.linkedin.com/in/taylorkentdavis
```

## How to Find These Values

### Method 1: From Dashboard Console (EASIEST)
1. Open the dashboard: `https://healthluminate.com/connect/`
2. Open browser console (F12)
3. Look for these debug logs:
   ```
   🔍 DEBUG - Sample webhook reply data: {
     linkedInAccountId: "104986",
     rawDataSenderUrl: "https://www.linkedin.com/in/derek-moore-2399744"
   }
   ```
4. Copy the `linkedInAccountId` → Use as **HeyReach Account ID**
5. Copy the `rawDataSenderUrl` → Use as **LinkedIn URL**

### Method 2: From Firestore (Alternative)
1. Open Firebase Console → Firestore Database
2. Go to `heyreach_activity` collection
3. Open any webhook document from that BDR
4. Look for:
   - `linkedInAccountId` field
   - `rawData.sender.profile_url` field

## After You Save

Once you save these fields:

1. **Refresh the Dashboard**
2. **Check Console Logs** - You should see:
   ```
   ✅ Loaded 2 LinkedIn account ID mappings
   ✅ Loaded 2 LinkedIn URL mappings
   ```
3. **Test Filtering** - Switch between BDRs in the admin selector
4. **Verify** - Each BDR should only see THEIR webhook data (replies & connections)

## What These Fields Do

### HeyReach Account ID
- Maps the webhook's `linkedInAccountId` to the BDR
- **Primary filtering method** (preferred)
- Example: Webhook has `linkedInAccountId: "109476"` → Matches account with `heyreachAccountId: "109476"`

### LinkedIn URL
- Maps the webhook's sender profile URL to the BDR
- **Fallback filtering method** (if Account ID fails)
- Example: Webhook has `rawData.sender.profile_url: "https://www.linkedin.com/in/derek-moore"` → Matches account with `linkedInUrl: "https://www.linkedin.com/in/derek-moore"`

## Visual Indicators in Email Controls

After you add these fields, you'll see in the LinkedIn account card:

✅ **Green badge** with the HeyReach Account ID if set
⚠️ **Red warning** if not set: "webhook filtering will not work!"

## Troubleshooting

### Q: I added the fields but filtering still doesn't work
- **Check:** Verify the values match EXACTLY what's in the webhook data
- **Check:** URLs should be normalized (lowercase, no trailing slash)
- **Check:** Make sure you saved the account after editing

### Q: Where do I find the HeyReach Account ID for a specific BDR?
1. Go to dashboard
2. Filter to that BDR
3. Open console (F12)
4. Look for the debug log with `linkedInAccountId`

### Q: Can I leave LinkedIn URL blank?
- Yes, but you MUST have the HeyReach Account ID
- LinkedIn URL is a fallback, but recommended to have both

## Summary

**Quick Steps:**
1. Admin → Email Controls
2. Edit each LinkedIn account
3. Add **HeyReach Account ID** (from webhook data)
4. Add **LinkedIn URL** (from webhook data)
5. Save
6. Refresh dashboard
7. ✅ Filtering should work!

The dashboard will now correctly filter webhook data (inbound messages, connections) by BDR!













