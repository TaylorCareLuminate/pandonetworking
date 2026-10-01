// HealthLuminate Folder Protection System
// Version: 1.2.0 - Wait for Firebase's initial auth report; IndexedDB-aware session check
// This utility provides centralized folder access control
console.log('🔒 Folder protection system loading (v1.2.0 - authStateReady)...');

// Helper function to extract domain from email
function getDomainFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.split('@')[1]?.toLowerCase() || '';
}

// Admin domains that always have access
const ADMIN_DOMAINS = ['healthluminate.com', 'careluminate.com'];

// Check if a domain is an admin domain
function isAdminDomain(domain) {
  return ADMIN_DOMAINS.includes(domain.toLowerCase());
}

// Main folder access checking function
async function checkFolderAccess(folderName, userEmail = null, options = {}) {
  try {
    console.log(`🔍 Checking folder access for: ${folderName}`);
    
    // Get user email from various sources
    let email = userEmail;
    if (!email && window.auth?.currentUser?.email) {
      email = window.auth.currentUser.email;
    }
    if (!email && window.getCurrentAuthState) {
      const authState = window.getCurrentAuthState();
      email = authState.user?.email;
    }
    
    if (!email) {
      console.error('❌ No user email available for folder access check');
      return false;
    }
    
    const userDomain = getDomainFromEmail(email);
    console.log(`👤 User: ${email} (${userDomain})`);
    
    // Admin domains always have access
    if (isAdminDomain(userDomain)) {
      console.log('✅ Admin domain access granted');
      return true;
    }
    
    // Check if Firebase is available
    if (!window.firebaseApp || !window.db) {
      console.error('❌ Firebase not available for folder permission check');
      
      // Fallback behavior based on options
      if (options.allowOnError) {
        console.warn('⚠️ Allowing access due to Firebase unavailability (allowOnError=true)');
        return true;
      } else {
        console.warn('⚠️ Denying access due to Firebase unavailability');
        return false;
      }
    }
    
    // Get folder permissions from Firestore
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const folderDoc = await getDoc(doc(window.db, 'folderPermissions', folderName));
    
    if (!folderDoc.exists()) {
      console.warn(`⚠️ No folder permissions found for: ${folderName}`);
      
      // Fallback behavior based on options
      if (options.allowOnMissing) {
        console.warn('⚠️ Allowing access due to missing folder permissions (allowOnMissing=true)');
        return true;
      } else {
        console.warn('⚠️ Denying access due to missing folder permissions');
        return false;
      }
    }
    
    const folderData = folderDoc.data();
    const allowedDomains = folderData.allowedDomains || [];
    const allowedEmails = folderData.allowedEmails || [];
    
    console.log(`📋 Folder permissions for ${folderName}:`, {
      allowedDomains,
      allowedEmails: allowedEmails.map(e => e.replace(/(.{2}).*(@.*)/, '$1***$2')) // Mask emails in logs for privacy
    });
    
    // Check if user has access via domain or specific email
    const hasDomainAccess = allowedDomains.includes('*') || allowedDomains.includes(userDomain);
    const hasEmailAccess = allowedEmails.includes(email.toLowerCase());
    const hasAccess = hasDomainAccess || hasEmailAccess;
    
    if (hasEmailAccess) {
      console.log(`✅ Access granted for ${email} via individual email permission`);
    } else if (hasDomainAccess) {
      console.log(`✅ Access granted for ${email} via domain permission (${userDomain})`);
    } else {
      console.log(`❌ Access denied for ${email} - not in allowed domains or emails`);
    }
    
    return hasAccess;
    
  } catch (error) {
    console.error('❌ Error checking folder access:', error);
    
    // Fallback behavior based on options
    if (options.allowOnError) {
      console.warn('⚠️ Allowing access due to error (allowOnError=true)');
      return true;
    } else {
      console.warn('⚠️ Denying access due to error');
      return false;
    }
  }
}

// Ensure protected content is revealed only after a decision (allow or deny)
function unhideProtectedContent() {
  try {
    const htmlEl = document.documentElement;
    if (htmlEl && htmlEl.classList && htmlEl.classList.contains('protection-hide')) {
      htmlEl.classList.remove('protection-hide');
    }
  } catch (e) {
    // No-op; best effort to reveal content or denied UI
  }
}

