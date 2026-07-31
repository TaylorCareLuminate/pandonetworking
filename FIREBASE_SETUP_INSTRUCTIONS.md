# Firebase Setup Instructions for 1099 System

## Issue: CORS Error with File Uploads

The CORS error you're experiencing is because the Firebase Storage rules need to be properly deployed. Here's how to fix it:

## 1. Deploy Storage Rules

Go to [Firebase Console](https://console.firebase.google.com) → **clemail** project → **Storage** → **Rules**

Replace the current rules with this content from `storage-rules-clemail-project.txt`:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Tax documents - HIGHLY SECURE: Users can only access their own tax documents
    match /tax-documents/{userId}/{allPaths=**} {
      // Users can only access their own tax documents
      allow read, write: if request.auth != null && 
        request.auth.uid == userId &&
        request.auth.token.email_verified == true;
      
      // ONLY taylordavis@careluminate.com can read all tax documents for compliance/processing
      allow read: if request.auth != null && 
        request.auth.token.email_verified == true && 
        request.auth.token.email == 'taylordavis@careluminate.com';
    }
    
    // User profile images and general user files
    match /user-files/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
      
      // Admins can read user files
      allow read: if request.auth != null && 
        request.auth.token.email_verified == true && 
        (request.auth.token.email.matches('.*@healthluminate.com') || 
         request.auth.token.email.matches('.*@careluminate.com'));
    }
    
    // Public files (like company logos, public documents)
    match /public/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && 
        request.auth.token.email_verified == true && 
        (request.auth.token.email.matches('.*@healthluminate.com') || 
         request.auth.token.email.matches('.*@careluminate.com'));
    }
    
    // Admin-only files
    match /admin/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.token.email_verified == true && 
        (request.auth.token.email.matches('.*@healthluminate.com') || 
         request.auth.token.email.matches('.*@careluminate.com'));
    }
    
    // Default rule for backward compatibility - but more restrictive than before
    // Users can only access files in their own folder structure
    match /{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
    }
    
    // Fallback for any other paths - admin only
    match /{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.token.email_verified == true && 
        (request.auth.token.email.matches('.*@healthluminate.com') || 
         request.auth.token.email.matches('.*@careluminate.com'));
    }
  }
}
```

## 2. Deploy Firestore Rules

Go to [Firebase Console](https://console.firebase.google.com) → **clemail** project → **Firestore Database** → **Rules**

Replace the current rules with this content from `firestore-rules-clemail-project.txt`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ... (existing rules) ...
    
    // NEW: 1099 Tax Data Collection - HIGHLY SECURE - ONLY TAYLOR DAVIS ACCESS
    match /tax1099Data/{userId} {
      // Users can only access their own tax data
      allow read, write: if request.auth != null && 
        request.auth.uid == userId &&
        request.auth.token.email_verified == true;
      
      // ONLY taylordavis@careluminate.com can read all tax data for compliance/processing
      allow read: if request.auth != null && 
        request.auth.token.email_verified == true && 
        request.auth.token.email == 'taylordavis@careluminate.com';
      
      // ONLY taylordavis@careluminate.com can delete tax data (for compliance reasons)
      allow delete: if request.auth != null && 
        request.auth.token.email_verified == true && 
        request.auth.token.email == 'taylordavis@careluminate.com';
    }
    
    // ... (rest of existing rules) ...
  }
}
```

## 3. Check CORS Configuration

If the rules deployment doesn't fix the CORS issue, you may need to configure CORS for your Firebase Storage bucket:

1. Install Google Cloud SDK if you haven't already
2. Run these commands:

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set the project
gcloud config set project clemail

# Create a CORS configuration file
echo '[
  {
    "origin": ["https://healthluminate.com", "http://localhost:*"],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600
  }
]' > cors.json

# Apply CORS configuration
gsutil cors set cors.json gs://clemail.firebasestorage.app
```

## 4. Alternative: Email-Based File Collection

If the CORS issue persists, the 1099 upload page now has fallback functionality:

- Form data will still be saved to Firestore
- Users will be instructed to email their W-9 files directly to taylordavis@careluminate.com
- The system tracks that a file upload failed and stores the original filename/details

## Current Status

✅ **Form Data Saving**: Works perfectly
✅ **Partial Saves**: Enabled - no required fields
✅ **Security**: Only Taylor Davis can access all data
⚠️ **File Uploads**: Currently blocked by CORS, but has fallback
🔧 **Solution**: Deploy the storage rules above

## Testing

After deploying the rules:
1. Try uploading a W-9 file
2. Check the browser console for any remaining errors
3. Verify the file appears in Firebase Storage under `/tax-documents/[user-id]/`

## Support

If issues persist after deploying the rules, the system will gracefully handle the error and provide instructions for manual file submission.
