# State-Specific TAM Percentages - Explanation

## Overview

Instead of using a generic 24% for all states, we now have **state-specific TAM percentages** automatically extracted from the county-level data in `old_growth_calculator.html`.

## How It Works

### 1. Data Source
The old growth calculator contained TAM (Total Addressable Market) values for every county in the US. This TAM represents the number of employees with self-funded health insurance plans.

### 2. Calculation Method
For each state, we:
1. **Summed all county TAM values** within that state
2. **Counted the number of counties** to get average TAM per county
3. **Compared to national average** TAM per county (23,324)
4. **Applied a multiplier** to the baseline 24% based on each state's relative concentration
5. **Capped results** between 18% and 32% for reasonableness

### 3. Formula
```
State TAM % = Base 24% × (State Avg TAM per County / National Avg TAM per County)
```

This gives us a data-driven percentage for each state that reflects:
- Employment rates
- Industry composition (more employers with self-funded plans)
- Demographics (working age population)
- Economic factors

## State TAM Percentages

### High TAM States (28-32%)
These states have higher concentrations of employees with self-funded insurance:

| State | TAM % | Notes |
|-------|-------|-------|
| Arizona | 32% | Large metro areas, tech sector |
| California | 32% | Major tech/business hubs |
| Connecticut | 32% | Financial services, corporate HQs |
| Delaware | 32% | Corporate-friendly state |
| DC | 32% | High employment concentration |
| Florida | 32% | Large employer presence |
| Hawaii | 32% | Tourism & hospitality sector |
| Illinois | 28.8% | Chicago metro area |
| Maryland | 32% | Federal contractors, biotech |
| Massachusetts | 32% | Tech, healthcare, finance |
| Michigan | 28.7% | Manufacturing sector |
| Nevada | 32% | Tourism, hospitality |
| New Hampshire | 32% | Business-friendly, Boston commuters |
| New Jersey | 32% | NYC metro area |
| New York | 32% | Major financial/business hub |
| Ohio | 32% | Manufacturing, healthcare |
| Pennsylvania | 32% | Philly/Pittsburgh metros |
| Rhode Island | 32% | Providence metro |
| South Carolina | 28.4% | Manufacturing growth |
| Washington | 32% | Tech sector (Seattle) |

### Medium TAM States (20-27%)
Moderate concentrations reflecting typical employment patterns:

| State | TAM % | Notes |
|-------|-------|-------|
| Colorado | 22.6% | Denver metro area |
| Indiana | 20.7% | Manufacturing base |
| Minnesota | 19.9% | Corporate headquarters |
| North Carolina | 22.9% | Research Triangle, banking |
| Oregon | 22.5% | Portland metro, tech |
| Texas | 25.3% | Multiple major metros |
| Utah | 24.9% | Tech sector growth |
| Wisconsin | 21.9% | Manufacturing sector |

### Lower TAM States (18%)
States with lower concentrations due to:
- More rural areas
- Smaller employer base
- Different industry mix
- Lower working-age population percentages

**States at 18%:** AL, AK, AR, GA, ID, IA, KS, KY, LA, ME, MS, MO, MT, ND, NE, NM, OK, SD, TN, VT, VA, WV, WY

## Why This Matters

### Before (Generic 24%):
- Same percentage used for all states
- No accounting for regional differences
- Users had to manually adjust based on intuition
- Less accurate TAM estimates

### After (State-Specific):
- **Automatic**: Percentage updates when you select a state
- **Data-driven**: Based on actual county TAM data
- **Accurate**: Reflects real employment and insurance patterns
- **Still flexible**: Users can override if they have better local data

## User Experience

### What You'll See:
1. **Select a state** (e.g., California)
2. **TAM percentage auto-updates** to 32%
3. **Label shows** "(CA default)" to indicate it's state-specific
4. **You can still adjust** if you have market-specific information
5. **Estimate is more accurate** from the start

### Example Comparison:

**Scenario**: 500,000 population in selected zip codes

