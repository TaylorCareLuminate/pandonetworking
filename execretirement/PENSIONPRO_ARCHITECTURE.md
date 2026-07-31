# PensionPro Integration Architecture

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                  (pensionpro_test.html)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Connection  │  │   Fetch      │  │   Export     │        │
│  │    Test      │  │   Clients    │  │    Data      │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│  ┌────────────────────────────────────────────────────┐       │
│  │          Statistics Dashboard                      │       │
│  │  • Total Clients  • Total Employees               │       │
│  │  • API Status     • Last Updated                  │       │
│  └────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌────────────────────────────────────────────────────┐       │
│  │          Data Table (Client Information)           │       │
│  └────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌────────────────────────────────────────────────────┐       │
│  │          Railway Logs Viewer                       │       │
│  └────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS
                              │ (fetch API)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RAILWAY BACKEND                            │
│                       (server.js)                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │          Express.js Server                      │           │
│  │                                                  │           │
│  │  • CORS middleware                               │           │
│  │  • Static file serving                           │           │
│  │  • Request logging                               │           │
│  │  • Error handling                                │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │          API Proxy Endpoints                     │           │
│  │                                                  │           │
│  │  GET /health                                     │           │
│  │  GET /api/pensionpro/config                     │           │
│  │  GET /api/pensionpro/clients                    │           │
│  │  GET /api/pensionpro/clients/:id                │           │
│  │  GET /api/pensionpro/plans                      │           │
│  │  GET /api/pensionpro/employerdata               │           │
│  │  GET /api/pensionpro/*                          │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │       Authentication Handler                     │           │
│  │                                                  │           │
│  │  • Read environment variables                    │           │
│  │  • Construct auth header                         │           │
│  │  • Format: APIKey|Username                       │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │       Environment Variables (Railway)            │           │
│  │                                                  │           │
│  │  • pensionproapi (API Key)                       │           │
│  │  • pensionpro_name (Username)                    │           │
│  │  • pensionpro_pass (Password - optional)         │           │
│  │  • PORT (Auto-set by Railway)                    │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              │ (Authorization: APIKey|Username)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PENSIONPRO API                               │
│                (api.pensionpro.com/v2)                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │          REST API Endpoints                      │           │
│  │                                                  │           │
│  │  • /clients                                      │           │
│  │  • /clients/{id}                                 │           │
│  │  • /plans                                        │           │
│  │  • /employerdata                                 │           │
│  │  • /participants                                 │           │
│  │  • /projects                                     │           │
│  │  • ... (many more)                               │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │          OData Query Support                     │           │
│  │                                                  │           │
│  │  • $top - Limit results                          │           │
│  │  • $skip - Pagination                            │           │
│  │  • $filter - Filter data                         │           │
│  │  • $expand - Include related data                │           │
│  │  • $orderby - Sort results                       │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │          Response Format                         │           │
│  │                                                  │           │
│  │  • JSON format                                   │           │
│  │  • Max 1000 records per request                  │           │
│  │  • Includes metadata                             │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Example: Fetching Clients with Employer Data

```
1. USER ACTION
   └─> User clicks "Fetch with Employer Data" button

2. FRONTEND (pensionpro_test.html)
   ├─> Constructs API request
   ├─> URL: /api/pensionpro/clients?$expand=CurrentEmployerData&$top=100
   └─> Sends fetch() request to Railway backend

3. RAILWAY BACKEND (server.js)
   ├─> Receives request at /api/pensionpro/clients
   ├─> Logs request details
   ├─> Reads environment variables
   │   ├─> pensionproapi (API Key)
   │   └─> pensionpro_name (Username)
   ├─> Constructs auth header: "APIKey|Username"
   ├─> Forwards request to PensionPro API
   └─> URL: https://api.pensionpro.com/v2/clients?$expand=CurrentEmployerData&$top=100

4. PENSIONPRO API
   ├─> Authenticates request
   ├─> Validates query parameters
   ├─> Fetches client data from database
   ├─> Expands CurrentEmployerData (includes employee counts)
   ├─> Formats as JSON
   └─> Returns response (array of client objects)

5. RAILWAY BACKEND (server.js)
   ├─> Receives response from PensionPro
   ├─> Logs success/failure
   ├─> Forwards response to frontend
   └─> Adds CORS headers

6. FRONTEND (pensionpro_test.html)
   ├─> Receives JSON data
   ├─> Parses client objects
   ├─> Extracts employee/lives counts
   ├─> Updates statistics dashboard
   ├─> Populates data table
   ├─> Logs to Railway logs viewer
   └─> Shows success message

7. USER VIEW
   └─> Sees client data with employee counts in table
```

---

## 🔐 Security Flow

```
┌──────────────────┐
│   Credentials    │
│   (Sensitive)    │
└────────┬─────────┘
         │
         │ Stored in Railway
         │ (Environment Variables)
         ▼
┌──────────────────┐
│  Railway Backend │ ◄── Only backend has access to credentials
│   (server.js)    │
└────────┬─────────┘
         │
         │ Constructs auth header
         │ Authorization: APIKey|Username
         ▼
┌──────────────────┐
│  PensionPro API  │
└──────────────────┘

IMPORTANT:
✓ Frontend NEVER sees credentials
✓ Credentials NEVER in source code
✓ All auth happens server-side
✓ Frontend only receives public data
```

---

## 📦 Component Breakdown

### Frontend Components

```
pensionpro_test.html
├── UI Components
│   ├── Header (Title, subtitle)
│   ├── Connection Status (4 stat cards)
│   ├── Test Controls (5 buttons)
│   ├── Filter Options (2 inputs)
│   ├── Data Table (9 columns)
│   └── Railway Logs (scrollable container)
│
├── JavaScript Functions
│   ├── testConnection()
│   ├── fetchClients()
│   ├── fetchClientsWithEmployerData()
│   ├── callPensionProAPI()
│   ├── displayClients()
│   ├── updateStats()
│   ├── viewClientDetails()
│   ├── exportData()
│   ├── clearLogs()
│   └── logMessage()
│
└── Styling
    ├── Modern gradient design
    ├── Responsive layout
    ├── Animated interactions
    └── Professional color scheme
```

### Backend Components

```
server.js
├── Configuration
│   ├── Express setup
│   ├── Middleware (CORS, JSON, static files)
│   └── Environment variable reading
│
├── API Endpoints
│   ├── /health (Health check)
│   ├── /api/pensionpro/config (Config info)
│   ├── /api/pensionpro/clients (All clients)
│   ├── /api/pensionpro/clients/:id (Single client)
│   ├── /api/pensionpro/plans (Plans)
│   ├── /api/pensionpro/employerdata (Employer data)
│   └── /api/pensionpro/* (Generic proxy)
│
├── Helper Functions
│   ├── getPensionProConfig()
│   └── Error handling middleware
│
└── Server Management
    ├── Startup logging
    ├── Graceful shutdown
    └── Request logging
```

---

## 🌐 Network Diagram

```
┌──────────────┐
│   Browser    │
│   (User)     │
└──────┬───────┘
       │
       │ https://your-url.up.railway.app/execretirement/pensionpro_test.html
       ▼
┌──────────────┐
│   Railway    │
│   Platform   │
└──────┬───────┘
       │
       │ Serves static files + API
       │
       ├─────► Static: pensionpro_test.html
       │
       └─────► API: /api/pensionpro/*
                     │
                     │ Proxies to PensionPro
                     ▼
              ┌──────────────┐
              │  PensionPro  │
              │     API      │
              └──────────────┘
```

---

## 📊 Data Models

### Client Data Structure

```typescript
interface Client {
  // Identifiers
  Id: number;
  DataKey: string;
  InternalClientId: string;
  
  // Company Info
  CompanyName: {
    Id: number;
    DisplayName: string;
    MarkedForDeletion: boolean;
    IsDeactivated: boolean;
  };
  
  // Status & Location
  Status: {
    Id: number;
    DisplayName: string;
    IsDeactivated: boolean;
  };
  
  Location: {
    Id: number;
    DisplayName: string;
    IsDefault: boolean;
    IsDeactivated: boolean;
  };
  
  // Employer Data (KEY DATA)
  CurrentEmployerData: {
    Id: number;
    ClientId: number;
    EIN: string;
    
    // EMPLOYEE/LIVES COUNT (Multiple possible fields)
    EmployeeCount?: number;        // Primary field
    Lives?: number;                // Alternative field
    NumberOfEmployees?: number;    // Another option
    ParticipantCount?: number;     // Plan participants
    
    // Additional Fields
    NAICCode: string;
    PayrollProvider: string;
    PayrollFrequency: object;
    EntityType: object;
    PeriodStart: string;
    PeriodEnd: string;
    FiscalYearEnd: string;
    IsDeactivated: boolean;
  };
  
  // Financial
  AccountBalance: number;
  
  // Metadata
  CreatedOn: string;
  UpdatedOn: string;
  CreatedByContact: object;
  UpdatedByContact: object;
  IsDeactivated: boolean;
}
```

### API Response Structure

```typescript
// Single Client Response
{
  // Client object as defined above
}

// Multiple Clients Response
[
  { /* Client 1 */ },
  { /* Client 2 */ },
  { /* Client 3 */ },
  // ... up to 1000 clients
]

