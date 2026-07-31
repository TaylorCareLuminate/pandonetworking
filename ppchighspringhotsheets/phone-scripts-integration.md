# Phone Scripts Integration Guide

This guide explains how to add phone scripts functionality to the hotsheet prospecting page.

## Files Created

1. **phone-scripts.js** - JavaScript functionality for phone scripts
2. **phone-scripts.css** - CSS styling for the phone scripts panel
3. **phone-scripts-panel.html** - HTML structure for the side panel

## Integration Steps

### 1. Add CSS to hotsheetsprospecting.html

Add this line in the `<head>` section:
```html
<link rel="stylesheet" href="phone-scripts.css">
```

### 2. Add HTML Panel

Add the contents of `phone-scripts-panel.html` before the closing `</body>` tag in `hotsheetsprospecting.html`.

### 3. Add JavaScript

Add this line before the closing `</body>` tag:
```html
<script src="phone-scripts.js"></script>
```

### 4. Update Phone Button Click Handler

Find the phone call button in the contact rendering section and update it to:
```html
<a href="tel:${contact.phone}" class="call-btn" title="Call ${contact.phone}" 
   onclick="event.preventDefault(); openPhoneScripts(${JSON.stringify(contact).replace(/"/g, '&quot;')}, ${JSON.stringify(orgData).replace(/"/g, '&quot;')}, '${contact.phone}'); trackPhoneCall('${org.id}', '${contact.email}', '${escapedContactName}', '${contact.phone}')">
  <i class="fas fa-phone-alt"></i> Call
</a>
```

### 5. Update Message Templates Loading

In the `loadMessageTemplates()` function, add phone scripts loading:

```javascript
// Add to messageTemplates object declaration
let messageTemplates = {
  linkedin: [],
  email: [],
  phone: []  // Add this line
};

// Add to the template loading section
if (data.phone && Array.isArray(data.phone)) {
  messageTemplates.phone = data.phone.filter(msg => msg && msg.content && msg.content.trim());
  console.log('📞 Phone templates loaded:', messageTemplates.phone.length);
} else if (data.phone && typeof data.phone === 'object') {
  messageTemplates.phone = Object.values(data.phone).filter(msg => msg && msg.content && msg.content.trim());
  console.log('📞 Phone templates loaded from object:', messageTemplates.phone.length);
}
```

## Features

### ✅ **Core Functionality**
- **Side Panel**: Slides in from the right when phone numbers are clicked
- **Script Selection**: 6 script tabs with easy switching
- **Memory**: Remembers last used script for next call
- **Template Processing**: Replaces [First Name], [Organization Name], etc.
- **Copy to Clipboard**: One-click script copying
- **Call Tracking**: Mark calls as completed

### ✅ **User Experience**
- **Responsive Design**: Works on desktop and mobile
- **Keyboard Support**: ESC key closes panel
- **Visual Feedback**: Active script highlighting
- **Error Handling**: Graceful fallbacks for missing scripts

### ✅ **Integration**
- **Firebase Integration**: Loads scripts from message_content.html data
- **Existing Functions**: Uses existing template replacement logic
- **Activity Tracking**: Integrates with existing CRM functions

## Usage

1. **Configure Scripts**: Users set up phone scripts in `message_content.html`
2. **Click Phone Number**: Opens scripts panel with contact info
3. **Select Script**: Choose from available scripts (remembers last used)
4. **Use Script**: Copy to clipboard or reference while calling
5. **Mark Complete**: Track call completion in CRM

## Technical Notes

- **CSS Variables**: Uses existing color scheme variables
- **Global Functions**: All functions are available globally
- **Error Handling**: Graceful degradation if functions are missing
- **Performance**: Lazy loading and efficient DOM updates 