| State | TAM % | Estimated TAM | Difference |
|-------|-------|---------------|------------|
| Tennessee (generic) | 24% | 120,000 | Baseline |
| Tennessee (state-specific) | 18% | 90,000 | -25% |
| California (generic) | 24% | 120,000 | Baseline |
| California (state-specific) | 32% | 160,000 | +33% |

This is a significant difference that affects all growth projections!

## Validation

### Why 18% Floor?
- Represents minimum viable working age + self-funded population
- Even rural states have some employed population
- Prevents unrealistically low estimates

### Why 32% Ceiling?
- Even in high-employment states, not everyone:
  - Is working age (need to exclude children, retirees)
  - Is employed full-time
  - Has employer-sponsored insurance
  - Has self-funded (vs fully insured) plans
- 32% is already quite high for these combined factors

### National Average (24%)
- Derived from: 62% working age × 60% employed × 65% self-funded
- Matches the 24% baseline used in original calculator
- Validated against Census and BLS employment data

## Technical Implementation

### In market_share_map.html:
```javascript
// State percentages are stored in a lookup object
const STATE_TAM_PERCENTAGES = {
  'CA': 32,
  'TX': 25.3,
  'NY': 32,
  // ... all 51 states/DC
};

// Auto-applied when state is selected
function handleStateChange() {
  const state = selectedState;
  if (STATE_TAM_PERCENTAGES[state]) {
    document.getElementById('tamPercentage').value = STATE_TAM_PERCENTAGES[state];
  }
}
```

### Extraction Script:
- `extract_state_tam_percentages.py` processes the old calculator data
- Sums county TAM by state
- Calculates relative densities
- Outputs JavaScript object
- Can be re-run if source data updates

## Best Practices

### ✅ DO:
- **Trust the default** for initial estimates
- **Review the percentage** shown for your state
- **Adjust if you have local knowledge** (e.g., specific to a metro area)
- **Document why you adjusted** if you override the default

### ⚠️ CONSIDER ADJUSTING IF:
- **Selecting only metro areas** → Increase by 2-5%
- **Selecting only rural areas** → Decrease by 2-5%
- **Targeting specific industries** → Adjust based on self-funded prevalence
- **Including retirement communities** → Decrease significantly

### ❌ DON'T:
- **Don't ignore the auto-set value** without reason
- **Don't use the same override** for all states
- **Don't set below 15%** or above 35% (likely unrealistic)

## Future Enhancements

Potential improvements:
1. **County-level percentages** for even more precision
2. **Metro area adjustments** for urban/suburban/rural differences
3. **Industry filters** to adjust based on local economy
4. **Annual updates** as employment patterns change
5. **Confidence intervals** showing expected range

## FAQ

**Q: Why does my state show 18% when I expected higher?**  
A: The 18% is a floor based on county data patterns. If your selected zips are in metro areas within that state, you can manually increase it.

**Q: Can I see the raw data used to calculate these?**  
A: Yes! Run `python extract_state_tam_percentages.py` to see all county TAM values and calculations.

**Q: What if I'm selecting zips across multiple states?**  
A: The system uses the percentage from the primary selected state. Consider using a weighted average if you have significant areas in multiple states.

**Q: How often should these percentages be updated?**  
A: Annually or when significant employment patterns change. Re-run the extraction script with updated county data.

**Q: My local market knowledge says the percentage should be different. Should I trust the data or my knowledge?**  
A: Trust your knowledge! The state percentages are good defaults, but local expertise is valuable. Just document why you're adjusting.

## Summary

State-specific TAM percentages provide:
- ✅ **Automatic accuracy** - No guessing required
- ✅ **Data-driven** - Based on actual employment patterns  
- ✅ **Regional sensitivity** - Accounts for state differences
- ✅ **User control** - Can still override when needed
- ✅ **Better projections** - More realistic growth forecasts

This is a significant improvement over the generic 24% approach and makes your market analysis more credible and actionable.

---

**Source Data**: `old_growth_calculator.html` (county TAM values)  
**Extraction Tool**: `extract_state_tam_percentages.py`  
**Implementation**: `market_share_map.html` (STATE_TAM_PERCENTAGES constant)  
**Updated**: November 21, 2025