// Error Response
{
  success: false,
  error: "Error description",
  details: "Additional error info"
}
```

---

## 🔧 Configuration Files

### package.json
```json
{
  "name": "healthluminate-pensionpro-proxy",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
```

### railway.json
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## 🚀 Deployment Flow

```
1. CODE REPOSITORY
   ├── server.js
   ├── package.json
   ├── railway.json
   └── execretirement/
       └── pensionpro_test.html

2. GIT PUSH
   └─> Push to GitHub/GitLab

3. RAILWAY DETECTION
   ├─> Detects package.json
   ├─> Detects railway.json
   └─> Initiates build

4. RAILWAY BUILD
   ├─> Installs Node.js
   ├─> Runs npm install
   ├─> Prepares environment
   └─> Reads environment variables

5. RAILWAY DEPLOY
   ├─> Starts server: node server.js
   ├─> Assigns public URL
   ├─> Configures networking
   └─> Monitors health

6. LIVE SERVER
   └─> Available at: https://your-url.up.railway.app
```

---

## 💾 File Structure

```
HealthLuminateSite/
│
├── server.js                          (Main backend server)
├── package.json                       (Node.js config)
├── railway.json                       (Railway config)
│
├── execretirement/
│   ├── pensionpro_test.html          (Test interface)
│   ├── PENSIONPRO_TEST_README.md     (Interface docs)
│   └── PENSIONPRO_ARCHITECTURE.md    (This file)
│
└── Documentation/
    ├── PENSIONPRO_SETUP.md           (Complete setup guide)
    ├── PENSIONPRO_QUICK_START.md     (Quick start guide)
    └── PENSIONPRO_INTEGRATION_SUMMARY.md (Summary)
```

---

## 🎯 Request/Response Examples

### Example 1: Test Connection

**Request:**
```http
GET /api/pensionpro/clients?$top=1 HTTP/1.1
Host: your-url.up.railway.app
```

**Backend Processing:**
```javascript
// Constructs auth header
const authHeader = `${process.env.pensionproapi}|${process.env.pensionpro_name}`;

// Forwards to PensionPro
fetch('https://api.pensionpro.com/v2/clients?$top=1', {
  headers: {
    'Authorization': authHeader
  }
});
```

**Response:**
```json
[
  {
    "Id": 12345,
    "CompanyName": {
      "DisplayName": "Test Company"
    }
  }
]
```

### Example 2: Fetch with Employer Data

**Request:**
```http
GET /api/pensionpro/clients?$top=100&$expand=CurrentEmployerData HTTP/1.1
Host: your-url.up.railway.app
```

**Response:**
```json
[
  {
    "Id": 12345,
    "InternalClientId": "CLIENT001",
    "CompanyName": {
      "DisplayName": "Acme Corporation"
    },
    "CurrentEmployerData": {
      "EIN": "12-3456789",
      "EmployeeCount": 150,
      "PayrollProvider": "ADP"
    },
    "AccountBalance": 2500000
  }
]
```

---

## 🔍 Monitoring & Debugging

### Railway Logs
```
[2025-11-05T12:00:00.000Z] 🚀 PensionPro API Proxy Server Started
[2025-11-05T12:00:01.123Z] GET /api/pensionpro/clients
[2025-11-05T12:00:01.234Z] 🔗 Calling PensionPro API
[2025-11-05T12:00:03.456Z] 📊 PensionPro API Response Status: 200
[2025-11-05T12:00:03.567Z] ✅ Successfully fetched 100 client(s)
```

### Frontend Logs
```
[12:00:00] 🔍 Testing PensionPro API connection...
[12:00:01] Calling PensionPro API: /clients
[12:00:01] Request URL: https://your-url.up.railway.app/api/pensionpro/clients?$top=1
[12:00:03] API call successful. Received 1 record(s)
[12:00:03] ✅ Connection test successful!
```

---

**Last Updated**: November 5, 2025  
**Version**: 1.0.0  
**Author**: HealthLuminate Technical Team





