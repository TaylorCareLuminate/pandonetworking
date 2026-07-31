# Firebase Storage CORS Configuration Instructions

## The Problem
Firebase Storage is blocking uploads from your domain (healthluminate.com) due to CORS (Cross-Origin Resource Sharing) policy.

## Solution: Configure CORS for Firebase Storage

### Option 1: Using Google Cloud Console (Easiest)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project: `healthcareitdatabase`

2. **Navigate to Cloud Storage**
   - In the left menu, go to "Storage" → "Browser"
   - You should see your bucket: `healthcareitdatabase.appspot.com`

3. **Open Cloud Shell**
   - Click the terminal icon (>_) in the top right corner
   - This opens Google Cloud Shell

4. **Create CORS configuration**
   - In Cloud Shell, run:
   ```bash
   echo '[
     {
       "origin": ["https://healthluminate.com", "https://www.healthluminate.com", "http://localhost:*"],
       "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
     }
   ]' > cors.json
   ```

5. **Apply CORS configuration**
   - Run this command:
   ```bash
   gsutil cors set cors.json gs://healthcareitdatabase.appspot.com
   ```

6. **Verify CORS is applied**
   - Run:
   ```bash
   gsutil cors get gs://healthcareitdatabase.appspot.com
   ```

### Option 2: Using Local Terminal (Requires gcloud CLI)

If you have Google Cloud SDK installed locally:

1. **Save the cors-config.json file** (already created in your project)

2. **Open terminal in the project directory**

3. **Login to Google Cloud**
   ```bash
   gcloud auth login
   ```

4. **Set your project**
   ```bash
   gcloud config set project healthcareitdatabase
   ```

5. **Apply CORS configuration**
   ```bash
   gsutil cors set cors-config.json gs://healthcareitdatabase.appspot.com
   ```

### Option 3: Quick Fix in Firebase Console

While waiting for CORS setup, you can temporarily use this approach:

1. **Update Storage Rules** to be more permissive (temporarily):
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if true; // TEMPORARY - CHANGE BACK AFTER TESTING
       }
     }
   }
   ```

2. **Test if uploads work**

3. **Change back to secure rules** once CORS is properly configured

## Verification

After setting up CORS, test by:
1. Refreshing your tracking.html page
2. Trying to upload a document
3. Check console for errors

## Common Issues

### Issue: "Permission denied" error
- Make sure you're logged into the correct Google account
- Ensure you have admin access to the Firebase project

### Issue: "Bucket not found"
- Double-check the bucket name: `healthcareitdatabase.appspot.com`
- Make sure you're in the correct project

### Issue: Still getting CORS errors
- Clear browser cache
- Try incognito/private browsing mode
- Wait 5-10 minutes for CORS changes to propagate

## Additional Notes

- CORS configuration allows your domain to upload files to Firebase Storage
- The configuration includes localhost for development
- maxAgeSeconds (3600) means browsers cache CORS headers for 1 hour
- responseHeader includes headers needed for resumable uploads

## Need More Help?

If you're still having issues:
1. Check Firebase Console → Storage for any error messages
2. Verify your domain in Firebase Console → Authentication → Settings → Authorized domains
3. Check browser console for specific error messages 