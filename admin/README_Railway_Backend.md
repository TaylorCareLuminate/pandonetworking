# Railway Backend Integration Guide - CLEmail System

## 🎯 Overview

This guide explains how the Railway backend should integrate with the HealthLuminate email system. The frontend email controls have been configured to use the **CLEmail Firebase project** for storing email account data and settings.

## 🔧 Firebase Configuration

### **IMPORTANT: Use CLEmail Firebase Project**

The Railway backend must connect to the **CLEmail** Firebase project, NOT the main HealthLuminate project.

```javascript
// Correct Firebase Configuration for Railway Backend
const firebaseConfig = {
  apiKey: "AIzaSyDGESh2UQT4awIg9Y3kBcZPN-aaWthC1k4",
  authDomain: "clemail.firebaseapp.com",
  databaseURL: "https://clemail-default-rtdb.firebaseio.com",
  projectId: "clemail",
  storageBucket: "clemail.firebasestorage.app",
  messagingSenderId: "762477610174",
  appId: "1:762477610174:web:8547f62e6d9f3b819acaef",
  measurementId: "G-EFW8G912Y7"
};
```

## 📊 Data Structure & Collections

### **1. Global Email Settings**
- **Collection**: `emailSettings`
- **Document**: `global`
- **Full Path**: `emailSettings/global`

```typescript
interface GlobalSettings {
  emailSendingEnabled: boolean;           // Master toggle for all email sending
  defaultSendingHours: {                  // Default sending time window
    start: string;                        // "09:00" format
    end: string;                          // "17:00" format
  };
  defaultTimeBetweenSends: number;        // Seconds between sends (default: 300)
  defaultMaxSendsPerHour: number;         // Max emails per hour (default: 10)
  defaultMaxSendsPerDay: number;          // Max emails per day (default: 100)
  defaultTimezone: string;                // "America/New_York" format
  createdAt: Date;
  updatedAt: Date;
}
```

### **2. Email Accounts**
- **Collection**: `emailAccounts`
- **Documents**: `account_[timestamp]` (one per account)
- **Full Path**: `emailAccounts/account_1234567890`

```typescript
interface EmailAccount {
  id: string;                             // Unique account identifier (UUID)
  name: string;                           // Display name (e.g., "Marketing Team")
  email: string;                          // Email address
  
  smtpConfig: {
    host: string;                         // SMTP server (e.g., "smtp.gmail.com")
    port: number;                         // Port (465 for SSL, 587 for TLS)
    secure: boolean;                      // Use SSL/TLS
    auth: {
      user: string;                       // SMTP username
      pass: string;                       // SMTP password/app password
    };
  };
  
  imapConfig: {
    host: string;                         // IMAP server (e.g., "imap.gmail.com")
    port: number;                         // Port (993 for SSL, 143 for plain)
    tls: boolean;                         // Use TLS
    auth: {
      user: string;                       // IMAP username
      pass: string;                       // IMAP password/app password
    };
  };
  
  settings: {
    enabled: boolean;                     // Account enabled/disabled
    sendingHours: {
      start: string;                      // "09:00" format
      end: string;                        // "17:00" format
    };
    maxSendsPerHour: number;              // Account-specific limit
    maxSendsPerDay: number;               // Account-specific limit
    timeBetweenSends: number;             // Seconds between sends for this account
    timezone: string;                     // Account timezone
  };
  
  signature: {
    html: string;                         // HTML signature
    text: string;                         // Text signature
  };
  
  usage: {
    totalSent: number;                    // Total emails sent from this account
    sentToday: number;                    // Emails sent today
    sentThisHour: number;                 // Emails sent this hour
    lastSentAt: Date;                     // Last email timestamp
    lastUsedAt: Date;                     // Last time account was used
  };
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;                      // User email who created the account
}
```

### **3. Scheduled Emails** (For Railway to Create/Monitor)
- **Collection**: `scheduledEmails`
- **Document**: Auto-generated ID
- **Full Path**: `scheduledEmails/[emailId]`

```typescript
interface ScheduledEmail {
  id: string;                             // Unique email ID
  accountId: string;                      // Reference to emailAccounts document
  
  emailData: {
    to: string;                           // Recipient email
    from: string;                         // Sender email (matches account)
    fromName: string;                     // Sender display name
    subject: string;                      // Email subject
    html: string;                         // HTML content
    text: string;                         // Plain text content
    replyTo?: string;                     // Reply-to address
  };
  
  scheduling: {
    scheduledFor: Date;                   // When to send the email
    priority: number;                     // 1-10 priority (higher = send first)
    timezone: string;                     // Timezone for scheduling
    campaignId?: string;                  // Optional campaign reference
  };
  
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  
  attempts: {
    count: number;                        // Number of send attempts
    lastAttempt?: Date;                   // Last attempt timestamp
    errors?: string[];                    // Any error messages
  };
  
  metadata: {
    createdBy: string;                    // User who scheduled the email
    createdAt: Date;
    sentAt?: Date;                        // When email was actually sent
    updatedAt: Date;
  };
}
```

## 🔄 Railway Backend Integration Points

### **1. Email Account Retrieval**
The Railway backend should periodically fetch active email accounts:

```javascript
// Fetch all enabled email accounts
const accountsSnapshot = await db.collection('emailAccounts')
  .where('settings.enabled', '==', true)
  .get();

const activeAccounts = accountsSnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

### **2. Global Settings Check**
Before sending any emails, check if email sending is globally enabled:

```javascript
// Check global settings
const globalSettingsDoc = await db.collection('emailSettings').doc('global').get();
const globalSettings = globalSettingsDoc.data();

