# Fix CORS Issue for Firebase Storage

## The Problem
The CORS error occurs because Google Cloud Storage (which Firebase Storage uses) doesn't allow requests from `healthluminate.com` by default. This is a browser security policy, separate from Firebase Storage rules.

## Solution: Configure CORS

You need to configure CORS for your Firebase Storage bucket using Google Cloud SDK.

### Step 1: Install Google Cloud SDK

1. Go to [Google Cloud SDK installer](https://cloud.google.com/sdk/docs/install)
2. Download and install the Windows version
3. Restart your command prompt/PowerShell

### Step 2: Authenticate and Configure

Open PowerShell or Command Prompt and run these commands:

```bash
# Authenticate with Google Cloud (this will open a browser)
gcloud auth login

# Set the project to your Firebase project
gcloud config set project clemail

# Verify the project is set correctly
gcloud config get-value project
```

### Step 3: Create CORS Configuration File

Create a file called `cors.json` with this content:

```json
[
  {
    "origin": ["https://healthluminate.com", "http://localhost:*", "https://localhost:*"],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization"]
  }
]
```

### Step 4: Apply CORS Configuration

```bash
# Apply the CORS configuration to your Firebase Storage bucket
gsutil cors set cors.json gs://clemail.firebasestorage.app

# Verify the CORS configuration was applied
gsutil cors get gs://clemail.firebasestorage.app
```

### Step 5: Test

After applying the CORS configuration:
1. Wait 2-3 minutes for changes to propagate
2. Try uploading a file again on your 1099 page
3. The CORS error should be resolved

## Alternative: Quick Fix Commands

If you have Google Cloud SDK installed, just run these commands:

```bash
# Create the CORS file
echo '[{"origin": ["https://healthluminate.com", "http://localhost:*"], "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "maxAgeSeconds": 3600}]' > cors.json

# Apply CORS
gsutil cors set cors.json gs://clemail.firebasestorage.app
```

## If Google Cloud SDK Installation Fails

If you can't install Google Cloud SDK, here are alternative solutions:

### Option A: Use Firebase CLI
```bash
# Install Firebase CLI (if you don't have it)
npm install -g firebase-tools

# Login to Firebase
firebase login

# This won't directly fix CORS, but you can manage some storage settings
firebase use clemail
```

### Option B: Contact Google Support
You can contact Firebase support to configure CORS for your bucket.

### Option C: Use the Fallback System
The 1099 page already has a fallback system in place:
- Form data will save successfully
- Users will be instructed to email W-9 files directly
- This is a perfectly viable temporary solution

## Expected Result

After configuring CORS, you should see:
- ✅ File uploads work without CORS errors
- ✅ Files appear in Firebase Storage under `/tax-documents/[user-id]/`
- ✅ No more browser console errors

## Verification

To verify CORS is working:
1. Open browser developer tools
2. Go to Network tab
3. Try uploading a file
4. Look for successful POST requests to `firebasestorage.googleapis.com`
5. No CORS errors should appear in console

## Need Help?

If you encounter issues with Google Cloud SDK installation or commands, the fallback system in the 1099 page will continue to work perfectly for collecting tax information via email.
