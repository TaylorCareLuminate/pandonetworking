# PensionPro Integration - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Set Environment Variables in Railway

Go to your Railway project dashboard and add these variables:

```
pensionproapi     = [Your PensionPro API Key]
pensionpro_name   = [Your PensionPro Username]
pensionpro_pass   = [Your PensionPro Password]
```

### Step 2: Deploy to Railway

Railway will automatically detect and deploy when you push these files:

```
✓ server.js           (Express server)
✓ package.json        (Dependencies)
✓ railway.json        (Railway config)
```

**Or manually deploy:**
```bash
railway up
```

### Step 3: Test the Integration

Navigate to:
```
https://[your-railway-url].up.railway.app/execretirement/pensionpro_test.html
```

Click **"Test Connection"** button.

✅ If you see "Successfully connected to PensionPro API!" - you're done!

---

## 🎯 What You Get

### Files Created

1. **`server.js`** - Railway backend server
   - Proxies requests to PensionPro API
   - Handles authentication securely
   - Serves static files

2. **`package.json`** - Node.js configuration
   - Express for server
   - CORS for cross-origin requests

3. **`railway.json`** - Railway deployment config
   - Auto-restart on failure
   - Proper build configuration

4. **`execretirement/pensionpro_test.html`** - Test interface
   - Beautiful UI for testing
   - Real-time Railway logs
   - Data export functionality

5. **Documentation**
   - `PENSIONPRO_SETUP.md` - Complete setup guide
   - `execretirement/PENSIONPRO_TEST_README.md` - Test page guide
   - This file - Quick start guide

### API Endpoints Available

```
GET  /health                           - Health check
GET  /api/pensionpro/config            - Configuration
GET  /api/pensionpro/clients           - All clients
GET  /api/pensionpro/clients/:id       - Single client
GET  /api/pensionpro/plans             - All plans
GET  /api/pensionpro/employerdata      - Employer data
GET  /api/pensionpro/*                 - Generic proxy
```

---

## 📋 Pre-Deployment Checklist

- [ ] Railway project created
- [ ] Environment variables set
- [ ] Files pushed to repository
- [ ] Railway connected to repository (or using Railway CLI)

---

## 🚀 Deployment Options

### Option A: Git Integration (Recommended)

1. Push code to GitHub
2. Connect repository to Railway
3. Railway auto-deploys on push
4. Set environment variables in Railway dashboard

### Option B: Railway CLI

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

---

## 🧪 Testing Checklist

After deployment:

- [ ] Access `/health` endpoint - should return 200 OK
- [ ] Access `/api/pensionpro/config` - should show config
- [ ] Open test page at `/execretirement/pensionpro_test.html`
- [ ] Click "Test Connection" - should succeed
- [ ] Click "Fetch All Clients" - should show data
- [ ] Click "Fetch with Employer Data" - should show employee counts

---

## 🎨 Key Features

### Test Interface Features:
- ✅ Connection testing
- ✅ Client data fetching
- ✅ Employee/lives count display
- ✅ Real-time logging
- ✅ Data filtering
- ✅ JSON export
- ✅ Beautiful, modern UI

### Security Features:
- ✅ Credentials stored in Railway (not in code)
- ✅ Server-side authentication
- ✅ No API keys exposed to frontend
- ✅ CORS protection

---

## 💡 Common Use Cases

### Get All Clients with Employee Counts
1. Open test page
2. Set "Top N Results" to 100
3. Click "Fetch with Employer Data"
4. View in table or export to JSON

### Find Specific Company
1. Enter filter: `contains(CompanyName/DisplayName, 'Company Name')`
2. Click "Fetch with Employer Data"
3. Results show matching companies

### Export Client Data
1. Fetch the data you want
2. Click "Export Data" button
3. Open JSON file in Excel or text editor

---

## 🔧 Configuration

### Update Railway URL

If your Railway URL is different from default, update this line in `pensionpro_test.html`:

```javascript
const RAILWAY_API_URL = 'https://your-actual-url.up.railway.app';
```

### Adjust Default Settings

In the test page, you can modify:
- Default top results (currently 100)
- Polling intervals
- Table columns displayed

---

## 📊 Example API Calls

### From Frontend (JavaScript)
```javascript
// Test connection
fetch('https://your-url.up.railway.app/api/pensionpro/clients?$top=1')
  .then(res => res.json())
  .then(data => console.log('Success!', data));

// Get clients with employer data
fetch('https://your-url.up.railway.app/api/pensionpro/clients?$expand=CurrentEmployerData&$top=100')
  .then(res => res.json())
  .then(clients => {
    clients.forEach(client => {
      console.log(
        client.CompanyName?.DisplayName,
        'Employees:',
        client.CurrentEmployerData?.EmployeeCount || 'N/A'
      );
    });
  });
```

### From cURL
```bash
# Test connection
curl https://your-url.up.railway.app/health

# Get clients
curl https://your-url.up.railway.app/api/pensionpro/clients?$top=10
```

---

## 🚨 Troubleshooting Quick Fixes

### "Not Connected" Error
```bash
# Check environment variables
railway variables

# Should show:
# pensionproapi=***
# pensionpro_name=***
```

### "CORS Error"
- Make sure you're accessing via Railway URL, not localhost
- Check Railway logs for errors

### "500 Internal Server Error"
- Check Railway logs: `railway logs`
- Verify environment variables are set
- Confirm PensionPro credentials are valid

---

## 📚 Documentation Links

- **Complete Setup Guide**: `/PENSIONPRO_SETUP.md`
- **Test Page Guide**: `/execretirement/PENSIONPRO_TEST_README.md`
- **PensionPro API Docs**: https://api.pensionpro.com/swagger/index.html
- **Railway Docs**: https://docs.railway.app/

---

## 🎉 Success Indicators

You'll know it's working when you see:

✅ Green "Connected" status in test page  
✅ Client data appearing in table  
✅ Employee/lives counts displaying  
✅ No errors in Railway logs  
✅ Can export data successfully

---

## 📞 Next Steps

1. ✅ Deploy to Railway
2. ✅ Test with test page
3. ✅ Integrate into your application
4. ⏭️ Build custom dashboards
5. ⏭️ Schedule automated data pulls
6. ⏭️ Create reports

---

**Estimated Setup Time**: 5-10 minutes  
**Technical Level**: Intermediate  
**Dependencies**: Railway account, PensionPro API access

**Created**: November 5, 2025  
**Version**: 1.0.0





