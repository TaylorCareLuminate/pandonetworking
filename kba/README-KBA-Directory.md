# KBA Slide Decks Directory System

## Overview
This system provides a secure, searchable directory of PowerPoint slide decks for Key Benefit Administrators (KBA) with automatic file discovery and secure downloads.

## Files Structure
```
kba/
├── directory.html              # Main directory page
├── slidedecks-data.json       # Generated index of all slide decks
├── slidedecks/                # Folder containing all PowerPoint files
│   ├── Organization 1/
│   ├── Organization 2/
│   └── ...
├── generate-slidedecks-json.js # Node.js script to scan files
├── regenerate-api.php         # PHP endpoint for data regeneration
├── download.php               # Secure PHP download handler
├── download-server.js         # Node.js secure download server
└── test-download.html         # Testing page
```

## How It Works

### 1. File Discovery
- The system scans the `/slidedecks/` folder recursively
- Finds all PowerPoint files (.ppt, .pptx, .pptm)
- Organizes by organization (folder name)
- Categorizes by filename keywords (Executive, Modeling, etc.)

### 2. Data Storage
- All file information is stored in `slidedecks-data.json`
- Includes: title, organization, file size, date, category, path
- This JSON file is loaded by the directory page

### 3. Secure Downloads
- **Method 1**: PHP handler (`download.php`) - Preferred
- **Method 2**: Node.js server (`download-server.js`) - Alternative
- **Method 3**: Direct download - Fallback
- All methods set proper headers to prevent browser security warnings

## Adding New Files

### Automatic Detection (Recommended)
1. Upload new PowerPoint files to the appropriate organization folder in `/slidedecks/`
2. Click "Regenerate Data" button on the directory page
3. New files will be automatically detected and added

### Manual Regeneration
If the automatic method doesn't work:
1. Run `regenerate-slidedecks-data.bat` 
2. Or run `node generate-slidedecks-json.js` in the kba folder
3. Refresh the directory page

## Security Features

### Authentication
- Users must be logged in and verified
- Domain-based access control (configured in Firestore)
- Only users from allowed domains can access KBA resources

### Download Security
- Proper Content-Disposition headers prevent browser warnings
- Correct MIME types for PowerPoint files
- Path validation prevents directory traversal attacks
- Filename sanitization removes dangerous characters

### File Access
- Only files in the `/slidedecks/` folder can be downloaded
- No access to parent directories or system files

## Troubleshooting

### New Files Not Showing
1. Check if files are in the correct `/slidedecks/Organization/` folder structure
2. Ensure files have .ppt, .pptx, or .pptm extensions
3. Click "Regenerate Data" to force a rescan
4. Check browser console for errors

### Download Issues
1. Try the test page (`test-download.html`) to diagnose issues
2. Check if secure download servers are running
3. Verify file permissions and paths
4. Look for browser security warnings in downloads

### Browser Security Warnings
- Use the secure download methods (PHP or Node.js)
- Direct downloads may trigger warnings
- Proper headers eliminate most security warnings

## Testing
Use `test-download.html` to:
- Test data regeneration
- Check download methods
- Verify server status
- Debug file access issues

## Maintenance

### Regular Tasks
- Monitor for new file uploads
- Regenerate data when files are added via Netlify
- Check download server status
- Review access logs

### Performance
- JSON file loads quickly (currently ~119 files)
- File scanning takes a few seconds
- Downloads stream directly from filesystem

## Technical Details

### Supported File Types
- `.ppt` - Legacy PowerPoint
- `.pptx` - Modern PowerPoint  
- `.pptm` - PowerPoint with macros

### Category Detection
Files are automatically categorized based on filename:
- "Executive" → Executive Summary
- "Modeling" → Modeling
- "Opportunity" → Opportunity Analysis
- "Plan" → Strategic Plan
- "Overview" → Overview
- Default → Presentation

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Works on mobile devices 