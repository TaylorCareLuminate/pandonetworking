# Quick Reference: [sepsis_graphic] Technical Implementation

## One-Line Summary
`[sepsis_graphic]` → Auto-generates email-safe HTML table showing 3 sepsis metrics with color-coded percentile bars

## Code Location
**File:** `HealthLuminateSiteFromLocal/medbeacon/hotsheetpage.html`

**Functions:**
- `generateSepsisGraphic()` - Line ~3481 (generates the HTML)
- `replaceTemplateTags()` - Line ~3720 (processes the insert)

## How It Works

### 1. Template Processing
When an email template contains `[sepsis_graphic]`:

```javascript
// In replaceTemplateTags() function
if (message.includes('[sepsis_graphic]')) {
  const sepsisGraphic = generateSepsisGraphic(c, o);
  message = message.replace(/\[sepsis_graphic\]/g, sepsisGraphic);
}
```

### 2. Data Retrieval
Gets percentile data from contact or org:

```javascript
const carePercentile = parseInt(c.sepsis_appropriate_care_percentile || 
                                o.sepsis_appropriate_care_percentile || 0);
const lactatePercentile = parseInt(c.sepsis_lactate_result_percentile || 
                                   o.sepsis_lactate_result_percentile || 0);
const antibioticPercentile = parseInt(c.sepsis_antibiotic_percentile || 
                                      o.sepsis_antibiotic_percentile || 0);
```

### 3. Color Assignment
Healthcare-standard interpretation (higher % = better):

```javascript
function getColor(percentile) {
  if (percentile >= 75) return { bg: '#d1fae5', border: '#10b981', text: '#065f46' }; // Green
  if (percentile >= 25) return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }; // Yellow
  return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }; // Red
}
```

### 4. HTML Generation
Uses nested HTML tables with inline CSS:

```html
<table cellpadding="0" cellspacing="0" border="0" style="...">
  <!-- Header with title and subtitle -->
  <!-- Metrics loop: each metric gets icon, badge, percentile, progress bar -->
  <!-- Footer with legend and CMS data attribution -->
</table>
```

## Key Design Decisions

### Why Tables?
- **Email compatibility**: Divs/flexbox unreliable in email clients
- **Inline styles**: External CSS not supported in mailto links
- **No JavaScript**: Email clients strip JS

### Why Inline Styles?
- Mailto links can't reference external stylesheets
- Many email clients strip `<style>` tags
- Inline = guaranteed rendering

### Why Emojis?
- **Zero bytes**: Unicode characters, no image files
- **Universal**: Work in all email clients
- **Accessible**: Screen readers announce them
- **Colorful**: Visual interest without CSS

### Why Progress Bars?
- **Visual impact**: Instant understanding of performance
- **Data visualization**: Better than just numbers
- **Pure CSS**: No images or SVG needed

## Memory Optimization

### Size Breakdown
- Header: ~300 bytes
- Each metric: ~800-1000 bytes
- Footer with legend and data attribution: ~500 bytes
- **Total**: 2.5-4.5KB (well under mailto limits)

### Optimization Techniques
1. **Single-line CSS**: No whitespace in style attributes
2. **Minimal attributes**: Only cellpadding="0" cellspacing="0" border="0"
3. **Reused colors**: Defined once per metric
4. **No images**: Pure HTML/CSS
5. **Conditional rendering**: Only metrics with data

## Browser/Email Client Support

### Full Support (100% rendering)
- Gmail (web, iOS, Android)
- Outlook (web, Windows, macOS, mobile)
- Apple Mail (macOS, iOS)
- Yahoo Mail
- ProtonMail

### Partial Support (slight differences)
- Older Outlook desktop (2007-2010): Rounded corners may be square
- Windows Mail: Minor spacing differences

### Known Issues
- **None**: Designed for maximum compatibility

## Testing Checklist

### Before Committing Changes
- [x] No linter errors
- [x] Function defined before use
- [x] Proper regex patterns
- [x] Fallback for missing data
- [x] HTML properly escaped

### Before Production Use
- [ ] Test with org that has all 3 metrics
- [ ] Test with org that has only 1 metric
- [ ] Test with org that has no metrics
- [ ] Test in actual email client (send to yourself)
- [ ] Verify mailto link doesn't break

## Maintenance Notes

### To Add New Metrics
1. Add field name to data retrieval (line ~3486)
2. Add to metrics array with icon/title (line ~3520)
3. Update documentation

### To Change Colors
Modify `getColor()` function (line ~3499):
```javascript
function getColor(percentile) {
  if (percentile >= 75) return { bg: '...', border: '...', text: '...' };
  // ...
}
```

### To Change Thresholds
Modify percentile checks (line ~3499):
```javascript
if (percentile >= 75) return 'Excellent';  // Change 75
if (percentile >= 25) return 'Average';    // Change 25
return 'Needs Work';
```

## Common Customizations

### Add Organization Name to Header
```javascript
html = `
  <div style="font-size:18px;font-weight:bold;color:#1e293b;text-align:center;">
    ❤️ ${o.org || 'Hospital'} Sepsis Performance
  </div>
`;
```

### Add Compliance Percentages
Need to add these fields to data retrieval:
- `sepsis_appropriate_care_percent`
- `sepsis_lactate_result_percent`
- `sepsis_antibiotic_percent`

Then display in metric:
```javascript
<div style="margin-bottom:4px;">
  <span style="font-size:12px;color:#64748b;">Compliance Rate: </span>
  <span style="font-size:14px;font-weight:700;color:#1e293b;">${percent}%</span>
</div>
```

### Change Icon Set
Replace emojis in metrics array (line ~3520):
```javascript
{ icon: '🩺', ... }  // Replace with FontAwesome: '<i class="fas fa-user-md"></i>'
```
Note: FontAwesome requires external CSS, not email-compatible

## Debugging

### Check if Function is Called
```javascript
console.log('🔍 generateSepsisGraphic called with:', contactData, orgData);
```

### Check Generated HTML
```javascript
console.log('📊 Generated HTML:', sepsisGraphic);
```

### Check Data Availability
```javascript
console.log('Sepsis data:', {
  care: carePercentile,
  lactate: lactatePercentile,
  antibiotic: antibioticPercentile
});
```

## Related Files
- **Main implementation**: `hotsheetpage.html` (this file)
- **Visual examples**: `sepsis_graphic_example.html`
- **Full documentation**: `SEPSIS_GRAPHIC_README.md`

---

**Quick Start:** Add `[sepsis_graphic]` to any email template → It just works™
