# Revenue Calculation Parameters

## How Revenue Calculations Work

The revenue calculation system uses **record keeper (provider) rules** to determine TPA compensation. Each provider has different rates and requirements.

---

## Data Flow

```
Plan Data (Firebase)
    ↓
    provider: "American Funds R3"
    assets: $5,000,000
    deposits: $500,000
    participants: 125
    bpsEligible: true
    ↓
Revenue Calculator
    ↓
    1. Normalize provider name ("American Funds R3" → "american funds")
    2. Look up provider rules
    3. Apply rates to calculate revenue
    ↓
Revenue Results
    - Installation Payment
    - Ongoing BPS Revenue
    - Annual Fees
    - Total Revenue
```

---

## Provider Rules (Record Keepers)

### Current Providers in System

| Provider | Installation (Assets) | Installation (Deposits) | Ongoing (BPS) | Notes |
|----------|----------------------|------------------------|---------------|-------|
| **Transamerica** | 0.20% | 0.20% | 0.05% (5 bps) | Rev share bonus available |
| **John Hancock** | 0.20% | 1.00% | 0.05% (5 bps) | Requires 5 plans |
| **Voya** | 0.35% | 0.35% | 0.05% (5 bps) | Requires 5 plans or $50MM |
| **Principal** | 0.25% | 0.25% | 0.05% (5 bps) | No qualification needed |
| **American Funds** | 0% | 0% | 0.05% (5 bps) | R2-R4 only (R5-R6 = $0) |
| **Empower** | 0% | 0% | Must build in | No direct revenue share |
| **T Rowe Price** | 0% | 0% | Must build in | Must build in or bill direct |
| **Lincoln** | 0% | 0% | Must build in | Must build in or bill direct |
| **Fidelity** | 0% | 0% | Must build in | Must build in or bill direct |
| **Plan Premier** | 0% | 0% | Must build in | Must build in or bill direct |

---

## Calculation Parameters

### 1. Installation Payment
**Formula:** `(Assets × InstallRateAssets) + (Deposits × InstallRateDeposits)`

**Parameters Used:**
- `plan.assets` - Plan assets in dollars
- `plan.deposits` - First year deposits (same as "flow")
- `plan.provider` - Record keeper name
- Provider's `installRateAssets` (from rules)
- Provider's `installRateDeposits` (from rules)

**Example (Transamerica):**
```
Assets: $5,000,000
Deposits: $500,000
Install Rate Assets: 0.0020 (0.20%)
Install Rate Deposits: 0.0020 (0.20%)

Installation = ($5,000,000 × 0.0020) + ($500,000 × 0.0020)
             = $10,000 + $1,000
             = $11,000
```

### 2. Ongoing BPS Revenue (5 Basis Points)
**Formula:** `Assets × OngoingRateAssets`

**Parameters Used:**
- `plan.assets` - Current plan assets
- `plan.bpsEligible` - Whether plan qualifies for BPS (true/false)
- `plan.provider` - Record keeper name
- Provider's `ongoingRateAssets` (typically 0.0005 = 0.05% = 5 bps)

**Example (Transamerica):**
```
Assets: $5,000,000
Ongoing Rate: 0.0005 (5 bps)
BPS Eligible: true

Ongoing = $5,000,000 × 0.0005
        = $2,500/year
```

**Note:** If provider requires "built-in" BPS, this returns $0 (you must bill it separately)

### 3. Additional Built-In BPS
**Formula:** `Assets × (AdditionalBps / 10000)`

**Parameters Used:**
- `plan.assets` - Current plan assets
- `plan.additionalBpsBuiltIn` - Additional basis points built into fee structure

**Example:**
```
Assets: $5,000,000
Additional BPS: 10 (10 basis points = 0.10%)

Additional = $5,000,000 × (10 / 10000)
           = $5,000,000 × 0.0010
           = $5,000/year
```

### 4. Annual Fees
**Formula:** Sum of all recurring fees

**Parameters Used:**
- `plan.fees.admin` or `plan.fees.annualAdmin` - Annual admin fee
- `plan.fees.audit` - Annual audit fee
- `plan.fees.consulting` - Consulting fee
- `plan.fees.participantTotal` - Total participant fees

**Example:**
```
Admin Fee: $1,600
Audit Fee: $500
Consulting: $0
Participant Total: $3,125 (125 participants × $25)

Annual Fees = $1,600 + $500 + $0 + $3,125
            = $5,225/year
```

---

## Provider Name Normalization

The system automatically normalizes provider names to match record keeper rules:

