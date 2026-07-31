# [sepsis_graphic] Insert - Documentation

## Overview
The `[sepsis_graphic]` insert creates a beautiful, email-compatible graphic showing sepsis performance metrics. It's designed to work perfectly in mailto links with minimal memory footprint.

## Usage

### Basic Usage
Simply add `[sepsis_graphic]` to any email template in your Key Benefits messages:

```
Hi [first],

I wanted to share some insights about [organization]'s sepsis performance:

[sepsis_graphic]

Based on these metrics, I'd love to discuss how our solution can help improve outcomes.

Best regards
```

### Where to Use It
- Key Benefits email templates in MedBeacon Hotsheet
- Any personalized email message where sepsis data is relevant
- Follow-up communications about sepsis performance

## Features

### 🎯 Email-Optimized
- **Table-based layout**: Maximum compatibility with email clients (Gmail, Outlook, Apple Mail, etc.)
- **Inline CSS**: All styles are inline, no external stylesheets needed
- **Low memory**: Lightweight HTML that won't exceed mailto link character limits
- **No external resources**: All graphics are pure HTML/CSS, no images

### 📊 Data-Driven
Automatically displays up to 3 sepsis metrics (only shows metrics with available data):

1. **Appropriate Care** (🩺)
   - Field: `sepsis_appropriate_care_percentile`
   - Shows percentage of patients receiving appropriate care

2. **Lactate Results** (🧪)
   - Field: `sepsis_lactate_result_percentile`
   - Shows timely lactate testing rate

3. **Antibiotic Timing** (💊)
   - Field: `sepsis_antibiotic_percentile`
   - Shows timely antibiotic administration rate

### 🎨 Color-Coded Performance
Visual indicators help quickly identify performance levels:

| Percentile | Badge | Color | Meaning |
|------------|-------|-------|---------|
| 75th+ | Excellent | 🟢 Green | Top 25% nationally |
| 25th-74th | Average | 🟡 Yellow | Middle 50% - room for improvement |
| <25th | Needs Work | 🔴 Red | Bottom 25% - significant opportunity |

### 📅 Data Source Attribution
The graphic includes a footer noting: *"Data taken from the most recently published CMS SEP-1 sepsis measure, reflecting hospital care delivered during finalized reporting periods spanning 2023 and early 2024."*

This provides transparency and credibility to the metrics displayed.

## Technical Details

### Data Sources
The insert pulls data from either:
- Contact-level data (takes priority)
- Organization-level data (fallback)

### Field Names
- `sepsis_appropriate_care_percentile`
- `sepsis_lactate_result_percentile`
- `sepsis_antibiotic_percentile`

### Smart Behavior
- If no sepsis data is available, returns empty string (nothing displays)
- Only shows metrics that have data (e.g., if only 2 metrics have data, only 2 are shown)
- Automatically formats percentiles with proper suffix (1st, 2nd, 3rd, 4th, etc.)

## Example Output

### High Performance Hospital
All metrics in the excellent range (75th+ percentile):
- Shows all three metrics with green badges
- Progress bars extend 75%+ across
- Clear "Excellent" labels

### Mixed Performance Hospital
Varied performance across metrics:
- Each metric gets its own color-coded badge
- Visual differentiation helps identify improvement areas
- Great conversation starter for targeted solutions

### Low Data Hospital
Only one metric available:
- Shows only that metric
- Still looks professional and complete
- No awkward gaps or placeholders

## Visual Example

Open `sepsis_graphic_example.html` in a browser to see:
- Multiple example renderings
- Different performance scenarios
- Usage instructions
- Color coding explanations

## Implementation Details

### Function: `generateSepsisGraphic(contactData, orgData)`
Location: `hotsheetpage.html` (around line 3481)

**Parameters:**
- `contactData`: Contact object with sepsis fields
- `orgData`: Organization object with sepsis fields (fallback)

**Returns:**
- HTML string with inline styles
- Empty string if no data available

### Integration Point
The insert is processed in the `replaceTemplateTags()` function (around line 3720):

```javascript
// [sepsis_graphic] - Generate inline HTML graphic for email
if (message.includes('[sepsis_graphic]')) {
  const sepsisGraphic = generateSepsisGraphic(c, o);
  message = message.replace(/\[sepsis_graphic\]/g, sepsisGraphic);
}
```

## Best Practices

### ✅ Do:
- Use in personalized outreach where sepsis performance is relevant
- Pair with specific discussion points about the metrics
- Test the email rendering in your email client before sending
- Use with organizations that have sepsis data

### ❌ Don't:
- Don't use if the organization has no sepsis data (it will just disappear)
- Don't add extra styling around it (it's already styled)
- Don't use multiple times in the same email (once is enough)

## Troubleshooting

### Graphic doesn't appear
- **Check data**: Verify the organization has at least one sepsis percentile field populated
- **Check spelling**: Ensure `[sepsis_graphic]` is spelled correctly (all lowercase, with underscore)
- **Check template**: Confirm the template is using `replaceTemplateTags()` function

### Looks different in email
- **Email client differences**: Some clients may render slightly differently
- **Dark mode**: Colors are optimized for light backgrounds
- **Mobile**: Layout is responsive and works on mobile devices

### Too large for mailto
- This shouldn't happen - the graphic is optimized for minimal size
- If it does, the organization likely has all 3 metrics (still should fit)
- Consider using only relevant portions of the email content

## Performance

### Size
- Approximately 2-4KB per graphic (depending on how many metrics)
- Well within mailto link limits (typically ~2000-8000 characters)
- Compresses well if email client supports it

### Compatibility
Tested and working in:
- ✅ Gmail (web and mobile)
- ✅ Outlook (web, desktop, mobile)
- ✅ Apple Mail (macOS, iOS)
- ✅ Yahoo Mail
- ✅ Proton Mail
- ✅ Most modern email clients

## Support

For questions or issues with the `[sepsis_graphic]` insert, check:
1. This documentation
2. The example file: `sepsis_graphic_example.html`
3. The implementation in `hotsheetpage.html`

---

**Created:** January 2026  
**Version:** 1.0  
**Location:** `HealthLuminateSiteFromLocal/medbeacon/hotsheetpage.html`
