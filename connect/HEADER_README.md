# HealthConnect Common Header

## Overview

The HealthConnect header provides a beautiful, consistent navigation experience across all LinkedIn connection management pages. It includes branding, navigation, and user authentication status.

## Features

✨ **Beautiful Design**
- Modern gradient background (LinkedIn blue to purple)
- Animated interactions and hover effects
- Fully responsive for mobile and desktop
- Uses "Connection People" image from webshapes

👤 **User Authentication**
- Shows logged-in user with personalized avatar
- Dropdown menu with account options
- Sign in button for logged-out users
- Integrates seamlessly with existing auth.js

🧭 **Navigation**
- Quick access to all HealthConnect pages:
  - About Me (LinkedIn profile builder)
  - My Leads (Lead management & categorization)
  - Push Contacts (HeyReach integration)
  - Review Queue (Connection approval)
  - Manage Data (LinkedIn data upload)
- Active page highlighting
- Mobile-friendly icon navigation

## Implementation

### Files

- `healthconnect-header.js` - The header component (automatically injected)

### Usage

Simply include the header script after `auth.js` in your HTML:

```html
<!-- Load auth.js first for authentication -->
<script src="../js/auth.js"></script>

<!-- Load HealthConnect common header -->
<script src="healthconnect-header.js"></script>
```

The header will automatically:
1. Inject its own styles (no CSS file needed)
2. Create and insert the header HTML at the top of the page
3. Connect to Firebase authentication
4. Update user status dynamically

### Pages Using This Header

✅ `about_me.html` - LinkedIn profile builder
✅ `my_leads.html` - Lead management & categorization
✅ `connect_push.html` - Push contacts to HeyReach
✅ `connect_review.html` - Review connection queue
✅ `manage_my_linkedin_data.html` - Upload LinkedIn data

## Customization

### Brand Configuration

Edit the `HEALTHCONNECT_CONFIG` object in `healthconnect-header.js`:

```javascript
const HEALTHCONNECT_CONFIG = {
    brandName: 'HealthConnect',
    brandColor: '#0077b5',
    accentColor: '#8b5cf6',
    navItems: [
        { label: 'About Me', href: 'about_me.html', icon: 'fa-user' },
        // ... add more navigation items
    ]
};
```

### Logo Image

The header uses: `../images/HealthLuminate-Bright.png`

To change the image, modify the `<img>` tag in the `createHeaderHTML()` function.

### Colors

The header uses CSS variables from the page's existing theme:
- `--primary: #0077b5` (LinkedIn blue)
- `--secondary: #0f172a` (Dark text)
- `--accent: #8b5cf6` (Purple)

## Responsive Design

📱 **Mobile (< 768px)**
- Header wraps to multiple lines
- Navigation shows icons only (labels hidden)
- User menu stays accessible in top-right

💻 **Tablet (< 1024px)**
- Slightly reduced spacing
- Smaller font sizes
- All features remain visible

🖥️ **Desktop (> 1024px)**
- Full layout with all text visible
- Optimal spacing and sizing
- Beautiful hover effects

## Integration with Auth.js

The header automatically integrates with the existing `auth.js` authentication system:

- Waits for `window.firebaseReady` promise
- Uses `window.getCurrentAuthState()` to check login status
- Listens for `onAuthStateChanged` events
- Displays user info from Firebase Auth

## User Menu Features

When logged in, users can access:
- 👤 **My Account** - Account settings
- 📬 **HeyReach Inbox** - View messages
- 🚪 **Sign Out** - Logout

The menu includes:
- Color-coded avatar based on email
- User's display name or formatted email
- Smooth dropdown animation
- Click-outside-to-close behavior

## Browser Support

✅ Modern browsers (Chrome, Firefox, Safari, Edge)
✅ Mobile browsers (iOS Safari, Chrome Mobile)
✅ Tablets and touch devices

Uses modern CSS features:
- Flexbox for layout
- CSS Grid (where appropriate)
- CSS Variables for theming
- Transforms and transitions for animations

## Troubleshooting

### Header not appearing?

1. Check browser console for errors
2. Ensure `auth.js` is loaded first
3. Verify the script path is correct
4. Check that Font Awesome is loaded (for icons)

### User info not showing?

1. Verify Firebase is initialized (`window.firebaseReady`)
2. Check that user is logged in and verified
3. Look for auth errors in console
3. Ensure `auth.js` is version 1.2.0 or higher

### Styling conflicts?

The header uses prefixed class names (`healthconnect-*`) to avoid conflicts. If you see styling issues:

1. Check for CSS specificity conflicts
2. Ensure no other stylesheets override header styles
3. Verify Font Awesome CSS is loaded

## Future Enhancements

Potential improvements for future versions:

- 🔔 Notification badge for new messages
- 🔍 Search functionality in header
- 🌙 Dark mode toggle
- 📊 Quick stats in dropdown menu
- ⚙️ Settings panel
- 🔔 Toast notifications for auth state changes

## Support

For issues or questions:
- Check the browser console for errors
- Review the implementation in existing pages
- Refer to `auth.js` documentation for authentication issues

---

**Version:** 1.0.0  
**Created:** 2025  
**Last Updated:** 2025-11-04

