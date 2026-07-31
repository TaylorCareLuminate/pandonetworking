# Gemini Key Reporting Dashboard

## Overview

The **Gemini Key Reporting Dashboard** (`gemini_key_reporting.html`) provides real-time monitoring of all 16 Google Gemini API keys, showing usage, availability, and status at a glance.

---

## 🎯 Features

### Real-Time Monitoring
- ✅ **Live Key Status** - See which keys are available vs exhausted
- ✅ **Usage Tracking** - Current usage count for each key (out of 1,498)
- ✅ **Visual Progress Bars** - Color-coded usage indicators
- ✅ **Auto-Refresh** - Updates every 30 seconds automatically

### Summary Cards
- **Available Keys** - How many keys are ready to use
- **Exhausted Keys** - How many keys have hit the daily limit
- **Total Usage** - Combined searches across all keys today
- **Overall Capacity** - Percentage of daily limit used

### Usage Distribution Chart
- Visual bar chart showing usage across all 16 keys
- Quick identification of heavily used keys
- Hover for detailed stats

### Key Details
Each key card shows:
- Key name (gen00-gen15)
- Status badge (Available/Exhausted/Missing)
- Usage count and percentage
- Progress bar with color coding:
  - 🟢 Green (0-50%) - Low usage
  - 🟡 Yellow (51-80%) - Medium usage
  - 🔴 Red (81-100%) - High usage
- Remaining searches
- Total all-time usage

### Next Key Available
When all keys are exhausted, shows:
- Which key will become available first
- Exact time it becomes available
- Countdown timer

---

## 🚀 How to Use

### Accessing the Dashboard

Open in your browser:
```
file:///path/to/HealthLuminateSite/crm/gemini_key_reporting.html
```

Or if deployed to a web server:
```
https://your-domain.com/crm/gemini_key_reporting.html
```

### Dashboard Controls

**🔄 Refresh Now**
- Manually refresh the data immediately
- Use when you want instant updates

**🧪 Test Search**
- Performs a test Gemini search ("What is 2+2?")
- Shows which key was used
- Displays updated usage count
- Confirms system is working

**🧹 Cleanup Old Records**
- Removes usage records older than 24 hours
- Helps keep Firebase clean
- Should rarely be needed (automatic cleanup runs daily)

**Auto-refresh Toggle**
- Checked: Refreshes data every 30 seconds
- Unchecked: Manual refresh only

---

## 📊 Understanding the Display

### Overall Status Badge

Located in the header, shows system health:

- **🟢 Operational** - 5+ keys available
- **🟡 Low Availability** - 1-4 keys available
- **🔴 All Keys Exhausted** - 0 keys available

### Key Card Colors

**Green Border** - Key is available (< 1,498 uses)
```
✅ Ready to use
```

**Red Border** - Key is exhausted (≥ 1,498 uses)
```
❌ At daily limit
```

**Gray Border** - Environment variable missing
```
⚠️ Not configured
```

### Progress Bar Colors

- **Green** - Healthy (0-50% used)
- **Yellow** - Warning (51-80% used)
- **Red** - Critical (81-100% used)

---

## 🔍 Monitoring Best Practices

### Daily Checks

1. **Morning Review** (Start of workday)
   - Check available keys count
   - Note overall capacity percentage
   - Look for any missing environment variables

2. **Afternoon Review** (Mid-day)
   - Monitor which keys are approaching limit
   - Check if rotation is working properly
   - Verify no keys stuck at high usage

3. **Evening Review** (End of workday)
   - Review total daily usage
   - Check if any keys exhausted
   - Note patterns for capacity planning

### What to Watch For

**⚠️ Warning Signs:**

1. **All Keys > 80% Used**
   - May need more API keys
   - Consider adding gen16-gen31

2. **One Key Always Higher**
   - Rotation may not be working
   - Check Railway logs
   - Verify Firebase updates

3. **Missing Env Vars**
   - Some keys show "Missing Env Var"
   - Add missing keys to Railway
   - Redeploy service

4. **No Usage Showing**
   - System may not be recording properly
   - Check Firebase `geminiKeyUsage` collection
   - Verify Railway service is running

**✅ Healthy System:**
- Usage distributed across multiple keys
- Available keys > 5
- Overall capacity < 70%
- No missing environment variables

---

## 🧪 Testing

### Initial Verification

After deployment, verify the system:

1. **Open Dashboard**
   - Should load without errors
   - All 16 keys should appear

2. **Check Summary Cards**
   - Available Keys: Should be 16 (or number of configured keys)
   - Total Usage: Should show current day's usage
   - Capacity: Should be < 100%

3. **Run Test Search**
   - Click "🧪 Test Search"
   - Should return "4" as result
   - Should show which key was used
   - Usage count should increment by 1

4. **Verify Auto-Refresh**
   - Note current timestamp
   - Wait 30 seconds
   - Timestamp should update automatically

### Troubleshooting Tests

**Test 1: Connection Test**
```
Expected: Data loads successfully
If not: Check Railway URL in script
```

**Test 2: Key Recognition**
```
Expected: All 16 keys show with status
If not: Verify environment variables in Railway
```

