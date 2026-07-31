# Firebase CRM Setup Guide

This document provides instructions for setting up the Firebase Firestore collections, indexes, and security rules required for the Executive Retirement CRM system.

## Overview

The CRM system uses:
- **Firebase Realtime Database**: Existing client data (`ers/clients`)
- **Firestore**: New collections for activities and document metadata
- **Firebase Storage**: Document file storage

## 1. Firestore Collections

### A. Client Activities Collection

**Collection Name:** `ers_client_activities`

**Document Structure:**
```javascript
{
  clientId: "CL0001",              // References ers/clients customerId
  date: "2026-02-15",              // YYYY-MM-DD format
  type: "Task" | "Call" | "Email" | "Meeting" | "Note",
  subject: "Follow up on proposal",
  content: "<p>Rich text...</p>",  // HTML from Quill editor
  status: "pending" | "completed", // For tasks
  dueDate: "2026-02-20",          // Optional, for tasks
  contacts: [],                    // Array of contact names (optional)
  createdBy: "user@example.com",
  createdByName: "User Name",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archived: false,
  archivedAt: null,
  archivedBy: null,
  completedAt: null                // For tasks
}
```

### B. Client Documents Collection

**Collection Name:** `ers_client_documents`

**Document Structure:**
```javascript
{
  clientId: "CL0001",
  fileName: "Contract_2026.pdf",
  fileUrl: "https://...",          // Download URL from Storage
  storagePath: "ers_client_documents/...", // Full storage path
  fileSize: 1024000,               // Bytes
  fileType: "application/pdf",
  category: "Contract" | "Proposal" | "Correspondence" | "Other",
  uploadedBy: "user@example.com",
  uploadedByName: "User Name",
  uploadedAt: Timestamp,
  notes: "Optional description"
}
```

## 2. Required Firestore Indexes

### Create Composite Indexes

#### For Client Activities
1. **Index 1: Client Activities by Date**
   - Collection: `ers_client_activities`
   - Fields:
     - `clientId` (Ascending)
     - `createdAt` (Descending)
   
2. **Index 2: Client Activities by Type**
   - Collection: `ers_client_activities`
   - Fields:
     - `clientId` (Ascending)
     - `type` (Ascending)
     - `archived` (Ascending)

#### For Client Documents
3. **Index 3: Client Documents by Upload Date**
   - Collection: `ers_client_documents`
   - Fields:
     - `clientId` (Ascending)
     - `uploadedAt` (Descending)

### How to Create Indexes

#### Option 1: Firebase Console (Recommended)
1. Go to Firebase Console → Firestore Database
2. Click on "Indexes" tab
3. Click "Create Index"
4. Add the fields as specified above
5. Click "Create"

#### Option 2: Using firebase.json

Add to your `firebase.json` file:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "ers_client_activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clientId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "ers_client_activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clientId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "archived", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "ers_client_documents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clientId", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Then deploy:
```bash
firebase deploy --only firestore:indexes
```

## 3. Firestore Security Rules

Add these rules to your Firestore security rules file:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated and authorized
    function isAuthorizedUser() {
      return request.auth != null && 
        request.auth.token.email.matches('.*@(execretirement|careluminate|healthluminate)\\.com');
    }
    
    // Client Activities Collection
    match /ers_client_activities/{activityId} {
      // Allow read for all authorized users
      allow read: if isAuthorizedUser();
      
      // Allow create for authorized users
      allow create: if isAuthorizedUser() &&
        request.resource.data.createdBy == request.auth.token.email &&
        request.resource.data.clientId is string;
      
      // Allow update for authorized users (they can edit any activity)
      allow update: if isAuthorizedUser() &&
        request.resource.data.clientId == resource.data.clientId; // Prevent clientId changes
      
      // Allow delete for authorized users
      allow delete: if isAuthorizedUser();
    }
    
    // Client Documents Metadata Collection
    match /ers_client_documents/{documentId} {
      // Allow read for all authorized users
      allow read: if isAuthorizedUser();
      
      // Allow create for authorized users
      allow create: if isAuthorizedUser() &&
        request.resource.data.uploadedBy == request.auth.token.email &&
        request.resource.data.clientId is string &&
        request.resource.data.fileUrl is string;
      
      // Allow update for authorized users (for metadata updates)
      allow update: if isAuthorizedUser() &&
        request.resource.data.clientId == resource.data.clientId && // Prevent clientId changes
        request.resource.data.fileUrl == resource.data.fileUrl; // Prevent URL changes
      
      // Allow delete for authorized users
      allow delete: if isAuthorizedUser();
    }
  }
}
```

### Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

## 4. Firebase Storage Rules

Add these rules to your Storage security rules file:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Helper function to check if user is authenticated and authorized
    function isAuthorizedUser() {
      return request.auth != null && 
        request.auth.token.email.matches('.*@(execretirement|careluminate|healthluminate)\.com');
    }
    
    // Client Documents Storage
    match /ers_client_documents/{clientId}/{filename} {
      // Allow read for authorized users
      allow read: if isAuthorizedUser();
      
      // Allow write (upload) for authorized users
      // Limit file size to 50MB
      allow write: if isAuthorizedUser() &&
        request.resource.size < 50 * 1024 * 1024 &&
        request.resource.contentType.matches('application/pdf|application/msword|application/vnd.*|image/.*|text/.*');
      
      // Allow delete for authorized users
      allow delete: if isAuthorizedUser();
    }
  }
}
```