// Show access denied page
function showAccessDenied(folderName, userEmail = null, customMessage = null) {
  console.log(`🚫 Showing access denied for folder: ${folderName}`);
  
  const email = userEmail || window.auth?.currentUser?.email || 'unknown';
  const domain = getDomainFromEmail(email);
  // Reveal the page so the denied UI is visible
  unhideProtectedContent();
  
  document.body.innerHTML = `
    <div style="
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    ">
      <div style="
        background: white;
        padding: 3rem;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        text-align: center;
        max-width: 600px;
        width: 100%;
      ">
        <div style="
          background: #ff6b6b;
          color: white;
          padding: 1rem;
          border-radius: 50%;
          width: 80px;
          height: 80px;
          margin: 0 auto 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        ">
          <i class="fas fa-shield-alt"></i>
        </div>
        
        <h2 style="
          color: #2c3e50;
          margin-bottom: 1rem;
          font-size: 2rem;
          font-weight: 600;
        ">
          Access Restricted
        </h2>
        
        <p style="
          color: #666;
          font-size: 1.1rem;
          line-height: 1.6;
          margin-bottom: 2rem;
        ">
          ${customMessage || `You don't have permission to access the <strong>${folderName}</strong> section.`}
        </p>
        
        <div style="
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 10px;
          margin-bottom: 2rem;
          border-left: 4px solid #44A1C4;
        ">
          <div style="color: #666; font-size: 0.9rem; margin-bottom: 0.5rem;">
            <strong>Your Account:</strong>
          </div>
          <div style="color: #2c3e50; font-weight: 600;">
            ${email}
          </div>
          <div style="color: #666; font-size: 0.9rem; margin-top: 0.5rem;">
            Domain: <strong>${domain}</strong>
          </div>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button onclick="window.location.href='/dashboard.html'" style="
            background: #44A1C4;
            color: white;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
          " onmouseover="this.style.background='#369bb8'" onmouseout="this.style.background='#44A1C4'">
            <i class="fas fa-dashboard"></i> Dashboard
          </button>
          
          <button onclick="window.location.href='/'" style="
            background: #DBA660;
            color: white;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
          " onmouseover="this.style.background='#c89a4e'" onmouseout="this.style.background='#DBA660'">
            <i class="fas fa-home"></i> Home
          </button>
          
          <button onclick="window.location.href='/contact.html'" style="
            background: #68C2A2;
            color: white;
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
          " onmouseover="this.style.background='#5bb89a'" onmouseout="this.style.background='#68C2A2'">
            <i class="fas fa-envelope"></i> Contact
          </button>
        </div>
        
        <div style="
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid #eee;
          color: #666;
          font-size: 0.9rem;
        ">
          Need access? Contact your administrator or 
          <a href="mailto:support@healthluminate.com" style="color: #44A1C4; text-decoration: none;">
            support@healthluminate.com
          </a>
        </div>
      </div>
    </div>
  `;
}

// Protect a folder - call this function to check access and redirect if needed
async function protectFolder(folderName, options = {}) {
  const defaults = {
    allowOnError: false,
    allowOnMissing: false,
    customMessage: null,
    requireAuth: true,
    maxAuthWaitTime: 10000,       // Wait up to 10 seconds for the Firebase SDK object to exist
    maxAuthStateWaitTime: 45000   // Wait up to 45 seconds for Firebase's FIRST auth state report
  };
  
  const opts = { ...defaults, ...options };
  
  console.log(`🛡️ Protecting folder: ${folderName}`);
  
  // CRITICAL FIX: Wait for Firebase to be fully ready before checking auth
  // This prevents race conditions when navigating between pages
  if (window.firebaseReady) {
    console.log('⏳ Waiting for Firebase to be ready...');
    try {
      await Promise.race([
        window.firebaseReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase ready timeout')), opts.maxAuthWaitTime))
      ]);
      console.log('✅ Firebase is ready');
    } catch (error) {
      console.warn('⚠️ Firebase ready timeout, proceeding with auth check');
    }
  }
  
  // Check if authentication is required and user is authenticated
  if (opts.requireAuth) {
    // Wait for Firebase to report its INITIAL auth state. auth.currentUser is
    // null until the SDK finishes restoring the saved session (IndexedDB read +
    // token refresh / accounts:lookup over the network), which normally takes
    // <1s but can take 30-60s on a bad connection. Polling auth.currentUser and
    // giving up after N seconds (what v1.1 did) cannot tell "logged out" apart
    // from "still restoring", and kicked valid users to the login page.
    let initialStateResolved = false;
    if (window.auth && window.auth.currentUser) {
      initialStateResolved = true;
    } else if (window.authStateReady) {
      console.log('⏳ Waiting for Firebase to report its initial auth state...');
      const TIMEOUT = {};
      const outcome = await Promise.race([
        window.authStateReady,
        new Promise(resolve => setTimeout(() => resolve(TIMEOUT), opts.maxAuthStateWaitTime))
      ]);
      initialStateResolved = outcome !== TIMEOUT;
      console.log(initialStateResolved
        ? `✅ Firebase reported initial auth state (${window.auth?.currentUser ? 'signed in' : 'no user'})`
        : `⚠️ Firebase has not reported any auth state after ${Math.round(opts.maxAuthStateWaitTime / 1000)}s`);
    } else {
      // Older auth.js without authStateReady — legacy short poll
      for (let i = 0; i < 20 && !(window.auth && window.auth.currentUser); i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      initialStateResolved = !!(window.auth && window.auth.currentUser);
    }

    if (!window.auth || !window.auth.currentUser) {
      // auth.js's 12-hour ultra-protection may be holding the user as logged in
      // across a token-refresh hiccup — respect it.
      const authJsState = window.getCurrentAuthState?.();
      if (authJsState?.isLoggedIn) {
        console.log('🛡️ Folder protection: auth.js considers user still logged in (token refresh cycle) — revealing content');
        unhideProtectedContent();
        return true;
      }

      if (!initialStateResolved) {
        // Firebase never answered. We cannot distinguish "logged out" from "SDK
        // stalled", so do NOT redirect — a redirect here is exactly how signed-in
        // users were getting kicked out. Reveal the page; page-level handlers
        // (and auth.js) take over once Firebase finally responds.
        console.warn('⚠️ Folder protection: Firebase auth state unresolved — NOT redirecting (cannot tell logged-out from a stalled SDK). Revealing content.');
        unhideProtectedContent();
        return true;
      }

      // Firebase explicitly reported "no user". Last check: is there still a saved
      // session on this device (IndexedDB since auth.js v1.5, localStorage before)?
      // If so this is a transient glitch (e.g. restore raced a cross-tab event) and
      // Firebase will bring the user back — don't kick them out.
      let persisted = null;
      if (window.hasPersistedFirebaseUser) {
        persisted = await window.hasPersistedFirebaseUser();
      } else {
        try { persisted = Object.keys(localStorage).some(k => k.startsWith('firebase:authUser')); } catch (_) { persisted = null; }
      }
      if (persisted === true) {
        console.warn('⚠️ Saved Firebase session found but auth.currentUser is null — waiting 3s for restore...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (!(window.auth && window.auth.currentUser)) {
          console.log('🛡️ Still restoring — revealing content without redirect');
          unhideProtectedContent();
          return true;
        }
        console.log('✅ auth.currentUser restored — continuing with folder access check');
      } else {
        console.log('🔒 Firebase reports no user and no saved session exists — redirecting to login');
        if (window.redirectToLogin) {
          window.redirectToLogin(`You must be logged in to access ${folderName}.`);
        } else {
          window.location.href = '/login.html';
        }
        return false;
      }
    }
    
    // Check if user is verified (check both Firebase and manual verification)
    const currentAuthState = window.getCurrentAuthState ? window.getCurrentAuthState() : null;
    const isVerified = window.auth.currentUser.emailVerified || 
                       (currentAuthState && currentAuthState.manuallyVerified);
    
    if (!isVerified) {
      console.log('✉️ User email not verified, redirecting to login');
      if (window.redirectToLogin) {
        window.redirectToLogin(`Please verify your email to access ${folderName}.`);
      } else {
        window.location.href = '/login.html';
      }
      return false;
    }
  }
  
  // Check folder access
  const hasAccess = await checkFolderAccess(folderName, null, opts);
  
  if (!hasAccess) {
    showAccessDenied(folderName, null, opts.customMessage);
    return false;
  }
  
  // Access granted; reveal protected content
  unhideProtectedContent();
  
  return true;
}

// Auto-protect based on URL path
function autoProtectFromPath() {
  const path = window.location.pathname;
  const segments = path.split('/').filter(s => s.length > 0);
  
  if (segments.length > 0) {
    const folderName = segments[0];
    
    // Only auto-protect known folders
    const protectedFolders = [
      'admin', 'kba', 'crm', 'connect', 'healthtalent', 'hospitalpages', 
      'healthsystempages', 'ppchighspringhotsheets', 'vasion', 'team', 'demos'
    ];
    
    if (protectedFolders.includes(folderName)) {
      console.log(`🔍 Auto-protecting folder: ${folderName}`);
      protectFolder(folderName, { allowOnError: true });
    }
  }
}

// Expose functions globally
window.checkFolderAccess = checkFolderAccess;
window.showAccessDenied = showAccessDenied;
window.protectFolder = protectFolder;
window.autoProtectFromPath = autoProtectFromPath;
window.getDomainFromEmail = getDomainFromEmail;
window.isAdminDomain = isAdminDomain;
window.unhideProtectedContent = unhideProtectedContent;

// Wait for Firebase to be ready, then auto-protect if needed
if (window.firebaseReady) {
  window.firebaseReady.then(() => {
    console.log('🔥 Firebase ready, folder protection system active');
    
    // Check if auto-protect should be skipped
    if (window._skipAutoProtect) {
      console.log('🔍 Auto-protect skipped for this page');
      return;
    }
    
    // Auto-protect based on URL if not already protected
    if (!window.location.pathname.includes('/login.html')) {
      autoProtectFromPath();
    }
  });
} else {
  console.log('⚠️ Firebase not available, folder protection limited');
}

console.log('🔒 Folder protection system loaded');