**Test 3: Usage Recording**
```
Expected: Test search increments usage counter
If not: Check Firebase permissions
```

---

## 📱 Mobile Responsive

The dashboard is fully responsive and works on:
- 📱 Mobile phones
- 📱 Tablets
- 💻 Desktop computers
- 🖥️ Large monitors

Layout automatically adjusts for screen size.

---

## 🔧 Configuration

### Changing Railway URL

If your Railway URL is different, update line 387:

```javascript
const RAILWAY_URL = 'https://your-custom-railway-url.up.railway.app';
```

### Adjusting Auto-Refresh Interval

Default is 30 seconds. To change, update line 399:

```javascript
autoRefreshInterval = setInterval(refreshData, 60000); // 60 seconds
```

### Color Theme

To customize colors, edit the CSS variables at the top of the file:
- Primary color: `#667eea`
- Success color: `#38a169`
- Warning color: `#ecc94b`
- Error color: `#e53e3e`

---

## 📊 Data Sources

The dashboard pulls data from these Railway endpoints:

1. **`GET /gemini/usage-report`**
   - Main data source
   - Returns all key statuses
   - Updates every refresh

2. **`POST /gemini/search`** (Test button)
   - Validates system works
   - Increments usage counter

3. **`POST /gemini/cleanup`** (Cleanup button)
   - Removes old records
   - Manual maintenance

---

## 🎨 Dashboard Sections

### 1. Header
- Title and overall status badge
- Quick system health indicator

### 2. Controls
- Action buttons
- Auto-refresh toggle

### 3. Summary Cards (4 cards)
- High-level metrics
- Color-coded values

### 4. Next Available (conditional)
- Only shows when keys exhausted
- Countdown to next available key

### 5. Usage Chart
- Visual bar chart
- All 16 keys side-by-side
- Interactive hover tooltips

### 6. Key Cards Grid
- Detailed view of each key
- Progress bars and metrics
- Responsive grid layout

### 7. Timestamp
- Last update time
- Confirms auto-refresh working

---

## 🚨 Error Handling

The dashboard handles these error scenarios:

### Connection Errors
```
❌ Connection Error
Failed to connect to Railway: [error details]
```
**Solution:** Check Railway service is running

### API Errors
```
❌ Failed to load key data
[error details]
```
**Solution:** Check Railway logs for backend errors

### No Data
```
No key data available
```
**Solution:** Verify Firebase has `geminiKeyUsage` collection

---

## 📈 Performance

- **Load Time:** < 1 second (depends on connection)
- **Refresh Time:** ~200-500ms per refresh
- **Data Transfer:** ~5-10KB per refresh
- **Browser Support:** All modern browsers

---

## 🔐 Security Notes

- Dashboard connects to Railway over HTTPS
- No API keys exposed in frontend
- Read-only access to usage data
- Test search uses minimal API quota

---

## 📝 Maintenance

### Regular Maintenance
- No regular maintenance required
- Auto-refresh keeps data current
- Automatic cleanup runs daily (2 AM)

### Occasional Tasks
- Monitor for missing environment variables
- Verify all keys are rotating properly
- Review usage patterns monthly

---

## 💡 Tips & Tricks

### Quick Health Check
Look at the header badge color:
- 🟢 Green = All good
- 🟡 Yellow = Monitor closely
- 🔴 Red = Take action

### Capacity Planning
If consistently above 70% capacity:
- Consider adding more keys (gen16+)
- Review if all searches are necessary
- Implement result caching

### Best Times to Check
1. **Start of day** - See if any keys exhausted overnight
2. **Mid-day** - Catch any issues early
3. **End of day** - Review patterns

### Bookmark This Page
Add to your browser bookmarks for quick access:
```
Gemini Keys - Daily Check
```

---

## 🆘 Support

### Common Issues

**Issue: "All keys show as missing"**
```
Solution: Check Railway environment variables
Expected format: gen00, gen01, ... gen15 (lowercase)
```

**Issue: "No data loads"**
```
Solution: 
1. Check Railway service is running
2. Verify RAILWAY_URL in script
3. Check browser console for errors
```

**Issue: "Usage not updating"**
```
Solution:
1. Verify Firebase connection
2. Check Railway logs
3. Try manual cleanup
```

**Issue: "Test search fails"**
```
Solution:
1. Check if any keys available
2. Verify Gemini API keys valid
3. Check Railway logs for errors
```

---

## 📚 Related Documentation

- **GEMINI_KEY_MANAGEMENT_README.md** - Complete system docs
- **GEMINI_DEPLOYMENT_GUIDE.md** - Deployment instructions
- **GEMINI_ARCHITECTURE.md** - Technical architecture
- **GEMINI_SETUP_COMPLETE.md** - Setup summary

---

## ✅ Quick Start Checklist

- [ ] Open dashboard in browser
- [ ] Verify all 16 keys appear
- [ ] Check "Available Keys" count
- [ ] Run test search
- [ ] Confirm usage increments
- [ ] Enable auto-refresh
- [ ] Bookmark the page

---

## 🎉 You're All Set!

The dashboard provides everything you need to monitor your Gemini API keys at a glance. Check it daily to ensure smooth operation and optimal usage distribution.

**Happy Monitoring! 🚀**











