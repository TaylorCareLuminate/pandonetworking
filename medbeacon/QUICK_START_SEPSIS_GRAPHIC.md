# Quick Start: Using [sepsis_graphic] in Message Builder

## Step-by-Step Guide

### 1. Open Message Builder
Navigate to: `medbeacon/message-builder.html`

### 2. Create Your Email Template
Choose any of the 15 email message slots.

### 3. Insert the Graphic
Click the `[sepsis_graphic]` button in the "Available Tags" section.

The tag will be inserted at your cursor position:

```
Hi [first],

I wanted to share [organization]'s sepsis performance data:

[sepsis_graphic]

Based on these metrics, I'd love to discuss improvement opportunities.

Best regards
```

### 4. Save Your Template
Click "Save All Messages" - your template is now saved with the `[sepsis_graphic]` tag.

### 5. Use in Hotsheet
1. Go to `hotsheetpage.html`
2. Select an organization with sepsis data
3. Choose a contact
4. Click "Use in Email" on your saved template
5. The `[sepsis_graphic]` tag automatically converts to a beautiful HTML graphic
6. Mailto link opens with the graphic embedded

## What Gets Generated

The tag `[sepsis_graphic]` becomes a complete, email-compatible HTML table showing:

### Header
- ❤️ Title: "Sepsis Performance Metrics"
- Subtitle: "National Percentile Rankings"

### Metrics (shows only available data)
- 🩺 **Appropriate Care** - with percentile rank and progress bar
- 🧪 **Lactate Results** - with percentile rank and progress bar  
- 💊 **Antibiotic Timing** - with percentile rank and progress bar

### Footer
- **Performance Guide**: Color legend (Green/Yellow/Red)
- **Data Attribution**: CMS SEP-1 citation with reporting periods

## Color Coding

Each metric gets automatically color-coded:
- **Green badge** (Excellent) - 75th percentile or higher
- **Yellow badge** (Average) - 25th to 74th percentile
- **Red badge** (Needs Work) - Below 25th percentile

## Example Templates

### Template 1: Data-First Approach
```
Hi [first],

I wanted to share [organization]'s current sepsis performance:

[sepsis_graphic]

The data shows specific areas where we could help improve outcomes. 
Would you be open to a brief conversation?

Best,
Your Name
```

### Template 2: Problem-Solution Approach
```
Hi [first],

Many health systems are focusing on sepsis care improvement. 
Here's how [organization] currently performs:

[sepsis_graphic]

We've helped similar organizations improve these metrics by 15-20%. 
Can we schedule 15 minutes to discuss?

Best,
Your Name
```

### Template 3: Follow-Up Approach
```
Hi [first],

Following up on our conversation about sepsis care at [organization]. 
Here's the performance data I mentioned:

[sepsis_graphic]

I'd love to walk you through how we've helped other systems in similar 
percentile ranges. Are you available next week?

Best,
Your Name
```

## Pro Tips

### ✅ Do:
- Place graphic in the middle of your email (after intro, before ask)
- Add context before the graphic ("Here's the data...")
- Reference the graphic in your ask ("Based on these metrics...")
- Test with an organization that has all 3 sepsis metrics

### ❌ Don't:
- Don't use with organizations lacking sepsis data (graphic won't appear)
- Don't use multiple times in same email (once is enough)
- Don't add extra formatting around it (it's pre-styled)
- Don't forget the data is from CMS (attribution is automatic)

## Troubleshooting

### Graphic doesn't appear in test email
**Solution:** Check that the organization has at least one sepsis percentile field populated.

### Tag shows up as text `[sepsis_graphic]` 
**Solution:** You're viewing it in message builder. It only converts to HTML when used in hotsheetpage.html with "Use in Email" button.

### Email is too long with graphic
**Solution:** The graphic is only 2.5-4.5KB. If mailto fails, shorten other parts of your email first.

### Want to customize the graphic
**Solution:** The graphic is auto-generated and can't be customized per-message. To change it globally, edit the `generateSepsisGraphic()` function in hotsheetpage.html.

## Data Source

All data comes from:
- **Source**: Centers for Medicare & Medicaid Services (CMS)
- **Measure**: SEP-1 (Severe Sepsis and Septic Shock: Management Bundle)
- **Periods**: 2023 and early 2024 finalized reporting periods
- **Fields Used**:
  - `sepsis_appropriate_care_percentile`
  - `sepsis_lactate_result_percentile`
  - `sepsis_antibiotic_percentile`

## Need Help?

- **Full Documentation**: `SEPSIS_GRAPHIC_README.md`
- **Technical Details**: `SEPSIS_GRAPHIC_TECHNICAL.md`
- **Visual Examples**: Open `sepsis_graphic_example.html` in browser
- **Update History**: `UPDATE_SUMMARY_SEPSIS_GRAPHIC.md`

---

**Created:** January 2026  
**Quick Start Version:** 1.0  
**Ready to use immediately!**
