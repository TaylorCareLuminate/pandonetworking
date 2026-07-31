# Growth Calculator - Quick Reference Card

## 🎯 What Changed

Your market share map now has **state-specific TAM percentages** that auto-fill when you select a state!

## 📊 State TAM Percentages (Quick Lookup)

### High Opportunity States (32%)
AZ, CA, CT, DE, DC, FL, HI, MA, MD, NV, NH, NJ, NY, OH, PA, RI, WA

### Strong States (25-29%)
IL (28.8%), MI (28.7%), SC (28.4%), TX (25.3%)

### Growing States (20-24%)
CO (22.6%), NC (22.9%), OR (22.5%), IN (20.7%), WI (21.9%), MN (19.9%), UT (24.9%)

### Standard States (18%)
All others: AL, AK, AR, GA, ID, IA, KS, KY, LA, ME, MS, MO, MT, ND, NE, NM, OK, SD, TN, VT, VA, WV, WY

## 🚀 Quick Start

```
1. Select a state → TAM % auto-fills ✨
2. Select zip codes → Population calculates
3. Review TAM estimate → Adjust if needed
4. Set runway & goals → Click "Calculate Growth"
5. View 3 scenarios → Make decisions 🎉
```

## 💡 When to Adjust TAM %

### Increase (+2-5%) if:
- ✅ Selecting only metro areas
- ✅ Targeting tech/finance sectors
- ✅ High-employment districts

### Decrease (-2-5%) if:
- ⚠️ Selecting rural areas only
- ⚠️ Retirement communities included
- ⚠️ Agricultural regions

### Keep Default if:
- 👍 Mixed urban/suburban/rural
- 👍 Representative of state overall
- 👍 No specific industry focus

## 📈 Growth Calculator Defaults

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| TAM % | State-specific | 18-32% | Auto-fills by state |
| Runway | 10 years | 3-20 | Forecast period |
| Penetration | 15% | 1-100% | Your market share goal |
| Retention | 80% | 50-99% | Annual customer retention |

## 🎨 Three Scenarios Explained

**Target** = Your baseline plan  
**High** = Target + 33% penetration + 5% retention  
**Low** = Target - 33% penetration - 5% retention  

Use High for capacity planning, Low for risk analysis.

## 🔍 Common Questions

**Q: Why did my TAM % change?**  
A: It auto-updates when you select a different state. Each state has its own percentage based on employment patterns.

**Q: Should I use the default %?**  
A: Yes, unless you have specific market knowledge. The defaults are data-driven.

**Q: How accurate are these percentages?**  
A: Calculated from 3,144 counties across all states. Very reliable as state averages.

**Q: Can I save my custom TAM %?**  
A: Yes! When you save a view, your TAM % is preserved (planned for future version).

**Q: What if I select zips in multiple states?**  
A: Use the primary state's %, or calculate a weighted average manually.

## 📁 Full Documentation

- **IMPLEMENTATION_SUMMARY.md** - Complete overview
- **STATE_TAM_PERCENTAGES_EXPLAINED.md** - Detailed methodology  
- **USAGE_GUIDE.md** - Step-by-step instructions
- **GROWTH_CALCULATOR_INTEGRATION.md** - Technical details

## 🎓 Formula Reference

```
TAM = Population × State TAM %

Growth Year N = f(TAM, Penetration, Retention, Runway)
  where f = logistic S-curve function

High Scenario TAM = TAM × (1 + 0.33)
Low Scenario TAM = TAM × (1 - 0.33)
```

## ✅ Checklist for Analysis

Before presenting your forecast:
- [ ] Verified state TAM % is reasonable
- [ ] Selected representative zip codes
- [ ] Set realistic penetration goal (10-25%)
- [ ] Used conservative retention (75-85%)
- [ ] Reviewed all three scenarios
- [ ] Checked year-by-year progression
- [ ] Considered competitive landscape

## 🆘 Troubleshooting

**TAM seems too high**
→ Check if you're in a high-TAM state (32%). Adjust down for rural selections.

**TAM seems too low**  
→ Check if you're in an 18% state. Adjust up for metro selections.

**Growth curve too steep**  
→ Increase runway or decrease penetration goal.

**Growth curve too flat**  
→ Decrease runway or increase penetration goal.

**Can't find Calculate button**  
→ Scroll down in the right sidebar - it's in the "Growth Forecast Calculator" section.

## 📞 Need Help?

1. Read `USAGE_GUIDE.md` for detailed examples
2. Check `STATE_TAM_PERCENTAGES_EXPLAINED.md` for your state
3. Review `IMPLEMENTATION_SUMMARY.md` for methodology
4. Contact support if you find data issues

---

**Pro Tip**: The state-specific TAM % is your secret weapon for accurate forecasts. Trust the defaults, but don't be afraid to adjust for your specific market!

**Last Updated**: November 21, 2025  
**Version**: 2.0 (with state-specific TAM percentages)











