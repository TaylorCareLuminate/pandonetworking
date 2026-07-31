# BCC Rate Backend Implementation Guide

## Overview
The campaign email BCC feature has been updated from a simple on/off toggle to a percentage-based system. This allows managers to monitor a sample of campaign emails without being overwhelmed by receiving copies of every single email.

## Frontend Changes (Completed)
The frontend (`campaigns_enhanced.html`) has been updated to:
- Replace the `enableEmailBcc` checkbox with an `emailBccRate` percentage field (0-100%)
- Store `bccRate` instead of `bccEnabled` in campaign data
- Provide backward compatibility with old campaigns that used `bccEnabled`
- Display BCC rate in campaign cards and review sections

## Backend Implementation Required

### Campaign Data Structure
When reading campaign data from Firestore, the email configuration will now include:

```javascript
campaign.channels.email = {
  enabled: true/false,
  openTrackingRate: 10,        // Percentage (0-100)
  bccRate: 25,                 // NEW: Percentage (0-100)
  bccAddress: "manager@example.com",
  templates: [...]
}
```

### Email Sending Logic
When sending emails for a campaign, implement the following logic:

```javascript
async function sendCampaignEmail(campaignId, recipientEmail, templateData) {
  // Load campaign configuration
  const campaign = await getCampaign(campaignId);
  const emailConfig = campaign.channels?.email;
  
  if (!emailConfig?.enabled) {
    return; // Email channel not enabled
  }
  
  // Prepare email
  const emailData = {
    to: recipientEmail,
    subject: renderTemplate(templateData.subject, templateData.variables),
    body: renderTemplate(templateData.body, templateData.variables),
    bcc: null  // Default: no BCC
  };
  
  // Determine if this email should be BCC'd based on percentage
  const bccRate = emailConfig.bccRate || 0;
  const shouldBcc = Math.random() * 100 < bccRate;
  
  if (shouldBcc && emailConfig.bccAddress) {
    emailData.bcc = emailConfig.bccAddress;
    console.log(`📧 BCC: Sending copy to ${emailConfig.bccAddress} (${bccRate}% rate)`);
  }
  
  // Determine if this email should have open tracking
  const trackingRate = emailConfig.openTrackingRate || 10;
  const shouldTrack = Math.random() * 100 < trackingRate;
  
  if (shouldTrack) {
    emailData.enableTracking = true;
  }
  
  // Send the email
  await sendEmail(emailData);
}
```

### Key Implementation Points

1. **Random Selection**: Use `Math.random() * 100 < bccRate` to determine if an email should be BCC'd
   - If `bccRate` is 25, approximately 25% of emails will be BCC'd
   - If `bccRate` is 0, no emails will be BCC'd
   - If `bccRate` is 100, all emails will be BCC'd

2. **Validation**: 
   - Only BCC if `bccRate > 0` AND `bccAddress` is provided
   - Validate that `bccAddress` is a valid email address

3. **Backward Compatibility**:
   ```javascript
   // Handle old campaigns that used bccEnabled boolean
   let bccRate = emailConfig.bccRate;
   if (bccRate === undefined && emailConfig.bccEnabled === true) {
     bccRate = 100; // Migrate: if BCC was enabled, treat as 100%
   }
   ```

4. **Logging**: Log when emails are BCC'd for monitoring and debugging:
   ```javascript
   if (shouldBcc) {
     await logEmailEvent({
       campaignId,
       recipientEmail,
       eventType: 'bcc_sent',
       bccAddress: emailConfig.bccAddress,
       timestamp: new Date()
     });
   }
   ```

## Testing

### Test Cases
1. **BCC Rate 0%**: No emails should be BCC'd
2. **BCC Rate 100%**: All emails should be BCC'd
3. **BCC Rate 25%**: Approximately 1 in 4 emails should be BCC'd
4. **No BCC Address**: Even if rate > 0, don't BCC if address is missing
5. **Backward Compatibility**: Old campaigns with `bccEnabled: true` should BCC all emails

### Test Script Example
```javascript
// Simulate 100 emails with 25% BCC rate
const bccRate = 25;
let bccCount = 0;

for (let i = 0; i < 100; i++) {
  const shouldBcc = Math.random() * 100 < bccRate;
  if (shouldBcc) bccCount++;
}

console.log(`BCC'd ${bccCount} out of 100 emails (target: ~25)`);
// Expected: bccCount should be around 20-30
```

## Migration Notes

### Existing Campaigns
- Campaigns created before this change may have `bccEnabled` boolean
- Backend should handle both formats:
  - If `bccRate` exists, use it
  - If `bccRate` doesn't exist but `bccEnabled: true`, treat as 100%
  - If neither exists or `bccEnabled: false`, treat as 0%

### Database Migration (Optional)
You may want to migrate old campaigns to the new format:

```javascript
async function migrateCampaignBccSettings() {
  const campaigns = await getAllCampaigns();
  
  for (const campaign of campaigns) {
    if (campaign.channels?.email?.bccEnabled !== undefined) {
      const bccRate = campaign.channels.email.bccEnabled ? 100 : 0;
      
      await updateCampaign(campaign.id, {
        'channels.email.bccRate': bccRate
      });
      
      console.log(`Migrated campaign ${campaign.name}: bccRate = ${bccRate}%`);
    }
  }
}
```

## Benefits

1. **Reduced Email Overload**: Managers can monitor campaigns without drowning in emails
2. **Flexible Monitoring**: Adjust percentage based on campaign confidence (new campaigns: 50%, established campaigns: 10%)
3. **Cost Efficiency**: Fewer BCC emails = lower email sending costs
4. **Quality Control**: Still get representative sample to catch issues early

## Recommended Settings

- **New/Unproven Campaigns**: 50-100% BCC rate for close monitoring
- **Established Campaigns**: 10-25% BCC rate for spot checking
- **Trusted/Automated Campaigns**: 0-5% BCC rate for minimal oversight
- **Development/Testing**: 100% BCC rate to review all test emails

## Support

If you have questions about implementing this feature in the backend, please refer to:
- Frontend implementation in `campaigns_enhanced.html` (lines 1357-1381, 3246-3263, 3919-3930)
- This guide for backend probability logic
- Existing open tracking rate implementation as a reference (it uses the same probability approach)

