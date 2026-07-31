# CRM Header Component

This document explains how to use the reusable header component (`header.html`) in your CRM pages.

## Features

- **Logo and Branding**: HealthLuminate logo with consistent styling
- **Navigation**: Links to Dashboard and Add Lead pages with active states
- **Authentication**: Complete user authentication UI with login/logout
- **Responsive Design**: Works on desktop and mobile devices
- **Extensible**: Easy to add new navigation items

## Usage

### 1. Include the Header in Your Page

Replace your existing header HTML with this placeholder:

```html
<!-- Header -->
<div id="header-placeholder"></div>

<script>
  // Load header
  fetch('header.html')
    .then(response => response.text())
    .then(html => {
      document.getElementById('header-placeholder').innerHTML = html;
      // Set page title after header is loaded
      setTimeout(() => {
        setPageTitle('Your Page Title');
      }, 100);
    })
    .catch(error => {
      console.error('Error loading header:', error);
      // Fallback: show basic header
      document.getElementById('header-placeholder').innerHTML = `
        <header style="background: #264653; color: #fff; padding: 18px 0; box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 12px;">
          <div style="max-width: 1100px; margin: 0 auto; padding: 0 18px;">
            <h1 style="margin: 0; font-size: 2rem; font-weight: 700;">Your Page Title</h1>
          </div>
        </header>
      `;
    });
</script>
```

### 2. Required CSS

Make sure your page includes this basic header CSS:

```css
header {
  background: var(--primary); 
  color: #fff; 
  padding: 18px 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08); 
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### 3. CSS Variables

Ensure your page defines these CSS variables:

```css
:root {
  --primary: #264653;
  --secondary: #2a9d8f;
  --accent: #e9c46a;
  --danger: #e76f51;
  --success: #2a9d8f;
  /* ... other variables ... */
}
```

## Adding New Navigation Items

### Method 1: Edit header.html Directly

Add new navigation items to the `<nav class="crm-nav">` section:

```html
<nav class="crm-nav">
  <a href="mainpage.html" class="nav-link" id="dashboardLink">
    <i class="fas fa-tachometer-alt"></i>
    <span>Dashboard</span>
  </a>
  <a href="addlead.html" class="nav-link" id="addLeadLink">
    <i class="fas fa-plus-circle"></i>
    <span>Add Lead</span>
  </a>
  <!-- Add new navigation items here -->
  <a href="reports.html" class="nav-link" id="reportsLink">
    <i class="fas fa-chart-bar"></i>
    <span>Reports</span>
  </a>
  <a href="settings.html" class="nav-link" id="settingsLink">
    <i class="fas fa-cog"></i>
    <span>Settings</span>
  </a>
</nav>
```

### Method 2: Add Programmatically

Use the `addNavItem()` function after the header loads:

```javascript
// Add new navigation item
setTimeout(() => {
  addNavItem('reports.html', 'fas fa-chart-bar', 'Reports');
  addNavItem('settings.html', 'fas fa-cog', 'Settings');
}, 200);
```

## Example: Creating a New Page

Here's a template for creating a new CRM page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Page - HealthLuminate CRM</title>
  <link rel="stylesheet" href="../css/main.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <style>
    :root {
      --primary: #264653;
      --secondary: #2a9d8f;
      --accent: #e9c46a;
      --danger: #e76f51;
      --success: #2a9d8f;
    }
    
    body { 
      background: #f9fafb; 
      margin: 0; 
      font-family: 'Segoe UI', Arial, sans-serif; 
    }
    
    header {
      background: var(--primary); 
      color: #fff; 
      padding: 18px 0;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); 
      margin-bottom: 12px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .container { 
      max-width: 1100px; 
      margin: 30px auto 60px auto; 
      padding: 0 16px;
    }
    
    .main-content { 
      background: #fff; 
      border-radius: 10px; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.07); 
      padding: 30px 20px; 
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div id="header-placeholder"></div>
  
  <script>
    // Load header
    fetch('header.html')
      .then(response => response.text())
      .then(html => {
        document.getElementById('header-placeholder').innerHTML = html;
        // Set page title after header is loaded
        setTimeout(() => {
          setPageTitle('New Page - CRM');
        }, 100);
      })
      .catch(error => {
        console.error('Error loading header:', error);
        // Fallback: show basic header
        document.getElementById('header-placeholder').innerHTML = `
          <header style="background: #264653; color: #fff; padding: 18px 0; box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 12px;">
            <div style="max-width: 1100px; margin: 0 auto; padding: 0 18px;">
              <h1 style="margin: 0; font-size: 2rem; font-weight: 700;">New Page - CRM</h1>
            </div>
          </header>
        `;
      });
  </script>

  <div class="container">
    <div class="main-content">
      <h1>Your New Page Content</h1>
      <p>Add your page content here...</p>
    </div>
  </div>

  <!-- Authentication Script -->
  <script src="../js/auth.js"></script>
  
  <!-- Add your page-specific scripts here -->
</body>
</html>
```

## Functions Available

### `setPageTitle(title)`
Updates the page title dynamically.

```javascript
setPageTitle('Custom Page Title');
```

### `addNavItem(href, icon, text, position)`
Adds a new navigation item.

```javascript
addNavItem('newpage.html', 'fas fa-star', 'New Page', 'end');
```

Parameters:
- `href`: URL for the navigation link
- `icon`: Font Awesome icon class
- `text`: Display text
- `position`: 'start' or 'end' (default: 'end')

## Authentication

The header includes the complete authentication system from `auth.js`. No additional setup required for authentication functionality.

## Notes

- The active navigation state is automatically set based on the current page URL
- The header is fully responsive and works on mobile devices
- Icons are hidden on mobile to save space
- The header includes fallback HTML in case the header.html file fails to load 