# Growth Calculator Integration - Summary

## Overview
Successfully merged the S-curve growth calculator functionality from `old_growth_calculator.html` into `market_share_map.html`. The calculator now estimates Total Addressable Market (TAM) from zip code population data and generates growth forecasts.

## What Was Added

### 1. **New Section in Right Sidebar**
Added a "Growth Forecast Calculator" section at the bottom of the right sidebar with:
- TAM estimation controls
- Growth parameter inputs
- S-curve growth chart
- Detailed forecast table

### 2. **TAM Estimation Bridge**
Created a configurable percentage-based bridge between zip code population and TAM:
- **State-Specific Percentages**: Automatically extracted from county TAM data (18-32%)
- **Auto-updates** when you select a state
- Examples:
  - High TAM states (CA, NY, FL, MA): 32%
  - Medium TAM states (TX, CO, NC): 22-25%
  - Lower TAM states (rural/agricultural): 18%
- Formula: `TAM = Population × State TAM %`
- Users can adjust if they have specific market knowledge
- See `STATE_TAM_PERCENTAGES_EXPLAINED.md` for full details

### 3. **Growth Parameters**
Three key inputs for modeling growth:
- **Runway (Years)**: 3-20 years, default 10
- **Market Penetration Goal (%)**: 1-100%, default 15%
- **Retention Rate (%)**: 50-99%, default 80%

### 4. **Three Growth Scenarios**
Calculates three forecasts automatically:
- **Target Growth**: Based on user's goal parameters
- **High Estimate**: 33% higher penetration + 5% better retention
- **Low Estimate**: 33% lower penetration - 5% worse retention

### 5. **S-Curve Logic**
Implemented the same logistic growth function from the old calculator:
```
logisticGrowth(t, L, k, x0) = L / (1 + e^(-k(t - x0)))
```
Where:
- L = maximum population (TAM × penetration goal)
- k = growth rate (based on inflection point)
- t = time (year)
- x0 = midpoint of runway

Also includes retention modeling:
- Tracks lost customers over time
- Applies 80% recovery factor to churn
- Adjusts growth curve accordingly

## How It Works

### User Flow:
1. **Select State** → Choose a state from dropdown
2. **Select Zip Codes** → Use any selection method:
   - Click individual zips
   - Draw rectangle
   - Upload zip list
   - Select all in view
3. **Review Population** → See total population in metrics
4. **Adjust TAM %** → Fine-tune working age & self-funded percentage
5. **Set Parameters** → Configure runway, penetration goal, retention
6. **Calculate** → Click "Calculate Growth" button
7. **Analyze Results** → View chart and detailed year-by-year table

### Technical Integration:
- Growth calculator automatically pulls population from selected zips
- TAM estimate updates dynamically as zips are selected/deselected
- Chart uses Chart.js (already loaded for market share chart)
- No external dependencies added
- Fully responsive and matches existing design

## Key Differences from Old Calculator

| Feature | Old Calculator | New Integrated Version |
|---------|---------------|------------------------|
| Geographic Level | County | Zip Code |
| TAM Source | Pre-calculated values | Estimated from population |
| Data Selection | Multi-select dropdowns | Interactive map selection |
| Integration | Standalone page | Part of market analysis |
| Population Data | Not visible | Shows total population |
| Flexibility | Fixed TAM values | Adjustable TAM percentage |

## Benefits of Integration

1. **Single Workflow**: No need to switch between tools
2. **Visual Selection**: Map-based zip selection is more intuitive
3. **Granular Control**: Zip-level is more precise than county-level
4. **Context Aware**: See health system market share alongside growth
5. **Flexible Estimation**: Adjust TAM calculation for different markets
6. **Data Consistency**: Uses same population data as market share analysis

## Usage Tips

### For Different Markets:
- **Rural areas**: May want lower TAM % (18-22%) due to demographics
- **Urban/suburban**: Standard 24% is usually accurate
- **Tech hubs**: Could use higher % (26-30%) due to high employment

### Interpretation:
- **Year 1** is deliberately set at 50% of Year 2 to model initial ramp-up
- **S-curve shape** reflects typical product adoption:
  - Slow initial growth (awareness phase)
  - Rapid middle growth (adoption phase)
  - Plateau near end (market saturation)
- **Retention impact** is compounded over years in the model

### Best Practices:
1. Start with a realistic market penetration goal (10-20%)
2. Use conservative retention estimates (75-85%)
3. Consider regional factors when setting TAM percentage
4. Compare scenarios to understand risk/opportunity range
5. Use with market share data to identify competitive positioning

## Technical Notes

### Functions Added:
- `logisticGrowth(t, L, k, x0)` - Core S-curve calculation
- `calculateForecast(runway, max, retention, inflection)` - Full forecast with retention
- `updateGrowthForecast()` - Main calculation trigger
- `updateGrowthChart(target, high, low)` - Chart rendering
- `updateGrowthTable(target, high, low)` - Table rendering
- `updateTAMEstimate()` - Dynamic TAM calculation

### Style Considerations:
- Matches existing design system
- Uses same color palette (primary, secondary, accent)
- Consistent typography and spacing
- Responsive layout
- Accessible form controls

## Future Enhancements (Optional)

Potential additions if needed:
1. Save growth forecasts with views
2. Export growth data to CSV/Excel
3. Add seasonality factors
4. Include churn rate modeling by cohort
5. Add competitive pressure adjustments
6. Show growth as overlay on map
7. Calculate ROI projections
8. Add confidence intervals

## Testing Checklist

- [x] TAM calculates correctly from population
- [x] All three scenarios generate properly
- [x] Chart displays with correct data
- [x] Table shows all years accurately
- [x] Updates when zip selection changes
- [x] No console errors
- [x] No linting errors
- [x] Responsive on different screen sizes
- [x] Integration with existing features works

---

**Date**: November 21, 2025
**Modified File**: `market_share_map.html`
**Lines Added**: ~280
**Original Reference**: `old_growth_calculator.html`

