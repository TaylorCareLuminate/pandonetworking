# PensionPro API Integration - Setup Guide

## 🎯 Overview

This integration connects the HealthLuminate site with PensionPro's API to pull client data, including employee/lives counts and other client information.

## 🏗️ Architecture

```
Frontend (pensionpro_test.html)
         ↓
Railway Server (server.js)
         ↓
PensionPro API (api.pensionpro.com)
```

## 🔧 Railway Setup

### 1. Environment Variables

The following environment variables must be set in your Railway project:

```bash
pensionproapi      # Your PensionPro API Key
pensionpro_name    # Your PensionPro Username
pensionpro_pass    # Your PensionPro Password (optional, not used in API auth)
PORT               # Automatically set by Railway
```

### 2. Deploy to Railway

#### Option A: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Deploy
railway up
```

#### Option B: Using Git Integration

1. Push your code to GitHub
2. Connect the repository to Railway
3. Railway will automatically deploy when you push changes
4. Make sure environment variables are set in Railway dashboard

### 3. Required Files

- `server.js` - Express server that proxies PensionPro API requests
- `package.json` - Node.js dependencies
- `execretirement/pensionpro_test.html` - Test interface

## 📡 API Endpoints

### Health Check
```
GET /health
```

Returns server status and configuration.

### Configuration Info
```
GET /api/pensionpro/config
```

Returns non-sensitive configuration information.

### Get All Clients
```
GET /api/pensionpro/clients
```

**Query Parameters:**
- `$top` - Number of records to return (max 1000)
- `$skip` - Number of records to skip (pagination)
- `$filter` - OData filter expression
- `$expand` - Expand related data (e.g., `CurrentEmployerData`)
- `$orderby` - Sort order

**Example:**
```bash
GET /api/pensionpro/clients?$top=100&$expand=CurrentEmployerData
```

### Get Single Client
```
GET /api/pensionpro/clients/:clientId
```

**Example:**
```bash
GET /api/pensionpro/clients/12345
```

### Get Plans
```
GET /api/pensionpro/plans
```

### Get Employer Data
```
GET /api/pensionpro/employerdata
```

### Generic Proxy
```
GET /api/pensionpro/*
```

Any PensionPro API endpoint can be accessed through this proxy.

## 🧪 Testing

### 1. Access the Test Page

Navigate to:
```
https://your-railway-url.up.railway.app/execretirement/pensionpro_test.html
```

Or locally:
```
http://localhost:3000/execretirement/pensionpro_test.html
```

### 2. Test Connection

Click "Test Connection" button to verify:
- Railway environment variables are set correctly
- PensionPro API credentials are valid
- Server can reach PensionPro API

### 3. Fetch Clients

Click "Fetch All Clients" or "Fetch with Employer Data" to:
- Pull client data from PensionPro
- Display in a formatted table
- View employee/lives counts
- Export data to JSON

## 🔐 Authentication

PensionPro API uses a custom authentication header format:

```
Authorization: {API_KEY}|{USERNAME}
```

The server automatically constructs this from your environment variables.

## 📊 Key Data Fields

### Client Object

```javascript
{
  Id: number,
  InternalClientId: string,
  CompanyName: {
    DisplayName: string
  },
  Status: {
    DisplayName: string
  },
  Location: {
    DisplayName: string
  },
  CurrentEmployerData: {
    EIN: string,
    EmployeeCount: number,      // 👈 Employee/Lives count
    Lives: number,              // 👈 Alternative field name
    NumberOfEmployees: number,  // 👈 Another possible field
    ParticipantCount: number,   // 👈 Participant count
    PayrollProvider: string,
    FiscalYearEnd: string
  },
  AccountBalance: number,
  IsDeactivated: boolean
}
```

## 🚀 Usage Examples

### Fetch First 50 Clients
```javascript
fetch('/api/pensionpro/clients?$top=50')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Fetch Clients with Employer Data
```javascript
fetch('/api/pensionpro/clients?$top=100&$expand=CurrentEmployerData')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Filter by Company Name
```javascript
const filter = "contains(CompanyName/DisplayName, 'Acme')";
fetch(`/api/pensionpro/clients?$filter=${encodeURIComponent(filter)}`)
  .then(res => res.json())
  .then(data => console.log(data));
```

### Get Active Clients Only
```javascript
const filter = "IsDeactivated eq false";
fetch(`/api/pensionpro/clients?$filter=${encodeURIComponent(filter)}`)
  .then(res => res.json())
  .then(data => console.log(data));
```

## 📝 OData Query Options

PensionPro API supports OData query syntax:

### Filter Operators
- `eq` - Equals
- `ne` - Not equals
- `gt` - Greater than
- `lt` - Less than
- `contains(field, 'value')` - Contains substring

### Examples
```
$filter=IsDeactivated eq false
$filter=AccountBalance gt 10000
$filter=contains(CompanyName/DisplayName, 'Corp')
```

### Expand
```
$expand=CurrentEmployerData
$expand=Location,Status,CompanyName
```

### Order By
```
$orderby=CompanyName/DisplayName
$orderby=CreatedOn desc
```

### Paging
```
$top=100&$skip=0        # First page
$top=100&$skip=100      # Second page
$top=100&$skip=200      # Third page
```

## 🔍 Troubleshooting

### Error: "Missing required environment variables"
- Verify environment variables are set in Railway dashboard
- Check variable names match exactly: `pensionproapi`, `pensionpro_name`

### Error: "401 Unauthorized"
- Verify your API key is correct
- Verify your username is correct
- Check that credentials are active in PensionPro

### Error: "CORS policy"
- The server includes CORS headers, but verify your origin is allowed
- Check Railway deployment URL matches the URL in test page

### Error: "Connection timeout"
- Verify Railway server is running
- Check Railway logs for errors
- Verify PensionPro API is accessible

## 📚 Resources

- **PensionPro API Documentation**: https://api.pensionpro.com/swagger/index.html
- **OData Query Documentation**: http://docs.oasis-open.org/odata/odata/v4.0/
- **Railway Documentation**: https://docs.railway.app/

## 🛠️ Development

### Local Testing

1. Create a `.env` file:
```bash
pensionproapi=your_api_key_here
pensionpro_name=your_username_here
pensionpro_pass=your_password_here
PORT=3000
```

2. Install dependencies:
```bash
npm install
```

3. Run the server:
```bash
npm start
```

4. Access test page:
```
http://localhost:3000/execretirement/pensionpro_test.html
```

### Log Monitoring

View Railway logs in real-time:
```bash
railway logs
```

Or in Railway dashboard under the "Deployments" tab.

## 📋 Checklist

- [ ] Environment variables set in Railway
- [ ] Server deployed to Railway
- [ ] Test connection successful
- [ ] Can fetch clients
- [ ] Can view employee/lives counts
- [ ] Can export data
- [ ] Railway logs showing successful requests

## 🔄 Updates

Last Updated: November 5, 2025
Version: 1.0.0
Author: HealthLuminate Technical Team





