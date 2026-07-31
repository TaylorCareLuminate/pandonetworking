# Client Portal Cache Integration - Quick Reference

## What Changed?

**Before:** Hard-coded campaign numbers (455 records, 190/1,820 emails, etc.)  
**After:** Dynamic data from Railway cache API (real-time campaign data)

## Key Update

### File: `client-portal.html`
### Function: `loadCampaignProgressTable()` (line ~6398)

```javascript
// OLD: Hard-coded HTML with fixed numbers
tbody.innerHTML = `<tr>... 455 ... 190 / 1,820 ... 0 / 1,365 ... 162 / 910 ...</tr>`;

// NEW: Dynamic data from cache API
const allCampaigns = await window.analyticsCacheAPI.fetchCampaignAnalytics();
const customerCampaigns = allCampaigns.filter(c => c.customer_id === window.clientCustomer.id);
// Generate rows dynamically with real data
```

## Data Source

**Railway Cache API:**
- URL: `https://railwayclemail-production.up.railway.app/api/analytics/campaigns`
- Updates: Twice daily (10 AM & 2 PM MT)
- Same source as `analytics_dashboard2.html`

## What You'll See

### Campaign Progress Table Now Shows:

| Column | Data Source | Format |
|--------|-------------|--------|
| Campaign Name | `campaign.campaign_name` | Text |
| Total Records | `campaign.total_records` | Number |
| 📧 Emails | `completed_emails / scheduled_emails` | Progress bar + % |
| 📞 Phone | `completed_phone / phone_activities` | Progress bar + % |
| 💼 LinkedIn | `completed_linkedin / linkedin_activities` | Progress bar + % |
| Overall Progress | Average of 3 channels | Progress bar + % |
| Scheduled | `campaign.outcomes_scheduled` | Badge |
| Interested | `campaign.outcomes_interested` | Clickable badge |

## Testing

1. **Load Portal:** Navigate to `/everex/client-portal.html`
2. **Verify Data:** Compare numbers with `analytics_dashboard2.html`
3. **Check Console:** Should see "✅ Campaign progress table loaded with X campaigns from cache"

## Troubleshooting

**Issue:** Table shows "No campaigns found"  
**Fix:** Check if customer has campaigns in `analytics_dashboard2.html`

**Issue:** Numbers don't match dashboard  
**Fix:** Wait for cache refresh (10 AM or 2 PM MT) or manually refresh cache from dashboard

**Issue:** Console error  
**Fix:** Check if Railway API is accessible: https://railwayclemail-production.up.railway.app/health

## Version

**Current Version:** 1.1.0 (Dynamic cache integration)  
**Previous Version:** 1.0.0 (Hard-coded values)

## Benefits

✅ No more manual updates  
✅ Real-time campaign data  
✅ Supports multiple campaigns  
✅ Respects manual overrides  
✅ Consistent with admin dashboard


