// HealthLuminate Folder Protection System
// Version: 1.1.0 - Fixed cross-folder navigation race conditions
// This utility provides centralized folder access control
console.log('🔒 Folder protection system loading (v1.1.0 - race condition fix)...');

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
    maxAuthWaitTime: 10000 // Wait up to 10 seconds for auth to be ready
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
    // CRITICAL FIX: Wait for auth.currentUser to be available
    // Sometimes it takes a moment for Firebase to restore the session from localStorage
    let authAttempts = 0;
    const maxAuthAttempts = 20; // 20 attempts * 500ms = 10 seconds max wait
    
    while (authAttempts < maxAuthAttempts && (!window.auth || !window.auth.currentUser)) {
      console.log(`⏳ Waiting for auth to be ready (attempt ${authAttempts + 1}/${maxAuthAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      authAttempts++;
      
      // Check if last known good auth state exists (from auth.js)
      // This helps during token refresh or cross-tab sync scenarios
      if (window._authLastActivity) {
        const timeSinceActivity = Date.now() - window._authLastActivity;
        if (timeSinceActivity < 60000) { // User was active within last minute
          console.log(`🛡️ Recent auth activity detected (${Math.round(timeSinceActivity / 1000)}s ago), continuing to wait...`);
          // Give more time if we know user was recently authenticated
          if (authAttempts === maxAuthAttempts) {
            authAttempts = maxAuthAttempts - 5; // Give 5 more attempts
          }
        }
      }
    }
    
    // Final auth check after waiting
    if (!window.auth || !window.auth.currentUser) {
      console.log('🔒 User not authenticated after waiting, redirecting to login');
      
      // CRITICAL: Before redirecting, check if auth.js's protection system considers
      // the user still logged in. auth.js has a 12-hour ultra-protection that keeps
      // currentAuthState.isLoggedIn = true during token refresh cycles, even when
      // auth.currentUser is temporarily null. We must respect that state to avoid
      // falsely kicking out valid users mid-session.
      const authJsState = window.getCurrentAuthState?.();
      if (authJsState?.isLoggedIn) {
        console.log('🛡️ Folder protection: auth.js considers user still logged in (token refresh cycle)');
        console.log('🛡️ Skipping redirect — waiting for auth.currentUser to be restored by auth.js');
        // Give auth.js additional time to restore auth.currentUser
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (window.auth && window.auth.currentUser) {
          console.log('✅ auth.currentUser restored — continuing with folder access check');
          // Fall through to the folder access check below
        } else {
          // auth.js still says logged in but currentUser still null —
          // trust auth.js and reveal content rather than kick out a valid user
          console.log('🛡️ Trusting auth.js protection state — revealing content without redirect');
          unhideProtectedContent();
          return true;
        }
      } else {
        // Double-check: Look at localStorage to see if Firebase auth token exists
        // This is a last-ditch effort to avoid false logouts
        const firebaseKeys = Object.keys(localStorage).filter(k => k.startsWith('firebase:authUser'));
        if (firebaseKeys.length > 0) {
          console.warn('⚠️ Firebase auth token found in localStorage but auth.currentUser is null');
          console.warn('⚠️ This may be a race condition. Waiting an additional 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check once more — both auth.currentUser and auth.js state
          if (window.auth && window.auth.currentUser) {
            console.log('✅ Auth restored after additional wait!');
            // Continue with normal flow
          } else if (window.getCurrentAuthState?.()?.isLoggedIn) {
            console.log('🛡️ Auth.js protection active after additional wait — skipping redirect');
            unhideProtectedContent();
            return true;
          } else {
            console.error('❌ Auth still not available after extended wait');
            if (window.redirectToLogin) {
              window.redirectToLogin(`You must be logged in to access ${folderName}.`);
            } else {
              window.location.href = '/login.html';
            }
            return false;
          }
        } else {
          // No auth token in localStorage, user is truly logged out
          if (window.redirectToLogin) {
            window.redirectToLogin(`You must be logged in to access ${folderName}.`);
          } else {
            window.location.href = '/login.html';
          }
          return false;
        }
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