if (!globalSettings.emailSendingEnabled) {
  console.log('Email sending is globally disabled');
  return;
}
```

### **3. Scheduled Email Processing**
The Railway backend should process scheduled emails:

```javascript
// Fetch emails ready to send
const now = new Date();
const readyEmailsSnapshot = await db.collection('scheduledEmails')
  .where('status', '==', 'pending')
  .where('scheduling.scheduledFor', '<=', now)
  .orderBy('scheduling.scheduledFor')
  .orderBy('scheduling.priority', 'desc')
  .limit(50)
  .get();
```

### **4. Rate Limiting Logic**
Respect both global and account-specific rate limits:

```javascript
// Check if account can send (simplified logic)
function canAccountSendNow(account, globalSettings) {
  const now = new Date();
  const currentHour = now.getHours();
  const accountSettings = account.settings;
  
  // Check sending hours
  const startHour = parseInt(accountSettings.sendingHours.start.split(':')[0]);
  const endHour = parseInt(accountSettings.sendingHours.end.split(':')[0]);
  
  if (currentHour < startHour || currentHour >= endHour) {
    return false;
  }
  
  // Check hourly and daily limits
  if (account.usage.sentThisHour >= accountSettings.maxSendsPerHour) {
    return false;
  }
  
  if (account.usage.sentToday >= accountSettings.maxSendsPerDay) {
    return false;
  }
  
  // Check time between sends
  const timeSinceLastSend = now - new Date(account.usage.lastSentAt);
  if (timeSinceLastSend < (accountSettings.timeBetweenSends * 1000)) {
    return false;
  }
  
  return true;
}
```

### **5. Usage Tracking**
Update account usage after sending emails:

```javascript
// Update account usage after successful send
async function updateAccountUsage(accountId) {
  const now = new Date();
  
  await db.collection('emailAccounts').doc(accountId).update({
    'usage.totalSent': admin.firestore.FieldValue.increment(1),
    'usage.sentToday': admin.firestore.FieldValue.increment(1),
    'usage.sentThisHour': admin.firestore.FieldValue.increment(1),
    'usage.lastSentAt': now,
    'usage.lastUsedAt': now,
    'updatedAt': now
  });
}
```

## 🚀 Railway API Endpoints

### **Current Endpoint**: 
```
POST https://railwayclemail-production.up.railway.app/schedule-email
```

### **Expected Request Format**:
```typescript
interface ScheduleEmailRequest {
  accountId: string;                      // Must match emailAccounts document ID
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  scheduledFor?: string;                  // ISO date string, defaults to now
  priority?: number;                      // 1-10, defaults to 5
  campaignId?: string;                    // Optional campaign reference
}
```

### **Expected Response Format**:
```typescript
interface ScheduleEmailResponse {
  success: boolean;
  emailId?: string;                       // Generated scheduled email ID
  scheduledFor?: string;                  // When email will be sent
  message: string;
  error?: string;
}
```

## 🛠️ Daily Reset Logic

The Railway backend should reset daily counters at midnight in each timezone:

```javascript
// Reset daily counters (run as scheduled job)
async function resetDailyCounters() {
  const accountsSnapshot = await db.collection('emailAccounts').get();
  
  const batch = db.batch();
  
  accountsSnapshot.docs.forEach(doc => {
    const accountRef = db.collection('emailAccounts').doc(doc.id);
    batch.update(accountRef, {
      'usage.sentToday': 0,
      'updatedAt': new Date()
    });
  });
  
  await batch.commit();
}
```

## 🔍 Monitoring & Logging

### **Key Metrics to Track**:
- Total emails sent per account
- Success/failure rates
- Rate limiting events
- Account usage patterns
- Queue length and processing time

### **Error Handling**:
- Invalid account IDs
- SMTP authentication failures
- Rate limit exceeded
- Invalid email data
- Firestore connection issues

## 🚨 Important Notes

1. **Project Separation**: The Railway backend MUST use the CLEmail project, not the main HealthLuminate project
2. **Authentication**: Railway backend needs Firebase Admin SDK credentials for the CLEmail project
3. **Timezone Handling**: Respect individual account timezones for sending hours
4. **Signature Integration**: Automatically append account signatures to emails
5. **Error Recovery**: Failed emails should be retried with exponential backoff
6. **Security**: Never log SMTP passwords or sensitive credentials

## 📋 Testing Checklist

- [ ] Railway backend connects to CLEmail Firebase project
- [ ] Can read global settings from `emailSettings/global`
- [ ] Can read email accounts from `emailAccounts` collection
- [ ] Can create scheduled emails in `scheduledEmails` collection
- [ ] Respects rate limiting (global and per-account)
- [ ] Updates usage statistics after sending
- [ ] Handles SMTP authentication correctly
- [ ] Processes email queue in priority order
- [ ] Integrates signatures properly
- [ ] Handles timezone differences correctly

## 🤝 Frontend Integration

The frontend email controls page at `/admin/email_controls.html` provides:
- Account management (CRUD operations)
- Global settings configuration  
- Test email functionality
- Usage monitoring and statistics
- Signature management

The Railway backend should work seamlessly with the data created by this frontend interface.

---

**Last Updated**: January 2025  
**Firebase Project**: clemail  
**Railway Endpoint**: https://railwayclemail-production.up.railway.app/schedule-email 