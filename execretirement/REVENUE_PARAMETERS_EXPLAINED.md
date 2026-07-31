# Revenue Calculation - Parameters Explained

## Where Each Parameter Comes From

### 🎯 **The Formula**

```
Revenue = Installation Payment + Ongoing BPS Revenue + Annual Fees
```

---

## 📊 **Installation Payment Calculation**

### **Formula:**
```
Installation = (Assets × Asset_Rate) + (Deposits × Deposit_Rate)
```

### **Parameters Used:**

| Parameter | Source | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Assets** | 📁 Plan Record (database) | $50,000 | Plan assets from database |
| **Asset_Rate** | ⚙️ Record Keeper Rules (hardcoded) | 0.0020 (0.20%) | Transamerica's rate on assets |
| **Deposits** | 📁 Plan Record (database) | $50,000 | First year deposits from database |
| **Deposit_Rate** | ⚙️ Record Keeper Rules (hardcoded) | 0.0020 (0.20%) | Transamerica's rate on deposits |

### **Example Calculation (Transamerica):**
```
Installation = ($50,000 × 0.0020) + ($50,000 × 0.0020)
             = ($50,000 × 0.20%) + ($50,000 × 0.20%)
             = $100 + $100
             = $200
```

---

## 📈 **Ongoing BPS Revenue Calculation**

### **Formula:**
```
Ongoing = Assets × Ongoing_Rate (only if bpsEligible = true)
```

### **Parameters Used:**

| Parameter | Source | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Assets** | 📁 Plan Record (database) | $50,000 | Plan assets from database |
| **Ongoing_Rate** | ⚙️ Record Keeper Rules (hardcoded) | 0.0005 (0.05% or 5 bps) | Transamerica's ongoing rate |
| **bpsEligible** | 📁 Plan Record (database) | true | Whether plan qualifies for BPS |

### **Example Calculation (Transamerica):**
```
Ongoing = $50,000 × 0.0005
        = $50,000 × 0.05%
        = $50,000 × (5 bps ÷ 10,000)
        = $25
```

### **Additional Built-In BPS:**
```
Additional = Assets × (AdditionalBPS ÷ 10,000)
```

| Parameter | Source | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Assets** | 📁 Plan Record (database) | $5,000,000 | Plan assets |
| **AdditionalBPS** | 📁 Plan Record (database) | 10 (bps) | Extra BPS built into fees |

**Example:**
```
Additional = $5,000,000 × (10 ÷ 10,000)
           = $5,000,000 × 0.0010
           = $5,000,000 × 0.10%
           = $5,000
```

---

## 💰 **Annual Fees Calculation**

### **Formula:**
```
Annual Fees = Admin + Audit + Consulting + Participant_Total
```

### **Parameters Used:**

| Parameter | Source | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Admin** | 📁 Plan Record (database) | $1,600 | Annual admin fee |
| **Audit** | 📁 Plan Record (database) | $0 | Annual audit fee |
| **Consulting** | 📁 Plan Record (database) | $0 | Consulting fee |
| **Participant_Total** | 📁 Plan Record (database) | $250 | Total participant fees (10 × $25) |

### **Example Calculation:**
```
Annual Fees = $1,600 + $0 + $0 + $250
            = $1,850
```

**Note:** These are stored values from the database. No calculation from record keeper rates.

---

## 🎯 **Complete Example: 45th Property and Power LLC**

### **Plan Record Data (from Firebase):**
```javascript
{
  planName: "45th Property and Power LLC",
  recordKeeperName: "Transamerica",  // ← TELLS US WHICH RATES TO USE
  assets: 50000,                     // ← USED IN CALCULATION
  deposits: 50000,                   // ← USED IN CALCULATION
  participants: 10,                  // ← USED FOR PARTICIPANT FEES
  bpsEligible: true,                 // ← DETERMINES IF ONGOING APPLIES
  fees: {
    admin: 1600,                     // ← USED DIRECTLY
    audit: 0,
    participantTotal: 250
  }
}
```

### **Record Keeper Rules (from revenue-calculator.js):**
```javascript
'Transamerica': {
  installRateAssets: 0.0020,         // ← 0.20% RATE FOR ASSETS
  installRateDeposits: 0.0020,       // ← 0.20% RATE FOR DEPOSITS
  ongoingRateAssets: 0.0005,         // ← 0.05% (5 bps) RATE FOR ONGOING
  ongoingRequiresBuiltIn: false      // ← PAYS DIRECTLY
}
```

### **Step-by-Step Calculation:**

**1. Installation Payment:**
```
Installation = (Assets from DB × Rate from Rules) + (Deposits from DB × Rate from Rules)
             = ($50,000 × 0.0020) + ($50,000 × 0.0020)
             = $100 + $100
             = $200
```

**2. Ongoing BPS:**
```
Check: bpsEligible from DB = true ✓
Check: ongoingRequiresBuiltIn from Rules = false ✓ (direct payment)

Ongoing = Assets from DB × Rate from Rules
        = $50,000 × 0.0005
        = $25
```

**3. Annual Fees:**
```
Annual Fees = fees from DB
            = $1,600 (admin) + $0 (audit) + $250 (participant)
            = $1,850
```

**4. Total Revenue:**
```
Total = Installation + Ongoing + Annual Fees
      = $200 + $25 + $1,850
      = $2,075
```

---

## 📋 **Summary: Two Sources of Data**

### **📁 From Plan Records (Database) - THE NUMBERS:**
- `assets` - Dollar amount of plan assets
- `deposits` - Dollar amount of first year deposits
- `participants` - Number of participants
- `bpsEligible` - Whether plan qualifies (true/false)
- `fees.admin`, `fees.audit`, etc. - Dollar amounts of fees
- `recordKeeperName` - Which record keeper (tells us which rates to look up)

### **⚙️ From Record Keeper Rules (Hardcoded) - THE RATES:**
- `installRateAssets` - Percentage rate for installation on assets (e.g., 0.0020 = 0.20%)
- `installRateDeposits` - Percentage rate for installation on deposits (e.g., 0.0020 = 0.20%)
- `ongoingRateAssets` - Percentage rate for ongoing BPS (e.g., 0.0005 = 0.05% = 5 bps)
- `ongoingRequiresBuiltIn` - Whether rate must be built-in (true/false)

### **🔗 How They Connect:**
1. Get `recordKeeperName` from plan record (e.g., "Transamerica")
2. Look up that record keeper's rates in the calculator
3. Apply those rates to the plan's dollar amounts
4. Add the plan's stored fees
5. Return total revenue

---

## ⚠️ **Providers That Must Build In**

Some providers don't pay direct installation or ongoing revenue:

| Provider | Installation | Ongoing | Why |
|----------|-------------|---------|-----|
| Empower | $0 | Must build in | No direct payments |
| T Rowe Price | $0 | Must build in | No direct payments |
| Lincoln | $0 | Must build in | No direct payments |
| Fidelity | $0 | Must build in | No direct payments |
| Plan Premier | $0 | Must build in | No direct payments |

For these providers:
- Installation = $0
- Ongoing = $0
- **You must bill the client directly** or build fees into the plan

---

## 🎓 **Key Takeaway**

**The calculation uses BOTH:**
1. **Your plan data** (assets, deposits, fees) from the database
2. **Record keeper rates** (percentages) from the calculator rules

**The formula is:**
```
Revenue = (DB_Assets × RK_AssetRate) + (DB_Deposits × RK_DepositRate) + 
          (DB_Assets × RK_OngoingRate) + DB_Fees
```

Where:
- `DB_` = From Database (plan records)
- `RK_` = From Record Keeper Rules (hardcoded rates)
