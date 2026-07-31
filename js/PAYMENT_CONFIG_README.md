# Payment Configuration - Single Source of Truth

## Overview

**`payment-config.js`** is the centralized configuration file for all payment rates and Achievement Pool settings. This ensures consistency across all parts of your application.

## Files That Use This Configuration

1. **`crm/team-performance.html`** - Team Performance Dashboard (management view)
2. **`team/performance.html`** - Individual Agent Performance Page
3. **`team/call-performance-payments.html`** - Payment Documentation Page

## How to Update Payment Rates

### ⚠️ IMPORTANT: Update Only ONE File

To change payment rates, edit **ONLY** this file:
```
js/payment-config.js
```

Changes will automatically apply to all pages that use it.

### Example: Updating a Payment Rate

```javascript
// In js/payment-config.js, find the outcome and update the amount:
export const PAYMENT_STRUCTURE = {
    'Left Personalized Recorded Message': 0.75,  // Changed from 0.50 to 0.75
    'Spoke to Prospect - Declined Meeting': 2.00, // Changed from 1.50 to 2.00
    // ... other outcomes
};
```

### Example: Updating Achievement Pool Settings

```javascript
export const ACHIEVEMENT_POOL_CONFIG = {
    startingAmount: 50.00,  // Changed from 40.00 to 50.00
    tiers: [
        { minCalls: 1,  maxCalls: 20,  increment: 0.15 },  // Changed from 0.10
        { minCalls: 21, maxCalls: 40,  increment: 0.25 },  // Changed from 0.20
        // ... other tiers
    ]
};
```

## Adding New Call Outcomes

If you add a new call outcome type:

1. Add it to `PAYMENT_STRUCTURE` with its payment amount
2. If it should contribute to the Achievement Pool, add it to `QUALIFYING_OUTCOMES`
3. Update the documentation page (`team/call-performance-payments.html`)

Example:
```javascript
export const PAYMENT_STRUCTURE = {
    // ... existing outcomes
    'New Outcome Type': 1.25,  // Add new outcome here
};

export const QUALIFYING_OUTCOMES = [
    // ... existing outcomes
    'New Outcome Type',  // If it qualifies for pool, add here
];
```

## Testing Changes

After updating payment rates:

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Test on Team Performance Dashboard**: `crm/team-performance.html`
   - Click on an agent to see their detailed breakdown
   - Verify payment amounts are correct
3. **Test on Individual Performance Page**: `team/performance.html`
   - Check that earnings calculations are correct
4. **Update Documentation**: `team/call-performance-payments.html`
   - Manually update the HTML table to match new rates

## Functions Available

### `getPaymentForOutcome(outcome, poolAmount)`
Returns the payment amount for a specific outcome. Automatically adds Achievement Pool bonus for scheduled meetings.

### `calculateAchievementPool(qualifyingCallCount)`
Calculates the current Achievement Pool amount based on the number of qualifying calls.

### `isQualifyingOutcome(outcome)`
Returns true if the outcome contributes to the Achievement Pool.

## Troubleshooting

### "Unmatched outcomes" warnings in console

If you see warnings about unmatched outcomes, it means the database has outcome names that aren't in `PAYMENT_STRUCTURE`. Either:

1. Add the missing outcome to `PAYMENT_STRUCTURE`
2. Or, update the database to use the standard outcome names

### Payments showing $0.00

1. Check that the outcome name in the database **exactly matches** the key in `PAYMENT_STRUCTURE` (case-sensitive)
2. Check browser console for debugging messages
3. Verify the payment-config.js file is loading correctly

## Version History

- **2025-01-28**: Initial centralized configuration created
  - Starting pool: $40.00
  - Base meeting payment: $0.50
  - Declined meeting: $1.50

## Questions?

Contact the development team if you need to:
- Add new payment tiers
- Change the Achievement Pool calculation logic
- Integrate payment calculations with accounting software

