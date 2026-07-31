# Growth Calculator Usage Guide

## Quick Start

### Step 1: Select Your Market Area
Choose one of these methods to select zip codes:

**Option A: Upload Zip List** (Fastest for known territories)
1. Click "Upload Zip List" button
2. Paste your zip codes (comma-separated or one per line)
3. Click "Select These Zips"

**Option B: Draw Rectangle** (Best for geographic areas)
1. Click "Draw Rectangle" button
2. Click and drag on the map to select an area
3. All zips in the rectangle are selected

**Option C: Select All in View** (Quick for visible area)
1. Zoom/pan the map to show desired area
2. Click "Select All in View"

**Option D: Individual Selection** (Precise control)
- Click any zip code on the map to see details
- Ctrl+Click to deselect

### Step 2: Review Your Selection
Look at the metrics in the right sidebar:
- **Total Population**: Sum of all selected zips
- **Zip Codes Selected**: Count of selected areas

### Step 3: Configure TAM Estimation
In the "Growth Forecast Calculator" section:

**Working Age & Self-Funded (%)** - Default: 24%
- This converts total population to potential market
- Adjust based on your market characteristics:
  - Lower (18-22%) for retirement communities, rural areas
  - Standard (23-25%) for typical markets  
  - Higher (26-30%) for employment hubs, tech centers

**What This Means:**
If you select zips with 100,000 population at 24% = 24,000 potential customers

### Step 4: Set Growth Parameters

**Runway (Years)** - Default: 10
- How many years to forecast
- Typical: 5-15 years
- Longer runway = slower initial growth (wider S-curve)

**Market Penetration Goal (%)** - Default: 15%
- What % of TAM do you want to capture?
- Realistic goals: 10-25% 
- Aggressive: 30-50%
- This is your TARGET scenario

**Retention Rate (%)** - Default: 80%
- Annual customer retention
- Industry average: 75-85%
- Best-in-class: 90%+
- Lower retention = need more new customers to grow

### Step 5: Calculate
Click the **"Calculate Growth"** button

### Step 6: Analyze Results

#### The Chart Shows:
- **Target (Green Solid Line)**: Your goal scenario
- **High (Blue Dashed)**: Optimistic scenario (+33% penetration, +5% retention)
- **Low (Red Dashed)**: Conservative scenario (-33% penetration, -5% retention)

#### S-Curve Characteristics:
- **Years 1-3**: Slow growth (awareness, early adopters)
- **Years 4-7**: Rapid growth (mainstream adoption)
- **Years 8+**: Slowing growth (market saturation)

#### The Table Shows:
Year-by-year breakdown for all three scenarios
- Review specific year targets
- Identify key milestones
- Plan resource needs

## Real-World Examples

### Example 1: Conservative Growth in Rural Market
**Selection**: 50 rural zip codes
**Population**: 150,000
**TAM %**: 20% (lower due to demographics)
**Estimated TAM**: 30,000

**Parameters**:
- Runway: 12 years (slower adoption)
- Penetration Goal: 12% 
- Retention: 78%

**Result**: Target of ~3,600 customers by Year 12

### Example 2: Aggressive Urban Expansion
**Selection**: 120 urban/suburban zips  
**Population**: 800,000
**TAM %**: 25%
**Estimated TAM**: 200,000

**Parameters**:
- Runway: 8 years (faster growth)
- Penetration Goal: 20%
- Retention: 82%

**Result**: Target of ~40,000 customers by Year 8

### Example 3: Tech Hub Opportunity
**Selection**: 30 zip codes in tech center
**Population**: 400,000
**TAM %**: 28% (higher employment rate)
**Estimated TAM**: 112,000

**Parameters**:
- Runway: 10 years
- Penetration Goal: 25%
- Retention: 85%

**Result**: Target of ~28,000 customers by Year 10

## Understanding the Numbers

### What is TAM?
**Total Addressable Market** = The maximum number of potential customers in your selected area who could buy your product.