| Database Value | Normalized To | Why |
|---------------|---------------|-----|
| American Funds R3 | american funds | Strip share class |
| American Funds R5E | american funds | Strip share class |
| American Funds R6 | american funds | Strip share class |
| Hancock/Transamerica | john hancock | Use first provider |
| JH | john hancock | Common abbreviation |
| T. Rowe Price | t rowe price | Standardize name |
| Plan Premier | plan premier | Direct match |

---

## Total Revenue Calculation

**Formula:** `Installation + Ongoing + AdditionalBPS + AnnualFees`

**Complete Example (Transamerica Plan):**
```
Plan Assets: $5,000,000
First Year Deposits: $500,000
Participants: 125
BPS Eligible: Yes
Additional BPS: 10 (0.10%)

Installation:
  Assets:   $5,000,000 × 0.20% = $10,000
  Deposits:   $500,000 × 0.20% =  $1,000
  Total Installation:            $11,000

Ongoing BPS (5 bps):
  $5,000,000 × 0.05% =            $2,500

Additional Built-In BPS (10 bps):
  $5,000,000 × 0.10% =            $5,000

Annual Fees:
  Admin:                          $1,600
  Participant (125 × $25):        $3,125
  Audit:                            $500
  Total Annual Fees:              $5,225

TOTAL FIRST YEAR REVENUE:        $23,725
TOTAL RECURRING REVENUE:         $12,725/year
```

---

## Where Parameters Come From

### Database Fields (Firebase: `ers/revenue_plans`)

```javascript
{
  // Provider information
  provider: "Transamerica",              // → Used to lookup rates
  
  // Financial data
  assets: 5000000,                       // → Used in all calculations
  deposits: 500000,                      // → Used for installation
  participants: 125,                     // → Used for participant fees
  
  // Eligibility flags
  bpsEligible: true,                     // → Determines if ongoing applies
  eligibility: {
    installation: true,                  // → Can receive installation?
    ongoing: true,                       // → Can receive ongoing BPS?
    bps: true                           // → Same as bpsEligible
  },
  
  // Additional compensation
  additionalBpsBuiltIn: 10,              // → Extra BPS built into fees
  
  // Fee structure
  fees: {
    admin: 1600,                         // → Annual recurring
    audit: 500,                          // → Annual recurring
    participant: 25,                     // → Per participant rate
    participantTotal: 3125,              // → Total participant fees
    consulting: 0                        // → Usually one-time
  },
  
  // Override for manual entry
  installationPaymentAmount: 11000       // → If set, skips calculation
}
```

### Provider Rules (Hardcoded in `revenue-calculator.js`)

These rates are based on your agreements with each record keeper:

```javascript
'Transamerica': {
  installRateAssets: 0.0020,      // 0.20% on assets
  installRateDeposits: 0.0020,    // 0.20% on deposits
  ongoingRateAssets: 0.0005,      // 0.05% (5 bps) on assets
  ongoingRequiresBuiltIn: false,  // Direct pay (not built-in)
  qualificationNotes: 'None',
  notes: 'Upfront Rev Share Bonus for selling 10 plans and 12MM/year'
}
```

---

## Adjusting Rates

### To Change Record Keeper Rates:

1. Open `js/revenue-calculator.js`
2. Find the provider in the `rules` object
3. Update the rates:
   ```javascript
   'Transamerica': {
     installRateAssets: 0.0025,      // Change to 0.25%
     installRateDeposits: 0.0025,    // Change to 0.25%
     ongoingRateAssets: 0.0010,      // Change to 0.10% (10 bps)
     // ...
   }
   ```
4. Refresh any pages using the calculator

### To Add a New Provider:

```javascript
'New Provider Name': {
  installRateAssets: 0.0020,       // Installation rate on assets
  installRateDeposits: 0.0020,     // Installation rate on deposits
  ongoingRateAssets: 0.0005,       // Ongoing BPS rate (or null)
  ongoingRequiresBuiltIn: false,   // true if must be built-in
  qualificationNotes: 'Optional notes',
  notes: 'Optional additional info'
}
```

---

## Error Handling

If a provider is not found in the rules:
- A warning is logged to console
- The calculation returns $0 for that component
- The plan still displays (won't crash the page)

**Console Warning Example:**
```
⚠️ Provider not found in calculator: "Unknown Provider" (normalized: "unknown provider") - returning $0
```

---

## Files Involved

1. **`js/revenue-calculator.js`** - Contains all provider rules and calculation logic
2. **`revenue-review.html`** - Uses calculator to show client revenue
3. **`plan-revenue.html`** - Main plan management page with revenue calculations
4. **`revenue-dashboard.html`** - Dashboard showing total revenue across all plans
5. **`revenue-analytics.html`** - Detailed analytics and breakdowns