### Deploy Storage Rules

```bash
firebase deploy --only storage
```

## 5. Testing the Setup

### Test Firestore Collections

1. Open the CRM page: `execretirement/crm.html`
2. Select a client and click "View Details"
3. Go to Activities tab and add a new activity
4. Check Firebase Console → Firestore → `ers_client_activities` to verify the document was created

### Test Document Upload

1. In the CRM client detail modal, go to Documents tab
2. Upload a test file
3. Check Firebase Console → Firestore → `ers_client_documents` for metadata
4. Check Firebase Console → Storage → `ers_client_documents/` for the actual file

### Test Indexes

If queries fail with "requires an index" error:
1. Click the provided link in the error message
2. Or manually create the index in Firebase Console

### Test Security Rules

1. Try accessing as an unauthorized email domain (should fail)
2. Try creating an activity with wrong `createdBy` field (should fail)
3. Try changing `clientId` on update (should fail)

## 6. Monitoring and Maintenance

### Monitor Usage
- Firestore: Firebase Console → Firestore → Usage tab
- Storage: Firebase Console → Storage → Usage tab

### Backup Strategy
- Firestore supports automated backups (requires Blaze plan)
- Export data periodically using Firebase CLI:
  ```bash
  firebase firestore:export gs://your-bucket/backups/$(date +%Y%m%d)
  ```

### Cost Optimization
- Enable TTL policies for old archived activities (optional)
- Compress large documents before upload
- Monitor read/write operations in Firebase Console

## 7. Troubleshooting

### "Missing or insufficient permissions" Error
- Check that user email matches authorized domains in security rules
- Verify user is authenticated (check browser console)
- Check Firebase Console → Authentication to see active users

### "Requires an index" Error
- Follow the link provided in the error to create the index automatically
- Or manually create using instructions in Section 2

### Documents Not Uploading
- Check file size (must be < 50MB)
- Verify file type is allowed in storage rules
- Check browser console for detailed error messages
- Verify Storage rules are deployed

### Activities Not Loading
- Check that composite indexes are created
- Verify Firestore rules are deployed
- Check browser console for query errors

## 8. Additional Configuration

### Email Notifications (Optional Enhancement)

You can add Firebase Cloud Functions to send email notifications:

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.notifyOnActivityCreate = functions.firestore
  .document('ers_client_activities/{activityId}')
  .onCreate(async (snap, context) => {
    const activity = snap.data();
    
    // Send email notification logic here
    // Use SendGrid, Mailgun, or Firebase Extensions
    
    console.log('New activity created:', activity.subject);
  });
```

## Summary Checklist

- [ ] Create Firestore collections (automatic on first use)
- [ ] Create composite indexes for queries
- [ ] Deploy Firestore security rules
- [ ] Deploy Storage security rules
- [ ] Test activity creation and retrieval
- [ ] Test document upload and download
- [ ] Verify security rules prevent unauthorized access
- [ ] Monitor usage and set up billing alerts
- [ ] Document any custom modifications for your team

## Support

For issues or questions:
1. Check Firebase Console logs
2. Review browser console for client-side errors
3. Check Firestore query performance in console
4. Contact Firebase support for infrastructure issues
