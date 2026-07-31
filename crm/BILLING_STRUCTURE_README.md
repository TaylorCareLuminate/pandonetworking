# Campaign Billing Structure Documentation

## Overview

The HealthLuminate Campaign Billing System tracks client commitments and costs for multi-channel outreach campaigns. This document outlines the complete billing structure, pricing models, and data organization.

## Table of Contents

1. [Billing Models](#billing-models)
2. [Activity Pricing](#activity-pricing)
3. [At-Risk Scheduling Bonus](#at-risk-scheduling-bonus)
4. [Campaign Workflow](#campaign-workflow)
5. [Data Structure](#data-structure)
6. [Payment Tracking](#payment-tracking)
7. [Activity Tracking](#activity-tracking)
8. [Invoice Management](#invoice-management)
9. [Client Portal Integration](#client-portal-integration)
10. [API Reference](#api-reference)

---

## Billing Models

### 1. Activity Billing (Upfront)
**Billed upfront based on expected campaign activities**

- Charged at campaign creation/approval
- Based on planned outreach quantities
- Payment required before campaign execution
- Includes discount capability

### 2. At-Risk Scheduling Bonus (Monthly)
**Performance-based billing for successful meeting scheduling**

- Billed monthly after meetings are scheduled
- $50 per successfully scheduled meeting
- Maximum cap set per campaign
- Separate invoice and payment tracking

---

## Activity Pricing

### Email Outreach
**Flexible Pricing: $1.50 + $0.25 per follow-up**
- 1st email: $1.50 (required)
- Follow-up emails: $0.25 each
- **Fully Customizable**: 1-10 emails per contact

**Pricing Examples:**
- 1 email: $1.50 per contact
- 2 emails: $1.75 per contact ($1.50 + $0.25)
- 3 emails: $2.00 per contact ($1.50 + $0.50)
- 4 emails: $2.25 per contact ($1.50 + $0.75)
- 5 emails: $2.50 per contact ($1.50 + $1.00)
- 10 emails: $3.75 per contact ($1.50 + $2.25)

### LinkedIn Outreach
**Fixed Package: $2.00 per contact (2 messages)**
- Connection request message
- Follow-up message OR post engagement
- **Non-divisible**: Full $2.00 charged even if contact doesn't connect
- Includes post scanning and engagement attempts

### Phone Outreach
**Flexible Pricing: $2.15 + $1.50 per follow-up**
- 1st call: $2.15 (required)
- Follow-up calls: $1.50 each
- **Fully Customizable**: 1-10 calls per contact

**Pricing Examples:**
- 1 call per contact: $2.15 per contact
- 2 calls per contact: $3.65 per contact ($2.15 + $1.50)
- 3 calls per contact: $5.15 per contact (standard)
- 4 calls per contact: $6.65 per contact ($2.15 + $4.50)
- 5 calls per contact: $8.15 per contact ($2.15 + $6.00)
- 10 calls per contact: $15.65 per contact ($2.15 + $13.50)

### Data & Research Costs
**Custom Pricing: Variable dollar amount**
- **Flexible Cost**: Any dollar amount for research work
- **Descriptive**: Includes description field for research type
- **Examples**:
  - Data acquisition: $500
  - List building: $250
  - Market research: $1,000
  - Contact verification: $150
- **Billing**: Added to upfront campaign costs

---

## At-Risk Scheduling Bonus

### Structure
- **Rate**: $50 per scheduled meeting
- **Billing Cycle**: Monthly (end of month)
- **Maximum Cap**: Set per campaign (e.g., $500 = max 10 meetings)
- **Qualification**: Successfully scheduled meetings only

### Example
```
Campaign: "Q1 Healthcare IT Outreach"
Max At-Risk: $1,000 (20 meetings maximum)

January Results:
- 3 meetings scheduled = $150 billed
- Remaining cap: $850

February Results:
- 7 meetings scheduled = $350 billed
- Remaining cap: $500

March Results:
- 12 meetings scheduled = $500 billed (capped)
- 2 meetings over cap = $0 (no additional billing)
```

---

## Campaign Workflow

### 1. Campaign Creation
```
1. Select client from CLEmail customerList
2. Configure activities (Email/LinkedIn/Phone)
3. Set quantities and custom options
4. Apply discounts if applicable
5. Set at-risk maximum amount
6. Calculate total upfront billing
7. Save as "draft" status
```

### 2. Campaign Approval
```
1. Admin reviews campaign details
2. Client approval process (future feature)
3. Admin enters approver name and confirms
4. Status changes to "approved"
5. Approval data recorded:
   - approvedBy: admin email
   - approvedByName: typed full name
   - approvedAt: timestamp
```

### 3. Billing & Payment
```
Upfront Billing:
1. Invoice generated for approved campaigns
2. Payment tracking (paid/unpaid)
3. Invoice status tracking (sent/not sent)

At-Risk Billing:
1. Monthly activity recording
2. Meeting count verification
3. At-risk invoice generation
4. Separate payment tracking
```

---

## Data Structure

### Firebase Realtime Database: `HealthcareITDatabase`

```json
{
  "campaigns": {
    "campaign_1640995200000": {
      "name": "Q1 2024 Healthcare IT Outreach",
      "clientId": "mentavi_health",
      "description": "Targeting healthcare IT decision makers",
      "status": "approved",
      "createdAt": "2024-01-01T10:00:00.000Z",
      "updatedAt": "2024-01-01T14:30:00.000Z",
      "approvedBy": "admin@healthluminate.com",
      "approvedByName": "John Smith",
      "approvedAt": "2024-01-01T14:30:00.000Z",
      
      "activities": {
        "email": {
          "enabled": true,
          "quantity": 500,
          "emailCount": 4
        },
        "linkedin": {
          "enabled": true,
          "quantity": 200
        },
        "phone": {
          "enabled": true,
          "contacts": 100,
          "callsPerContact": 3,
          "totalCalls": 300
        }
      },
      
      "research": {
        "cost": 750.00,
        "description": "Healthcare IT decision maker data acquisition and list building"
      },
      
      "billing": {
        "emailTotal": 1125.00,
        "linkedinTotal": 400.00,
        "phoneTotal": 515.00,
        "researchTotal": 750.00,
        "subtotal": 2790.00,
        "discount": 125.00,
        "totalUpfront": 2665.00,
        "maxAtRisk": 1000.00,
        
        "paid": true,
        "paidAt": "2024-01-05T09:15:00.000Z",
        "invoiceSent": true,
        "invoiceSentAt": "2024-01-02T08:00:00.000Z",
        
        "atRiskPaid": false,
        "atRiskPaidAt": null,
        "atRiskInvoiceSent": false,
        "atRiskInvoiceSentAt": null
      },
      
      "monthlyActivities": {
        "2024-01": {
          "month": "2024-01",
          "emailsSent": 125,
          "linkedinMessages": 45,
          "callsMade": 0,
          "meetingsScheduled": 3,
          "recordedAt": "2024-02-01T10:00:00.000Z",
          "recordedBy": "admin@healthluminate.com"
        },
        "2024-02": {
          "month": "2024-02",
          "emailsSent": 150,
          "linkedinMessages": 62,
          "callsMade": 0,
          "meetingsScheduled": 5,
          "recordedAt": "2024-03-01T10:00:00.000Z",
          "recordedBy": "admin@healthluminate.com"
        }
      }
    }
  }
}
```

---

## Payment Tracking

### Upfront Payment Fields
```javascript
billing: {
  paid: boolean,           // Payment received status
  paidAt: ISO timestamp,   // When payment was received
  invoiceSent: boolean,    // Invoice sent status
  invoiceSentAt: ISO timestamp // When invoice was sent
}
```

### At-Risk Payment Fields
```javascript
billing: {
  atRiskPaid: boolean,           // At-risk payment received
  atRiskPaidAt: ISO timestamp,   // When at-risk payment received
  atRiskInvoiceSent: boolean,    // At-risk invoice sent status
  atRiskInvoiceSentAt: ISO timestamp // When at-risk invoice sent
}
```

### Payment Status Flow
```
1. Campaign Approved → Generate Upfront Invoice
2. invoiceSent: true → Invoice sent to client
3. paid: true → Payment received and recorded
4. Monthly activities recorded → Calculate at-risk amount
5. atRiskInvoiceSent: true → At-risk invoice sent
6. atRiskPaid: true → At-risk payment received
```

---

## Activity Tracking

### Monthly Activity Structure
```javascript
monthlyActivities: {
  "YYYY-MM": {
    month: "YYYY-MM",
    emailsSent: number,        // Actual emails sent
    linkedinMessages: number,  // Actual LinkedIn messages sent
    callsMade: number,         // Actual phone calls made
    meetingsScheduled: number, // Meetings successfully scheduled
    recordedAt: ISO timestamp, // When activity was recorded
    recordedBy: string        // Admin who recorded the activity
  }
}
```

### Activity Recording Process
```
1. Admin accesses campaign details
2. Clicks "Add Activity" button
3. Selects month (defaults to current)
4. Enters actual activity numbers
5. System calculates at-risk billing based on meetings
6. Activity saved with admin audit trail
```

### At-Risk Calculation Example
```javascript
// Campaign with $1,000 max at-risk
const maxAtRisk = 1000;
const meetingRate = 50;
const maxMeetings = maxAtRisk / meetingRate; // 20 meetings

// January: 3 meetings scheduled
const januaryBilling = Math.min(3 * 50, 1000); // $150

// February: 5 meetings scheduled  
const februaryBilling = Math.min(5 * 50, 1000 - 150); // $250

// March: 15 meetings scheduled
const marchBilling = Math.min(15 * 50, 1000 - 150 - 250); // $600 (capped)
```

---

## Invoice Management

### Invoice Types
1. **Upfront Invoice**: Generated when campaign is approved
2. **At-Risk Invoice**: Generated monthly based on meeting results

### Invoice Status Tracking
- `invoiceSent`: Boolean flag for upfront invoice
- `invoiceSentAt`: Timestamp when upfront invoice was sent
- `atRiskInvoiceSent`: Boolean flag for at-risk invoice
- `atRiskInvoiceSentAt`: Timestamp when at-risk invoice was sent

### Invoice Workflow
```
Upfront Invoice:
1. Campaign approved → invoiceSent: false
2. Admin marks invoice as sent → invoiceSent: true, invoiceSentAt: timestamp
3. Payment received → paid: true, paidAt: timestamp

At-Risk Invoice:
1. Monthly activities recorded with meetings
2. At-risk amount calculated
3. Admin marks at-risk invoice as sent → atRiskInvoiceSent: true
4. At-risk payment received → atRiskPaid: true
```

---

## Client Portal Integration

### Future Implementation
The billing system is designed to support client portal integration:

1. **Campaign Approval**: Clients can view and approve campaigns
2. **Billing Transparency**: Clients see detailed cost breakdowns
3. **Activity Visibility**: Clients track campaign progress
4. **Invoice Access**: Clients download invoices and track payments

### Client Portal Data Access
```javascript
// Client-specific campaign filtering
const clientCampaigns = campaigns.filter(c => c.clientId === clientId);

// Client billing summary
const clientBilling = {
  totalUpfront: sum(campaigns.map(c => c.billing.totalUpfront)),
  totalAtRisk: sum(campaigns.map(c => c.billing.maxAtRisk)),
  totalPaid: sum(campaigns.filter(c => c.billing.paid).map(c => c.billing.totalUpfront))
};
```

---

## API Reference

### Campaign Management Functions

#### Create Campaign
```javascript
async function createCampaign(campaignData) {
  const docId = `campaign_${Date.now()}`;
  const campaignRef = ref(window.billingDB, `campaigns/${docId}`);
  await set(campaignRef, {
    ...campaignData,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}
```

#### Approve Campaign
```javascript
async function approveCampaign(campaignId, approverEmail, approverName) {
  const campaignRef = ref(window.billingDB, `campaigns/${campaignId}`);
  await update(campaignRef, {
    status: 'approved',
    approvedBy: approverEmail,
    approvedByName: approverName,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}
```

#### Record Monthly Activity
```javascript
async function recordMonthlyActivity(campaignId, month, activityData) {
  const activityRef = ref(window.billingDB, `campaigns/${campaignId}/monthlyActivities/${month}`);
  await set(activityRef, {
    ...activityData,
    month: month,
    recordedAt: new Date().toISOString(),
    recordedBy: currentUser.email
  });
}
```

#### Mark Payment Received
```javascript
async function markPaymentReceived(campaignId, paymentType = 'upfront') {
  const campaignRef = ref(window.billingDB, `campaigns/${campaignId}`);
  const updates = { updatedAt: new Date().toISOString() };
  
  if (paymentType === 'upfront') {
    updates['billing.paid'] = true;
    updates['billing.paidAt'] = new Date().toISOString();
  } else {
    updates['billing.atRiskPaid'] = true;
    updates['billing.atRiskPaidAt'] = new Date().toISOString();
  }
  
  await update(campaignRef, updates);
}
```

---

## Database Configuration

### Firebase Projects Used

1. **HealthcareITDatabase** (Primary billing data)
   - Project ID: `healthcareitdatabase`
   - Database URL: `https://healthcareitdatabase-default-rtdb.firebaseio.com`
   - Collections: `campaigns/`

2. **CLEmail** (Client data)
   - Project ID: `clemail`
   - Database URL: `https://clemail-default-rtdb.firebaseio.com`
   - Collections: `customerList/`

3. **HealthLuminate** (Authentication)
   - Project ID: Main authentication system
   - Used for user authentication and authorization

---

## Security & Access Control

### Admin Access Requirements
- Email domain: `healthluminate.com` or `careluminate.com`
- Firebase authentication required
- Folder-based permissions system

### Audit Trail
All campaign modifications include:
- `updatedAt`: Timestamp of last modification
- `recordedBy`: Email of user making changes
- Action-specific timestamps (approvedAt, paidAt, etc.)

---

## Pricing Examples

### Example 1: Email-Only Campaign
```
Client: Mentavi Health
Activities: 1,000 email contacts (4 emails each)
Calculation: 1,000 × $2.25 = $2,250
Discount: $250
Total Upfront: $2,000
At-Risk Max: $500 (10 meetings)
```

### Example 2: Multi-Channel Campaign with Research
```
Client: Regional Hospital System
Activities: 
- 500 email contacts (4 emails) = $1,125
- 200 LinkedIn contacts (2 messages) = $400  
- 100 phone contacts (3 calls each) = $515
Research: Data acquisition = $750
Subtotal: $2,790
Discount: $125
Total Upfront: $2,665
At-Risk Max: $1,000 (20 meetings)
```

### Example 3: Custom Email Campaign
```
Client: Small Practice
Activities: 300 email contacts (1 email only)
Calculation: 300 × $1.50 = $450
Research: Contact verification = $150
Subtotal: $600
Discount: $0
Total Upfront: $600
At-Risk Max: $200 (4 meetings)
```

### Example 4: High-Touch Phone Campaign
```
Client: Enterprise Health System
Activities: 
- 200 email contacts (6 emails) = $750 (200 × $3.00)
- 50 LinkedIn contacts (2 messages) = $100
- 75 phone contacts (5 calls each) = $611.25 (75 × $8.15)
Research: Executive list building = $1,200
Subtotal: $2,661.25
Discount: $661.25
Total Upfront: $2,000
At-Risk Max: $2,500 (50 meetings)
```

### Example 5: Minimal Touch Campaign
```
Client: Startup Health Tech
Activities: 
- 1,000 email contacts (2 emails) = $1,750 (1,000 × $1.75)
- 100 LinkedIn contacts (2 messages) = $200
Research: Industry contact database = $300
Subtotal: $2,250
Discount: $0
Total Upfront: $2,250
At-Risk Max: $750 (15 meetings)
```

---

## Reporting & Analytics

### Key Metrics Tracked
- Total campaign value (upfront + at-risk)
- Payment status and timing
- Activity completion rates
- Meeting scheduling success
- Client-specific billing summaries

### Future Reporting Features
- Monthly billing reports
- Client performance analytics
- Activity ROI calculations
- Payment aging reports
- Campaign success metrics

---

## Troubleshooting

### Common Issues

#### Campaign Not Saving
- Check Firebase permissions
- Verify all required fields are filled
- Ensure user has admin access

#### Activity Tracking Not Working
- Confirm campaign is in "approved" status
- Verify month format (YYYY-MM)
- Check Firebase database rules

#### Payment Status Not Updating
- Ensure proper campaign ID is used
- Verify Firebase connection
- Check for JavaScript errors in console

---

## Version History

- **v1.0** (January 2024): Initial billing structure implementation
- **v1.1** (January 2024): Added at-risk billing and activity tracking
- **v1.2** (January 2024): Enhanced invoice management and audit trail

---

## Support

For technical support or questions about the billing structure:
- Email: support@healthluminate.com
- Internal Documentation: `/crm/billing_records.html`
- Firebase Console: [HealthcareITDatabase](https://console.firebase.google.com)

---

*This document is maintained by the HealthLuminate development team and should be updated whenever billing structure changes are implemented.*
