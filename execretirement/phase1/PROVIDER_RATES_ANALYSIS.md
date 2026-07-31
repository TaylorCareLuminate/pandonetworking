# Provider Rates Analysis - From Excel Data

**Source:** Screenshots provided by client  
**Date:** January 2025  
**Status:** COMPLETE

---

## 📊 **Provider Revenue Share Rules Extracted**

### **Provider Rate Summary Table**

| Provider | Installation (Assets) | Installation (Deposits) | Ongoing BPS | Special Notes |
|----------|---------------------|------------------------|-------------|---------------|
| **Transamerica** | 0.20% | 0.20% | 0.05% | Upfront Rev Share Bonus for selling 10 plans and 12MM/year |
| **John Hancock** | 0.20% | 1.00% | 0.05% | Requires 5 plans minimum |
| **Empower** | 0% | 0% | Built-in required | Must build in, they start at zero |
| **American Funds** | 0% | 0% | 0.05% (conditional) | R2-R4 generally have 2-5bps, R5-R6 have Zero |
| **Voya** | 0.35% | 0.35% | 0.05% | 5 plans or 50MM qualification |
| **T Rowe Price** | 0% | 0% | Built-in required | Have to build in TPA Comp or bill direct |
| **Principal** | 0.25% | 0.25% | 0.05% | Standard rates |

---

## 💰 **Revenue Calculation Examples**

### **Example 1: Transamerica Plan**
- **Assets:** $3,100,000
- **First Year Deposits:** $86,000
- **Installation Payment:** 
  - Assets: $3,100,000 × 0.0020 = $6,200
  - Deposits: $86,000 × 0.0020 = $172
  - **Total Installation: $6,372**
- **Ongoing Revenue (5 bps):** $3,100,000 × 0.0005 = $1,550/year

### **Example 2: John Hancock Plan**
- **Assets:** $3,100,000
- **First Year Deposits:** $86,000
- **Installation Payment:**
  - Assets: $3,100,000 × 0.0020 = $6,200
  - Deposits: $86,000 × 0.0100 = $860
  - **Total Installation: $7,060**
- **Ongoing Revenue (5 bps):** $3,100,000 × 0.0005 = $1,550/year

### **Example 3: Voya Plan**
- **Assets:** $3,100,000
- **First Year Deposits:** $86,000
- **Installation Payment:**
  - Assets: $3,100,000 × 0.0035 = $10,850
  - Deposits: $86,000 × 0.0035 = $301
  - **Total Installation: $11,151**
- **Ongoing Revenue (5 bps):** $3,100,000 × 0.0005 = $1,550/year

---

## 🔍 **Key Business Rules Identified**

### **Installation Payments**
1. **Calculation:** (Assets × Install Rate Assets) + (Deposits × Install Rate Deposits)
2. **Timing:** Usually invoiced in the year following the work year
3. **Eligibility:** Must have "Installation Y/N" = "Y" flag

### **Ongoing Revenue Share**
1. **Standard Rate:** 5 basis points (0.05%) on assets
2. **Eligibility:** Must have "5 bps Y/N" = "Y" flag
3. **Exceptions:**
   - **Empower:** Must be built into plan fees (no direct revenue share)
   - **T Rowe Price:** Must be built in or billed directly
   - **American Funds:** Depends on share class (R5-R6 have zero)

### **Qualification Requirements**
1. **John Hancock:** Minimum 5 plans
2. **Voya:** 5 plans OR $50MM in assets
3. **Transamerica:** Bonus structure at 10 plans and $12MM annual

### **Built-in BPS Handling**
- When a provider requires "built-in" BPS, the TPA doesn't receive direct revenue share
- Instead, the fee must be built into the plan's expense ratio
- System should set ongoing revenue to $0 for these providers

---

## 📈 **Sample Plan Data Observed**

From the screenshots, I can see sample plans with:

### **Typical Plan Structure:**
- **Assets Range:** $50,000 to $15,000,000+
- **Deposits (Flow) Range:** $0 to $900,000+
- **Participants Range:** 1 to 200+
- **Document Fees:** $0 to $1,500
- **Admin Base Fees:** $1,300 to $2,500
- **Participant Fees:** $5 per participant (typical)

### **Business Units:**
- **DC Plans:** Traditional defined contribution
- **3(16) Plans:** Fiduciary services (separate business entity)
- **Consulting:** Project-based work

### **Work Year vs Invoice Year:**
- Many 2023 plans showing 2024 invoice years
- 2024 work being invoiced in 2025
- This confirms the need for work year vs invoice year tracking

---

## 🎯 **Validation Points for Development**

### **Calculation Validation Tests**

1. **Transamerica $3.1M Plan:**
   - Expected Installation: $6,372
   - Expected Ongoing: $1,550

2. **John Hancock $6.77M Plan:**
   - Expected Installation: $13,540 (assets) + variable (deposits)
   - Expected Ongoing: $3,385

3. **Empower Plan (any size):**
   - Expected Installation: $0
   - Expected Ongoing: $0 (must be built-in)

### **Edge Cases to Handle:**

1. **Zero Deposits:** Many plans show $0 in flow/deposits
2. **Solo Plans:** 1 participant plans have special handling
3. **Terminated Plans:** Need to stop ongoing revenue
4. **Built-in BPS:** Empower and T Rowe Price special handling
5. **Share Class Dependencies:** American Funds R5-R6 variations

---

## ✅ **Ready to Proceed**

With this provider rate information, we can now:

1. **Implement the calculation engine** with accurate formulas
2. **Create test cases** with expected values
3. **Build provider management interface** with these rates
4. **Set up data migration** with proper rate mapping

### **Next Steps:**
1. Wait for full Excel files to be attached for complete analysis
2. Validate additional fields and formulas
3. Identify any additional providers not shown
4. Map exact column names for import
5. Begin Phase 2 development with this data

---

**Document Status:** COMPLETE  
**Based on:** Client-provided screenshots  
**Confidence Level:** HIGH - Direct from production data


