We estimate this from population using:
```
TAM = Total Population × (Working Age % × Employed % × Self-Funded %)
```

Default breakdown:
- 62% are working age (18-64)
- 60% of working age are employed
- 65% have employer self-funded plans
- = 0.62 × 0.60 × 0.65 = **24%**

### Why Three Scenarios?

**Target**: Your goal based on realistic assumptions
- Use this for primary planning

**High**: What's possible if things go well
- Market responds better than expected
- Higher retention achieved
- Use for capacity planning

**Low**: Conservative case if challenges arise
- Slower adoption
- More churn
- Use for minimum viability analysis

The range helps you understand:
- Risk/opportunity spread
- Required resources
- Contingency planning needs

### Year 1 Starts at 50% of Year 2

This is intentional! It models:
- Product/service ramp-up time
- Initial sales cycle learning
- Limited marketing reach early on
- Typical new market entry pattern

Don't be alarmed by the lower Year 1 number - this is realistic.

## Tips for Different Use Cases

### For Strategic Planning:
1. Use multiple scenarios in different regions
2. Compare to current market share data
3. Identify which health systems to partner with
4. Set realistic resource allocation plans

### For Sales Territory Analysis:
1. Compare different territory options
2. Balance opportunity vs. competition
3. Set fair quotas based on TAM
4. Identify high-potential areas

### For Board Presentations:
1. Export PDF with map + growth chart
2. Show range (low/high) to demonstrate diligence
3. Explain TAM calculation methodology
4. Link to competitive market share data

### For Resource Planning:
1. Use High scenario for capacity planning
2. Use Target for hiring/budget plans  
3. Use Low for minimum revenue projections
4. Plan milestones at Year 3, 5, 7, 10

## Troubleshooting

### "Please select at least one zip code first"
→ You need to select zips on the map before calculating growth

### TAM seems too high/low
→ Adjust the "Working Age & Self-Funded %" based on your market knowledge

### Chart looks too steep/flat
→ Adjust runway (longer = flatter) and penetration goal

### Numbers don't match old calculator
→ Different geography level (zip vs county) and TAM estimation method

## Advanced: Adjusting TAM for Specific Markets

### Retirement Communities
- Working age: Lower (40-50%)
- Use TAM %: 18-20%

### College Towns  
- Many students (not employed full-time)
- Use TAM %: 20-22%

### Tech/Business Hubs
- High employment, good benefits
- Use TAM %: 26-30%

### Manufacturing Regions
- High self-funded employer plans
- Use TAM %: 25-28%

### Mixed Suburban
- Standard demographics
- Use TAM %: 23-25%

## Best Practices

✅ **DO**:
- Select contiguous geographic areas when possible
- Use conservative TAM estimates initially
- Compare scenarios before committing to plans
- Review health system market share alongside growth
- Save your views for future reference

❌ **DON'T**:
- Don't use unrealistic penetration goals (>50%)
- Don't forget about competition in the area
- Don't ignore retention rate importance
- Don't compare different TAM % scenarios directly
- Don't make decisions on a single scenario

## Questions?

**Q: How accurate is the TAM estimation?**
A: It's an estimate. The 24% default is based on national averages. Adjust for your specific market knowledge.

**Q: Should I use the same retention rate for all scenarios?**
A: The calculator automatically adjusts (Target uses your input, High adds +5%, Low subtracts -5%).

**Q: What if I want monthly forecasts instead of annual?**
A: The current model is designed for strategic annual planning. Contact dev team for monthly granularity.

**Q: Can I save my growth forecasts?**
A: Currently, save the View which includes your zip selection and parameters. Future versions may save the forecast itself.

**Q: How does this compare to the old county-based calculator?**
A: Zip-level is more granular and flexible. TAM is estimated rather than pre-calculated. Core growth logic is identical.

---

Need help? Check the integration docs: `GROWTH_CALCULATOR_INTEGRATION.md`











