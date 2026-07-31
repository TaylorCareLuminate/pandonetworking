# KBA Slide Decks Directory - Automatic Scanner

This directory now supports **automatic scanning** of the `slidedecks` folder! When you add new slide decks, they will automatically appear in the directory without needing to manually update the HTML file.

## 🚀 Quick Start

The system will automatically try different server backends in this order:
1. **PHP version** (`scan-slidedecks.php`)
2. **Node.js version** (`scan-slidedecks.js`)

## 📁 Folder Structure

Your slidedecks should be organized like this:

```
kba/
├── slidedecks/
│   ├── Cleveland Clinic/
│   │   ├── Cleveland Clinic DTE Modeling.pptx
│   │   └── Cleveland Clinic DTE Executive Summary.pptx
│   ├── Johns Hopkins/
│   │   ├── Johns Hopkins Direct to Employer Executive Overview.pptx
│   │   ├── Johns Hopkins Direct to Employer Opportunity.pptx
│   │   └── Johns Hopkins Direct to Employer Plan.pptx
│   └── [Other Organizations]/
│       └── [Their slide decks...]
├── directory.html
├── scan-slidedecks.php (PHP version)
├── scan-slidedecks.js (Node.js version)
└── package.json (for Node.js)
```

## 🐘 Option 1: PHP Setup (Recommended for most web servers)

### Requirements
- PHP 7.0+ with file system access
- Web server (Apache, Nginx, etc.)

### Setup
1. **Upload the files** to your web server
2. **Ensure the slidedecks folder** exists and is readable by PHP
3. **Test the endpoint** by visiting: `your-domain.com/kba/scan-slidedecks.php`

### Testing PHP
```bash
# If you have PHP installed locally, you can test with:
cd kba
php -S localhost:8000
# Then visit: http://localhost:8000/scan-slidedecks.php
```

## 🟢 Option 2: Node.js Setup

### Requirements
- Node.js 14+ 
- npm

### Setup
1. **Install dependencies**:
   ```bash
   cd kba
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   # OR for development with auto-restart:
   npm run dev
   ```

3. **Test the endpoint**: Visit `http://localhost:3001/api/slidedecks`

### Production Deployment
For production, you can use PM2 or similar:
```bash
# Install PM2 globally
npm install -g pm2

# Start the server with PM2
pm2 start scan-slidedecks.js --name "kba-slidedecks"

# Save PM2 configuration
pm2 save
pm2 startup
```

## 🔧 How It Works

1. **Automatic Detection**: The `directory.html` file automatically tries different server endpoints
2. **Folder Scanning**: The server script scans the `slidedecks` folder for PowerPoint files (`.ppt`, `.pptx`)
3. **Metadata Extraction**: File size, modification date, and organization info are automatically extracted
4. **Category Assignment**: Categories are automatically assigned based on filename keywords:
   - "executive" → Executive Summary
   - "modeling" → Modeling  
   - "opportunity" → Opportunity Analysis
   - "plan" → Strategic Plan
   - "overview" → Overview
   - "unfinished"/"draft" → Draft
   - Default → Presentation

## ✨ Features

- **🔄 Auto-refresh**: Click the "Refresh" button to re-scan the folder
- **🔍 Smart search**: Search by organization, title, or category
- **📊 Live stats**: Shows total decks, organizations, and filtered results
- **📱 Mobile responsive**: Works on all devices
- **🔐 Secure**: Integrated with your existing authentication system

## 🛠️ Adding New Slide Decks

1. **Create organization folder** (if it doesn't exist): `/kba/slidedecks/[Organization Name]/`
2. **Upload PowerPoint files** to the organization folder
3. **Refresh the page** or click the "Refresh" button
4. **That's it!** The new decks will automatically appear

## 🐛 Troubleshooting

### "Failed to load slide decks" Error
1. **Check folder permissions**: Ensure the web server can read the `slidedecks` folder
2. **Check file paths**: Make sure the folder structure matches the expected format
3. **Test endpoints directly**:
   - PHP: Visit `/kba/scan-slidedecks.php` in your browser
   - Node.js: Visit `http://localhost:3001/api/slidedecks`

### PHP Issues
- **500 Error**: Check PHP error logs, ensure PHP has file system read permissions
- **Empty response**: Verify the `slidedecks` folder exists and contains files

### Node.js Issues
- **ENOENT Error**: Make sure you're running the command from the `/kba` directory
- **Port 3001 in use**: Change the PORT variable in `scan-slidedecks.js`
- **CORS issues**: The server includes CORS headers, but check browser console for errors

## 🔧 Customization

### Changing the Slidedecks Folder Location
Edit the folder path in either:
- **PHP**: Line with `scanSlideDecksFolder('slidedecks')` 
- **Node.js**: Line with `await scanSlideDecksFolder()`

### Adding More File Types
Modify the file extension checks in:
- **PHP**: `pathinfo($item, PATHINFO_EXTENSION) === 'pptx'`
- **Node.js**: `/\.(pptx?|PPTX?)$/i.test(file)`

### Custom Categories
Modify the category detection logic in both server files to add your own keyword-based categories.

## 🔒 Security Notes

- The scanner only reads file metadata, not file contents
- Only PowerPoint files are included in the results
- The system respects your existing authentication setup
- CORS is properly configured for cross-origin requests

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your server setup (PHP or Node.js)
3. Test the API endpoints directly
4. Ensure proper folder structure and permissions

---

**🎉 That's it!** Your slide decks directory now automatically updates when you add new files. No more manual HTML editing required! 