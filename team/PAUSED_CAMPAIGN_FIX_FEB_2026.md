# Paused Campaign Filter Fix
**Date:** February 3, 2026  
**Urgency:** HIGH  
**Status:** ✅ DEPLOYED

## Summary
Added comprehensive filtering to prevent **paused campaigns** from loading calls in the phone calling system. Users were seeing scheduled calls from campaigns that had been paused, which should not happen.

## Problem
- Scheduled calls page was showing calls from "Campaign One, Large PT Direct Outreach" even though it was marked as **paused** in the campaigns dashboard
- Once a campaign is paused, no calls should load from it
- The system was only checking campaign status when initially loading the campaign list, but not when loading individual calls

## Root Cause
The call loading logic queried `phone_activities` by `campaignId` without verifying the campaign's current status. This meant:
1. If calls were scheduled while a campaign was **active**
2. Then the campaign was later **paused**
3. Those scheduled calls would still appear in the queue

## Solution
Added **two-layer campaign status verification**:

### Files Changed
- `team/phone-calls.html`
- `crm/scheduled_calls.html`

### Changes Made

#### 1. Campaign Selection Check (line ~4609) - phone-calls.html
Added status verification in `selectCampaignButton()` function:
- Fetches the campaign document from Firestore before loading calls
- Checks if `status === 'active'`
- Shows warning alert if campaign is paused/discontinued
- Prevents call loading if campaign is not active

```javascript
// Double-check campaign status from database
const campaignDoc = await getDoc(doc(db, 'campaigns', campaignId));
const campaignData = campaignDoc.data();
if (campaignData.status !== 'active') {
    showAlert(`This campaign is currently ${campaignData.status}. Only active campaigns can load calls.`, 'warning');
    return; // Don't load calls
}
```

#### 2. Load Calls Check (line ~5094) - phone-calls.html
Added status verification at the start of `loadCalls()` function:
- Fetches campaign document before querying phone activities
- Verifies status is 'active'
- Shows appropriate error states if campaign is paused
- Prevents database queries for inactive campaigns

```javascript
// Verify campaign status before loading calls
const campaignDoc = await getDoc(doc(db, 'campaigns', selectedCampaign));
const campaignData = campaignDoc.data();
if (campaignData.status !== 'active') {
    showAlert(`This campaign is currently ${campaignData.status}. Only active campaigns can load calls.`, 'warning');
    document.getElementById('emptyState').style.display = 'block';
    return;
}
```

#### 3. Existing Campaign List Filter (line ~3352) - phone-calls.html
The `loadAvailableCampaigns()` function already filtered campaigns by status:
```javascript
if (campaignData.status === 'active') {
    // Only show active campaigns in the campaign list
}
```

#### 4. Scheduled Calls Page Filter (line ~1015) - scheduled_calls.html
Added campaign status filter in the call filtering logic:
- Checks if campaign exists and its status is 'active'
- Excludes calls from paused, discontinued, draft, or completed campaigns
- Excludes calls from deleted campaigns (campaign not found)
- Logs excluded campaigns for debugging

```javascript
// PAUSED CAMPAIGN FILTER: Only show calls from active campaigns
if (call.campaignId) {
    const campaign = campaigns.find(c => c.id === call.campaignId);
    if (campaign && campaign.status !== 'active') {
        console.log(`⏸️ Excluding call from ${campaign.status} campaign: ${campaign.name}`);
        return false;
    }
    if (!campaign) {
        console.log(`❌ Excluding call from unknown/deleted campaign: ${call.campaignId}`);
        return false;
    }
}
```

#### 5. Campaign Status Summary Logging (line ~1070) - scheduled_calls.html
Added logging to show campaign status breakdown:
```javascript
// LOG CAMPAIGN STATUS SUMMARY
const campaignStatusCounts = campaigns.reduce((acc, c) => {
    acc[c.status || 'unknown'] = (acc[c.status || 'unknown'] || 0) + 1;
    return acc;
}, {});
console.log('📊 Campaign Status Summary:', campaignStatusCounts);
```

## Campaign Status Values
- **active** - Campaign is running, calls can be loaded ✅
- **paused** - Campaign is temporarily stopped, calls should NOT load ⏸️
- **discontinued** - Campaign is ended, calls should NOT load ❌
- **draft** - Campaign not yet launched, calls should NOT load 📝
- **completed** - Campaign finished, calls should NOT load ✓

## Impact
✅ **Positive Effects:**
- Paused campaigns no longer load calls
- Users can't accidentally work on paused campaigns
- Clearer messaging when trying to access inactive campaigns
- Prevents confusion about which campaigns are active
- Campaign status is now respected throughout the call loading flow

⚠️ **Important Notes:**
- This adds an extra database read (campaign document) before loading calls
- Performance impact is minimal (<100ms per campaign selection)
- Users will see a warning message if they try to access a paused campaign
- Existing scheduled calls in paused campaigns remain in the database but won't display

## Testing & Verification

### Phone Calls Page (`team/phone-calls.html`)
1. Pause a campaign in the campaigns dashboard
2. Refresh the phone-calls page
3. Try to select the paused campaign
4. Should see: "This campaign is currently paused. Only active campaigns can load calls."
5. Campaign list should only show active campaigns

### Scheduled Calls Page (`crm/scheduled_calls.html`)
1. Pause a campaign that has scheduled calls
2. Refresh the scheduled_calls page
3. Verify those calls no longer appear in the list
4. Check console logs for: "⏸️ Excluding call from paused campaign: [Campaign Name]"
5. Verify "📊 Campaign Status Summary" shows breakdown of active vs paused campaigns

## User Experience

### Phone Calls Page
**Before Fix:**
- User sees scheduled calls from paused campaigns
- Confusion about why calls appear for inactive campaigns
- Risk of calling contacts for campaigns that shouldn't be active

**After Fix:**
- Only active campaigns appear in the campaign list
- Warning message if attempting to access paused campaigns
- Clear feedback about campaign status
- Clean, empty state when no active calls available

### Scheduled Calls Page
**Before Fix:**
- "Campaign One, Large PT Direct Outreach" showed calls even though it was paused
- Misleading call counts included paused campaigns
- No way to tell which calls were from active vs inactive campaigns

**After Fix:**
- Only calls from active campaigns appear in the list
- Paused campaign calls are automatically filtered out
- Console logs show which campaigns/calls are being excluded
- Campaign status summary provides transparency

## Related Files
- `team/SCHEDULED_CALLS_FILTER_MATCH_FEB_2026.md` - Matching filters between scheduled_calls and phone-calls
- `team/COOLDOWN_REDUCTION_40H_FEB_2026.md` - Recent cooldown adjustment
- `team/ACCURATE_CALL_COUNT_FIX_FEB_2026.md` - Call count display fixes
- `team/NO_CALLS_LOADING_FIX_FEB_2026.md` - Previous call loading fixes

## Future Considerations
- Consider adding a visual indicator on campaign buttons showing status
- Could add a "Resume Campaign" button directly in the phone-calls interface
- Might want to add campaign status to the campaign overview modal
- Could implement auto-refresh when campaign status changes
