// Version and debug info
const AUTH_VERSION = '1.4.0-cross-tab-fix';
console.log(`🔄 Auth script loading... (v${AUTH_VERSION})`);
console.log(`🛡️ 12-hour session protection enabled globally`);
console.log(`👥 Cross-tab authentication synchronization enabled`);
console.log(`🔗 Multi-directory Firebase app instance sharing enabled`);
console.log(`🔧 FIX v1.4: Intentional logout flag now per-tab (sessionStorage) - prevents mass tab logout`);
console.log(`🔧 FIX v1.4: Cross-tab storage handler no longer bypasses protection on logout from another tab`);
console.log(`🔧 FIX v1.4: Token refresh coordinated across tabs to prevent race conditions`);

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpsxZCSULnandhpdVLI9nvsxd3_BH4dfs",
  authDomain: "healthcareitdatabase.firebaseapp.com",
  databaseURL: "https://healthcareitdatabase-default-rtdb.firebaseio.com",
  projectId: "healthcareitdatabase",
  storageBucket: "healthcareitdatabase.firebasestorage.app",
  messagingSenderId: "1024935247661",
  appId: "1:1024935247661:web:a74be5c7b9df74245bdda4",
  measurementId: "G-60KWQ8SJW4"
};

// Global variables
let app, auth, db, database;
let authInitialized = false;
let headerLoaded = false;

// Authentication state
let currentAuthState = {
  isChecking: true,
  user: null,
  isLoggedIn: false,
  isVerified: false,
  error: null,
  manuallyVerified: false,
  verifiedBy: null
};

// Track if this is the first auth state change
let isFirstAuthStateChange = true;

// Global flag to indicate auth system is working properly
window._authSystemActive = true;
window._authLastActivity = Date.now();

// Store the initial successful auth state to prevent false logouts
let lastKnownGoodAuthState = null;
let headerElementsTimedOut = false;

// Page view tracking configuration
const PAGE_VIEW_LIMIT = 2;
const HOSPITAL_PAGE_PATTERNS = ['/hospitalpages/', '/healthsystempages/'];
const STORAGE_KEYS = {
  pageViews: 'hl_page_views',
  viewedPages: 'hl_viewed_pages',
  promptShown: 'hl_prompt_shown',
  sessionId: 'hl_session_id'
};

// Expose globals for other scripts
window.auth = null;
window.firebaseApp = null;
window.database = null;
window.firebaseReady = new Promise((resolve) => {
  window._resolveFirebaseReady = resolve;
});

// Wait for header elements to be available (optional - not all pages have these)
function waitForHeaderElements() {
  return new Promise((resolve) => {
    let resolved = false;
    let checkTimeout = null;
    let fallbackTimeout = null;
    let checkCount = 0;
    
    const checkElements = () => {
      if (resolved) return; // Stop checking if already resolved
      
      checkCount++;
      
      const authLoading = document.getElementById('auth-loading');
      const notLoggedIn = document.getElementById('not-logged-in');
      const loggedIn = document.getElementById('logged-in');
      
      if (authLoading || notLoggedIn || loggedIn) {
        console.log('✅ Header elements found');
        headerLoaded = true;
        resolved = true;
        // Clear timeouts
        if (checkTimeout) clearTimeout(checkTimeout);
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        resolve(true);
      } else {
        // Only log every 5th check to reduce console spam
        if (checkCount % 5 === 1) {
          console.log('⏳ Header elements not found, continuing to check...');
        }
        checkTimeout = setTimeout(checkElements, 500);
      }
    };
    
    checkElements();
    
    // Reduced timeout and made it less disruptive
    fallbackTimeout = setTimeout(() => {
      if (!resolved) {
        console.log('ℹ️ Header elements not found after 5s - this is OK for pages without auth UI elements');
        headerLoaded = true; // Proceed anyway
        resolved = true;
        headerElementsTimedOut = true; // Mark that we timed out
        // Clear the check timeout
        if (checkTimeout) clearTimeout(checkTimeout);
        resolve(false);
      }
    }, 5000); // Reduced from 10s to 5s
  });
}

// Enhanced user menu setup
function setupUserMenu(user) {
  console.log('🎨 Setting up user menu for:', user?.email || 'unknown user');
  
  function getInitials(user) {
    if (user.displayName) {
      const names = user.displayName.split(' ');
      return names.length >= 2 ? 
        (names[0][0] + names[names.length - 1][0]).toUpperCase() : 
        names[0][0].toUpperCase();
    }
    return user.email ? user.email[0].toUpperCase() : 'U';
  }

  function getDisplayName(user) {
    if (user.displayName) return user.displayName;
    if (user.email) {
      const emailName = user.email.split('@')[0];
      return emailName
        .replace(/([A-Z])/g, ' $1')
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim();
    }
    return 'User';
  }

  function getAvatarColor(user) {
    const colors = [
      { bg: '#44A1C4', text: '#ffffff' },
      { bg: '#DBA660', text: '#ffffff' },
      { bg: '#2D6B83', text: '#ffffff' },
      { bg: '#68C2A2', text: '#ffffff' },
      { bg: '#8B5A96', text: '#ffffff' },
      { bg: '#D67E7E', text: '#ffffff' },
      { bg: '#5B9BD5', text: '#ffffff' },
      { bg: '#70AD47', text: '#ffffff' }
    ];
    
    const email = user.email || user.displayName || 'default';
    const hash = email.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  }

  try {
    // Setup avatar
    const avatarDiv = document.getElementById('user-avatar');
    if (avatarDiv && user) {
      const initials = getInitials(user);
      const colors = getAvatarColor(user);
      
      avatarDiv.textContent = initials;
      avatarDiv.style.backgroundColor = colors.bg;
      avatarDiv.style.color = colors.text;
    }

    // Setup user name
    const nameSpan = document.getElementById('user-name');
    if (nameSpan && user) {
      nameSpan.textContent = getDisplayName(user);
    }

    // Setup dropdown functionality
    setupDropdownMenu();
    
    // Also ensure header dropdown is set up
    if (window.setupHeaderDropdown) {
      window.setupHeaderDropdown();
    }
    
  } catch (error) {
    console.error('❌ Error setting up user menu:', error);
  }
}

// Setup dropdown menu functionality
function setupDropdownMenu() {
  const userMenu = document.querySelector('.user-menu');
  const userInfo = document.querySelector('.user-info');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  
  if (!userMenu || !userInfo || !dropdownMenu) return;

  // Toggle dropdown on click
  userInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('active');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target)) {
      userMenu.classList.remove('active');
    }
  });

  // Close dropdown when clicking on dropdown items (except logout)
  const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    if (!item.getAttribute('onclick')) {
      item.addEventListener('click', () => {
        userMenu.classList.remove('active');
      });
    }
  });
}

// Cross-folder navigation protection
// Store a session marker to distinguish intentional logouts from cross-folder navigation
const SESSION_MARKER_KEY = 'hl_active_session';
const INTENTIONAL_LOGOUT_KEY = 'hl_intentional_logout';

// Mark this session as active when auth succeeds
function markSessionActive() {
  try {
    sessionStorage.setItem(SESSION_MARKER_KEY, Date.now().toString());
    // FIX: Use sessionStorage for intentional logout flag (per-tab, not shared)
    sessionStorage.removeItem(INTENTIONAL_LOGOUT_KEY); // Clear any old logout flags
    console.log('✅ Session marked as active');
  } catch (e) {
    console.warn('Could not mark session active:', e);
  }
}

// Check if this is an intentional logout vs cross-folder navigation glitch
// FIX: Now uses sessionStorage instead of localStorage so the flag is PER-TAB.
// Previously, when Tab A set this flag in localStorage and signed out, ALL other
// tabs would see the flag, think "this is intentional", and bypass ultra-protection,
// causing every tab to log out simultaneously.
function isIntentionalLogout() {
  try {
    // Check sessionStorage (tab-local) - this is the primary check
    const sessionFlag = sessionStorage.getItem(INTENTIONAL_LOGOUT_KEY);
    if (sessionFlag) {
      const logoutTime = parseInt(sessionFlag, 10);
      // If logout was within last 5 seconds, it's intentional in THIS tab
      if (Date.now() - logoutTime < 5000) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Logout function
async function logout() {
  try {
    console.log('🚪 Logging out user...');
    
    // Mark this as an intentional logout in THIS TAB ONLY
    // FIX: Use sessionStorage so other tabs don't see this flag and log out too
    try {
      sessionStorage.setItem(INTENTIONAL_LOGOUT_KEY, Date.now().toString());
      sessionStorage.removeItem(SESSION_MARKER_KEY);
    } catch (e) {
      console.warn('Could not set logout flag:', e);
    }
    
    if (auth) {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      await signOut(auth);
      console.log('✅ User logged out successfully');
      // Use root-relative path so logout works from any subfolder (ppccare/, connect/, etc.)
      window.location.href = '/index.html';
    }
  } catch (error) {
    console.error('❌ Logout failed:', error);
  }
}

// Make logout function globally available
window.logout = logout;

// UI State Management
function updateAuthUI(authState) {
  // If we don't have header elements, only log but don't try to update UI
  if (!headerLoaded) {
    console.log('ℹ️ Header elements not loaded, skipping UI update');
    return;
  }
  
  console.log('🎯 Updating UI with auth state:', authState);
  
  const authLoading = document.getElementById('auth-loading');
  const notLoggedIn = document.getElementById('not-logged-in');
  const loggedIn = document.getElementById('logged-in');
  
  // If elements don't exist, skip UI update (page doesn't use auth UI)
  if (!authLoading && !notLoggedIn && !loggedIn) {
    console.log('ℹ️ No auth UI elements on this page');
    return;
  }
  
  if (authState.isChecking) {
    if (authLoading) {
      authLoading.style.display = 'block';
      authLoading.textContent = 'Checking authentication...';
    }
    if (notLoggedIn) notLoggedIn.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'none';
    return;
  }
  
  // Hide loading state
  if (authLoading) authLoading.style.display = 'none';
  
  if (authState.isLoggedIn && authState.isVerified) {
    console.log('👤 User is logged in and verified');
    if (authState.manuallyVerified) {
      console.log('✅ User verification: Manual admin verification by', authState.verifiedBy || 'admin');
    } else {
      console.log('✅ User verification: Email verified');
    }
    if (notLoggedIn) notLoggedIn.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'block'; // Show the logged in user menu
    setupUserMenu(authState.user);
    resetPageViewTracking();
  } else {
    console.log('🚫 User not logged in or not verified');
    if (authState.isLoggedIn && !authState.isVerified) {
      console.log('⚠️ User is logged in but not verified (Firebase:', authState.user?.emailVerified, ')');
    }
    if (notLoggedIn) notLoggedIn.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
    trackPageView(authState.user);
  }
}

// Utility functions
function isHospitalPage() {
  const currentPath = window.location.pathname.toLowerCase();
  return HOSPITAL_PAGE_PATTERNS.some(pattern => currentPath.includes(pattern));
}

function getPageViews() {
  const stored = localStorage.getItem(STORAGE_KEYS.pageViews);
  return stored ? parseInt(stored, 10) : 0;
}

function resetPageViewTracking() {
  localStorage.removeItem(STORAGE_KEYS.pageViews);
  localStorage.removeItem(STORAGE_KEYS.viewedPages);
  localStorage.removeItem(STORAGE_KEYS.promptShown);
}

function trackPageView(user) {
  if (user) {
    resetPageViewTracking();
    return;
  }

  if (!isHospitalPage()) return;

  // Get stored values
  let pageViews = getPageViews();
  let viewedPages = JSON.parse(localStorage.getItem(STORAGE_KEYS.viewedPages) || "[]");
  let promptShown = localStorage.getItem(STORAGE_KEYS.promptShown);

  // Track unique page views
  const thisPage = window.location.pathname;
  if (!viewedPages.includes(thisPage)) {
    viewedPages.push(thisPage);
    pageViews++;
  }

  // Save updated values
  localStorage.setItem(STORAGE_KEYS.pageViews, pageViews);
  localStorage.setItem(STORAGE_KEYS.viewedPages, JSON.stringify(viewedPages));

  // Check if limit exceeded
  if (pageViews >= PAGE_VIEW_LIMIT && !promptShown) {
    localStorage.setItem(STORAGE_KEYS.promptShown, "true");
    showLoginPromptAndRedirect();
  }
}

function showLoginPromptAndRedirect() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100vw;height:100vh;
    background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;
  `;

  const messageBox = document.createElement('div');
  messageBox.style.cssText = `
    background:#fff;padding:2rem 3rem;border-radius:16px;font-size:1.3rem;max-width:90vw;text-align:center;
    box-shadow:0 8px 40px rgba(0,0,0,0.2);
  `;
  messageBox.innerHTML = `
    <strong>In order to view this Highspring Hotsheet, you need to sign up or sign in with your Highspring email.<br>
    Sending you to the login page now...</strong>
  `;

  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);

  setTimeout(() => {
    document.body.removeChild(overlay);
    
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    const encodedReturnUrl = encodeURIComponent(currentUrl);
    window.location.href = `../login.html?returnUrl=${encodedReturnUrl}`;
  }, 3500);
}

// Save user to database (optional - continues on failure)
async function saveUserToDatabase(user) {
  if (!db || !user) return;
  
  try {
    const { doc, setDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const { serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    
    // Check for existing document by Firebase Auth UID
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    // Also check for potential manual entry by email (temporary ID)
    const tempUserId = user.email.replace(/[@.]/g, '_');
    let manualEntryDoc = null;
    if (tempUserId !== user.uid) {
      try {
        const tempDoc = await getDoc(doc(db, 'users', tempUserId));
        if (tempDoc.exists() && tempDoc.data().manualEntry) {
          manualEntryDoc = tempDoc;
        }
      } catch (error) {
        // Ignore errors checking for manual entry
      }
    }
    
    const existingData = userDoc.exists() ? userDoc.data() : {};
    const manualEntryData = manualEntryDoc ? manualEntryDoc.data() : {};
    
    const userData = {
      displayName: user.displayName || manualEntryData.displayName || existingData.displayName || user.email.split('@')[0],
      email: user.email,
      domain: user.email.split('@')[1].toLowerCase(),
      emailVerified: user.emailVerified,
      lastLogin: new Date(),
      uid: user.uid, // Update with real Firebase Auth UID
      photoURL: user.photoURL || manualEntryData.photoURL || existingData.photoURL || null,
      phoneNumber: user.phoneNumber || manualEntryData.phoneNumber || existingData.phoneNumber || null
    };
    
    if (!userDoc.exists()) {
      // Use creation date from manual entry if available, otherwise current time
      userData.createdAt = manualEntryData.createdAt || new Date();
      if (manualEntryData.addedBy) {
        userData.originallyAddedBy = manualEntryData.addedBy;
        userData.wasManualEntry = true;
      }
      console.log('💾 Creating new user record:', userData);
    } else {
      // Preserve creation date and any admin-added fields
      userData.createdAt = existingData.createdAt || manualEntryData.createdAt || new Date();
      if (existingData.addedBy || manualEntryData.addedBy) {
        userData.originallyAddedBy = existingData.addedBy || manualEntryData.addedBy;
        userData.wasManualEntry = existingData.manualEntry || manualEntryData.manualEntry || false;
      }
      console.log('💾 Updating existing user record:', userData);
      
      // If this was a manual entry, log that it's now been updated with real data
      if (existingData.manualEntry || manualEntryData.manualEntry) {
        console.log('✅ Manual entry updated with real Firebase Auth data for:', user.email);
      }
    }
    
    // If we found a manual entry document, merge its data and then delete it
    if (manualEntryDoc && tempUserId !== user.uid) {
      console.log('🔄 Found manual entry to migrate for:', user.email);
      try {
        const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        await deleteDoc(doc(db, 'users', tempUserId));
        console.log('✅ Deleted temporary manual entry document:', tempUserId);
      } catch (error) {
        console.warn('⚠️ Could not delete manual entry document:', error.message);
      }
    }
    
    await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
    console.log('✅ User saved to database');
    
  } catch (error) {
    // Log the error but don't block functionality
    console.warn('⚠️ User tracking failed (non-critical):', error.message);
    console.log('ℹ️ This is expected for users without write permissions to the users collection');
    // Continue normally - user tracking is optional
  }
}

// Initialize Firebase and Auth
async function initializeFirebaseAuth() {
  try {
    console.log('🚀 Initializing Firebase...');
    
    // Import Firebase modules
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
    const { getAuth, onAuthStateChanged, browserLocalPersistence, setPersistence } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const { getDatabase, ref, get, set, update, remove, child } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
    
    // Check for existing Firebase app instance to prevent conflicts with /crm pages
    const existingApps = getApps();
    const existingDefaultApp = existingApps.find(a => a.name === '[DEFAULT]');
    
    if (existingDefaultApp) {
      console.log('✅ Using existing Firebase [DEFAULT] app (avoiding conflict)');
      app = existingDefaultApp;
    } else {
      console.log('🔥 Initializing new Firebase [DEFAULT] app');
      app = initializeApp(firebaseConfig);
    }
    
    auth = getAuth(app);
    db = getFirestore(app);
    database = getDatabase(app);
    
    // Ensure persistence is set to LOCAL (browser local storage)
    try {
      await setPersistence(auth, browserLocalPersistence);
      console.log('✅ Auth persistence set to LOCAL');
    } catch (error) {
      console.warn('⚠️ Could not set auth persistence:', error);
    }
    
    // Expose to window
    window.auth = auth;
    window.firebaseApp = app;
    window.db = db;
    window.database = database;
    
    // Expose Firebase Realtime Database functions (v10 modular API)
    window.firebaseRTDB = {
      ref: (path) => ref(database, path),
      get: get,
      set: set,
      update: update,
      remove: remove,
      child: child
    };
    
    console.log('✅ Firebase initialized successfully');
    console.log('✅ Firebase Realtime Database initialized:', !!database);
    
    // Setup auth listener
    onAuthStateChanged(auth, async (user) => {
      console.log('🔄 Auth state changed:', user ? `User: ${user.email}` : 'No user');
      
      // Debug: Check auth persistence
      if (!user) {
        console.log('🔍 Auth debug - No user detected. Checking persistence...');
        console.log('🔍 Auth persistence setting:', auth.persistenceManager?.persistence?.type || 'unknown');
        console.log('🔍 Current auth user:', auth.currentUser);
        console.log('🔍 Auth initialized:', authInitialized);
      }
      
      // Store previous state for comparison
      const previousState = { ...currentAuthState };
      
      // Check for suspicious logout (was logged in, now reporting no user)
      if (previousState.isLoggedIn && !user) {
        console.log('⚠️ Suspicious auth state change from logged in to logged out');
        
        // FIRST: Check if this is an intentional logout
        if (isIntentionalLogout()) {
          console.log('✅ This is an intentional logout - proceeding with logout');
          // Let it continue to log out
        } else {
          console.log('🔍 This appears to be an unintentional logout - investigating...');
          
          // If we recently had a good auth state, this is likely a Firebase glitch
          if (lastKnownGoodAuthState) {
            const timeSinceGoodState = Date.now() - (lastKnownGoodAuthState.timestamp || 0);
            
            // If user was authenticated within the last 12 HOURS, ignore this logout
            // ULTRA AGGRESSIVE protection - data is not sensitive, prefer keeping users logged in
            // This prevents redirects during Firebase token refresh cycles, cross-folder navigation, and long-running work
            if (timeSinceGoodState < 43200000) { // 12 hours (ULTRA AGGRESSIVE - up from 8 hours)
              console.log('🛡️ ULTRA PROTECTED: Ignoring suspicious logout - user was authenticated recently');
              console.log(`Time since last good state: ${Math.round(timeSinceGoodState / 1000)}s (${Math.round(timeSinceGoodState / 60000)} minutes / ${Math.round(timeSinceGoodState / 3600000)} hours)`);
              console.log('🔄 Maintaining logged-in state (ULTRA aggressive 12-hour protection mode)');
              
              // Keep the current state - don't update to logged out
              return;
            }
          }
          
          // Multiple progressive checks - ULTRA patient approach for 12-hour protection
          console.log('⏳ Check 1/6: Waiting 5 seconds for auth to restore...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 5s');
            return;
          }
          
          console.log('⏳ Check 2/6: Waiting another 5 seconds (10s total)...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 10s');
            return;
          }
          
          console.log('⏳ Check 3/6: Waiting another 10 seconds (20s total)...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 20s');
            return;
          }
          
          console.log('⏳ Check 4/6: Waiting another 10 seconds (30s total)...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 30s');
            return;
          }
          
          console.log('⏳ Check 5/6: Waiting another 15 seconds (45s total)...');
          await new Promise(resolve => setTimeout(resolve, 15000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 45s');
            return;
          }
          
          console.log('⏳ Check 6/6: Final wait - 15 more seconds (60s total)...');
          await new Promise(resolve => setTimeout(resolve, 15000));
          if (auth.currentUser) {
            console.log('✅ Auth restored after 60s');
            return;
          }
          
          console.log('❌ Auth state confirmed as logged out after 60 seconds of checking');
        }
      }
      
      // Only update state if this is not a suspicious change
      currentAuthState.isChecking = false;
      currentAuthState.user = user;
      currentAuthState.isLoggedIn = !!user;
      currentAuthState.isVerified = user ? user.emailVerified : false;
      currentAuthState.error = null;
      
      // Check for manual admin verification if user is logged in but not Firebase verified
      if (user && !user.emailVerified) {
        console.log('🔍 User logged in but not Firebase verified, checking for manual admin verification...');
        // Function to check manual verification
        const checkManualVerification = async () => {
          try {
            // Wait for db to be available if it's not ready yet
            let firestoreDb = db;
            if (!firestoreDb) {
              console.log('⏳ Waiting for Firestore to be ready for manual verification check...');
              // Wait up to 5 seconds for db to be available
              for (let i = 0; i < 50 && !db; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              firestoreDb = db;
            }
            
            if (!firestoreDb) {
              console.log('❌ Firestore not available for manual verification check');
              return;
            }
            
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(firestoreDb, 'users', user.uid));
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData.emailVerified === true) {
                console.log('✅ User manually verified by admin:', userData.verifiedBy || 'admin');
                currentAuthState.isVerified = true;
                currentAuthState.manuallyVerified = true;
                currentAuthState.verifiedBy = userData.verifiedBy;
                
                // Update UI after manual verification is confirmed
                updateAuthUI(currentAuthState);
                
                // Notify callbacks about the verification change
                console.log('📢 Notifying callbacks about manual verification');
                if (window.onAuthStateChanged) window.onAuthStateChanged(currentAuthState);
                if (window.authStateChanged) window.authStateChanged(currentAuthState);
                if (window.hotsheetAuthCheck) window.hotsheetAuthCheck(currentAuthState);
              }
            }
          } catch (error) {
            console.log('⚠️ Could not check manual verification:', error.message);
            // Don't block - continue with Firebase Auth verification status
          }
        };
        
        // Run the check
        checkManualVerification();
      }
      
      // Store good auth state with timestamp
      if (user && user.emailVerified) {
        lastKnownGoodAuthState = { 
          ...currentAuthState,
          timestamp: Date.now()
        };
        console.log('💾 Stored good auth state for user:', user.email);
        
        // Mark session as active (for cross-folder navigation protection)
        markSessionActive();
        
        // Start centralized token refresh for authenticated users
        if (!globalTokenRefreshInterval) {
          console.log('🚀 Starting centralized token refresh');
          startGlobalTokenRefresh();
        }
      } else if (!user) {
        // Stop token refresh when logged out
        if (globalTokenRefreshInterval) {
          console.log('⏹️ Stopping centralized token refresh (user logged out)');
          stopGlobalTokenRefresh();
        }
      }
      
      // Update activity timestamp
      window._authLastActivity = Date.now();
      
      // Try to save user to database if logged in (optional)
      if (user && user.emailVerified) {
        // Don't await - let it run in background so auth continues even if tracking fails
        saveUserToDatabase(user).catch(err => {
          console.log('ℹ️ User tracking skipped:', err.message);
        });
      }
      
      updateAuthUI(currentAuthState);
      
      // Only call callbacks if there's an actual meaningful change
      // This prevents false "logged out" states from propagating
      const hasActualChange = (
        previousState.isLoggedIn !== currentAuthState.isLoggedIn ||
        previousState.isVerified !== currentAuthState.isVerified ||
        previousState.user?.uid !== currentAuthState.user?.uid ||
        previousState.isChecking !== currentAuthState.isChecking
      );
      
      // Don't fire "not logged in" callbacks on the very first auth check
      const shouldNotifyCallbacks = hasActualChange && 
        !(isFirstAuthStateChange && !currentAuthState.isLoggedIn);
      
      if (shouldNotifyCallbacks) {
        console.log('📢 Notifying auth state change callbacks:', {
          wasLoggedIn: previousState.isLoggedIn,
          isLoggedIn: currentAuthState.isLoggedIn,
          wasVerified: previousState.isVerified,
          isVerified: currentAuthState.isVerified,
          isFirstCheck: isFirstAuthStateChange
        });
        
        // Call registered callbacks
        if (window.onAuthStateChanged) window.onAuthStateChanged(currentAuthState);
        if (window.authStateChanged) window.authStateChanged(currentAuthState);
        if (window.hotsheetAuthCheck) window.hotsheetAuthCheck(currentAuthState);
      } else {
        console.log('🔕 Suppressing auth state callback:', {
          hasActualChange,
          isFirstAuthStateChange,
          isLoggedIn: currentAuthState.isLoggedIn,
          reason: isFirstAuthStateChange && !currentAuthState.isLoggedIn ? 
            'First auth check with no user' : 'No actual change'
        });
      }
      
      // Mark that we've completed the first auth state change
      isFirstAuthStateChange = false;
    }, (error) => {
      console.error('❌ Auth state change error:', error);
      currentAuthState.isChecking = false;
      currentAuthState.error = error.message;
      updateAuthUI(currentAuthState);
    });
    
    authInitialized = true;
    
    // Resolve the Firebase ready promise
    if (window._resolveFirebaseReady) {
      window._resolveFirebaseReady({ app, auth, db });
    }
    
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    currentAuthState.isChecking = false;
    currentAuthState.error = error.message;
    updateAuthUI(currentAuthState);
  }
}

// Main initialization function
async function initialize() {
  console.log('🎬 Starting initialization...');
  
  try {
    await waitForHeaderElements();
    await initializeFirebaseAuth();
    console.log('🎉 Initialization complete');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    currentAuthState.isChecking = false;
    currentAuthState.error = error.message;
    updateAuthUI(currentAuthState);
  }
}

// ============================================================
// isTrulyLoggedOut — shared guard for page-level auth handlers
// ============================================================
// Pages that register their own onAuthStateChanged should call this
// before redirecting or showing session-expired UI.
//
// Returns true ONLY when we are confident the user is genuinely logged out:
//   - auth.js considers them logged out (isLoggedIn === false)
//   - No recent good auth state exists (nothing within the 12-hour window)
//   - No firebase:authUser token is present in localStorage
//
// Returns false (= do NOT redirect) when any of the following apply:
//   - auth.js's 12-hour ultra-protection is holding the user as logged in
//   - auth.currentUser is set on the Firebase auth instance
//   - A firebase:authUser token is still in localStorage (token mid-refresh)
window.isTrulyLoggedOut = function() {
  // If auth.js considers the user logged in, trust it — this covers the
  // 12-hour ultra-protection period during token refresh cycles
  const authJsState = window.getCurrentAuthState?.();
  if (authJsState?.isLoggedIn) {
    console.log('🛡️ [isTrulyLoggedOut] auth.js says logged in — not a real logout');
    return false;
  }

  // If Firebase's own auth instance has a current user, not logged out
  if (window.auth?.currentUser) {
    console.log('🛡️ [isTrulyLoggedOut] auth.currentUser present — not a real logout');
    return false;
  }

  // If a Firebase auth token still exists in localStorage, this is likely
  // a mid-refresh glitch, not a genuine logout
  try {
    const hasFirebaseToken = Object.keys(localStorage).some(k => k.startsWith('firebase:authUser'));
    if (hasFirebaseToken) {
      console.log('🛡️ [isTrulyLoggedOut] Firebase token in localStorage — likely mid-refresh, not a real logout');
      return false;
    }
  } catch (e) {
    // If we can't read localStorage, err on the side of not redirecting
    return false;
  }

  // All checks failed — user is genuinely logged out
  console.log('✅ [isTrulyLoggedOut] Confirmed: user is truly logged out');
  return true;
};

// Global authentication redirect function
window.redirectToLogin = function(message = null) {
  console.log('🔒 Redirecting to login page...');
  
  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  const encodedReturnUrl = encodeURIComponent(currentUrl);
  
  if (message) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100vw;height:100vh;
      background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;
    `;

    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
      background:#fff;padding:2rem 3rem;border-radius:16px;font-size:1.3rem;max-width:90vw;text-align:center;
      box-shadow:0 8px 40px rgba(0,0,0,0.2);
    `;
    messageBox.innerHTML = `<strong>${message}</strong>`;

    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      document.body.removeChild(overlay);
      window.location.href = `../login.html?returnUrl=${encodedReturnUrl}`;
    }, 2500);
  } else {
    window.location.href = `../login.html?returnUrl=${encodedReturnUrl}`;
  }
};

// Convenience functions
window.requireAuth = function(message = 'You must be logged in to access this page.') {
  if (!currentAuthState.isLoggedIn || !currentAuthState.isVerified) {
    window.redirectToLogin(message);
    return false;
  }
  return true;
};

window.getCurrentAuthState = () => currentAuthState;
window.isFirebaseReady = () => authInitialized && window.auth && window.firebaseApp;

// Enhanced auth check with resilience for token refresh scenarios
window.requireAuthResilient = async function(message = 'You must be logged in to access this page.', timeoutMs = 10000) {
  console.log('🔒 Checking auth state with resilience for token refresh...');
  
  // If currently checking auth, wait a bit
  if (currentAuthState.isChecking) {
    console.log('⏳ Auth is checking, waiting...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // If already authenticated, return true immediately
  if (currentAuthState.isLoggedIn && currentAuthState.isVerified) {
    console.log('✅ User already authenticated');
    return true;
  }
  
  // If not authenticated, wait a bit for potential token refresh
  console.log('⏳ Auth not confirmed, waiting for potential token refresh...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    // Check if auth state improved
    if (currentAuthState.isLoggedIn && currentAuthState.isVerified) {
      console.log('✅ Auth restored during resilient check');
      return true;
    }
    
    // Check if Firebase auth has a current user (might not be reflected in our state yet)
    if (window.auth && window.auth.currentUser && window.auth.currentUser.emailVerified) {
      console.log('✅ Firebase auth shows valid user, updating state');
      // Manually trigger auth state update
      currentAuthState.user = window.auth.currentUser;
      currentAuthState.isLoggedIn = true;
      currentAuthState.isVerified = true;
      currentAuthState.isChecking = false;
      return true;
    }
    
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('❌ Auth check failed after resilient timeout, redirecting...');
  window.redirectToLogin(message);
  return false;
};

// Helper function for ppccare pages to use instead of direct auth checks
window.initPageWithResilientAuth = async function(initFunction, authMessage) {
  console.log('🚀 Initializing page with resilient auth check...');
  
  try {
    // Wait for Firebase to be ready
    await window.firebaseReady;
    
    // Perform resilient auth check
    const isAuthenticated = await window.requireAuthResilient(authMessage);
    
    if (isAuthenticated) {
      console.log('✅ Auth confirmed, initializing page...');
      await initFunction();
    }
  } catch (error) {
    console.error('❌ Page initialization failed:', error);
  }
};

// Ready-to-use template for ppccare pages to prevent timeout redirects
window.createResilientAuthCallback = function(initFunction, authMessage) {
  return {
    // Auth state change callback
    hotsheetAuthCheck: function(authState) {
      console.log('🔔 Auth state change received:', { 
        isLoggedIn: authState.isLoggedIn, 
        isVerified: authState.isVerified, 
        isChecking: authState.isChecking 
      });
      
      // Only initialize if we have a stable, positive auth state
      if (authState.isLoggedIn && authState.isVerified && !authState.isChecking) {
        console.log('✅ Stable auth state confirmed, initializing page...');
        initFunction();
      } else if (!authState.isChecking && !authState.isLoggedIn) {
        // Only redirect if auth is definitely failed (not during token refresh)
        console.log('⚠️ Auth state shows not logged in, using resilient check before redirect...');
        
        // Use resilient auth check with longer timeout for token refresh scenarios
        window.requireAuthResilient(authMessage, 15000)
          .then(isAuthenticated => {
            if (!isAuthenticated) {
              console.log('🔒 Resilient auth check failed, user truly not authenticated');
              // Redirect will happen in requireAuthResilient
            } else {
              console.log('✅ Resilient auth check passed, initializing page...');
              initFunction();
            }
          })
          .catch(error => {
            console.error('❌ Resilient auth check error:', error);
          });
      } else {
        console.log('⏳ Auth state is transitional, waiting for stable state...');
      }
    },
    
    // Initial auth check
    checkInitialAuth: function() {
      if (window.getCurrentAuthState && !window.getCurrentAuthState().isChecking) {
        const authState = window.getCurrentAuthState();
        if (authState.isLoggedIn && authState.isVerified) {
          console.log('✅ Auth already ready, initializing page...');
          initFunction();
        } else {
          console.log('⚠️ Auth state unclear, using resilient initialization...');
          window.initPageWithResilientAuth(initFunction, authMessage);
        }
      } else {
        console.log('⏳ Auth still checking, waiting for callback...');
      }
    }
  };
};

// Global folder access checker with support for individual email permissions
window.checkFolderAccess = async function(folderName, userEmail = null, options = {}) {
  try {
    if (!window.db) {
      console.error('Firebase not initialized');
      
      // Fallback behavior based on options
      if (options.allowOnError) {
        console.warn('⚠️ Allowing access due to Firebase unavailability (allowOnError=true)');
        return true;
      } else {
        console.warn('⚠️ Denying access due to Firebase unavailability');
        return false;
      }
    }
    
    const user = userEmail || (window.auth?.currentUser?.email);
    if (!user) {
      console.error('No user email provided');
      return false;
    }
    
    const userDomain = user.split('@')[1].toLowerCase();
    const adminDomains = ['healthluminate.com', 'careluminate.com'];
    
    console.log(`🔍 Checking folder access for: ${folderName}`);
    console.log(`👤 User: ${user} (${userDomain})`);
    
    // Admin domains always have access
    if (adminDomains.includes(userDomain)) {
      console.log('✅ Admin domain access granted');
      return true;
    }
    
    // Check folder permissions
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
    const hasEmailAccess = allowedEmails.includes(user.toLowerCase());
    const hasAccess = hasDomainAccess || hasEmailAccess;
    
    if (hasEmailAccess) {
      console.log(`✅ Access granted for ${user} via individual email permission`);
    } else if (hasDomainAccess) {
      console.log(`✅ Access granted for ${user} via domain permission (${userDomain})`);
    } else {
      console.log(`❌ Access denied for ${user} - not in allowed domains or emails`);
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
};

// Cross-tab authentication synchronization
// Listen for storage changes from other tabs to keep auth state in sync
window.addEventListener('storage', (event) => {
  // Ignore our own coordination keys (token refresh timestamp, etc.)
  if (event.key === TOKEN_REFRESH_COORDINATION_KEY) {
    return;
  }
  
  // Firebase stores auth state in localStorage with keys starting with 'firebase:authUser'
  if (event.key && event.key.startsWith('firebase:authUser')) {
    
    // CRITICAL FIX: Only react to actual auth removal (logout), not token updates
    // When Firebase refreshes tokens, it updates the storage key with new token data (event.newValue exists)
    // When user logs out, Firebase removes the key entirely (event.newValue is null)
    const isActualLogout = event.oldValue && !event.newValue;
    const isLogin = !event.oldValue && event.newValue;
    const isTokenUpdate = event.oldValue && event.newValue;
    
    if (isTokenUpdate) {
      // This is just a token refresh, not a login/logout event
      console.log('🔄 Token refresh detected in another tab (ignoring - not a logout)');
      return; // Don't do anything for token updates
    }
    
    if (isLogin) {
      console.log('🔄 User logged in another tab, synchronizing...');
    } else if (isActualLogout) {
      console.log('🔄 Auth key removed in another tab, investigating...');
    } else {
      console.log('🔄 Auth state changed in another tab, synchronizing...');
    }
    
    // Give Firebase a moment to process the change
    setTimeout(() => {
      if (auth && auth.currentUser) {
        console.log('✅ User still authenticated in this tab, updating local state');
        const user = auth.currentUser;
        
        // Update current auth state
        currentAuthState = {
          isChecking: false,
          user: user,
          isLoggedIn: true,
          isVerified: user.emailVerified || currentAuthState.manuallyVerified,
          error: null,
          manuallyVerified: currentAuthState.manuallyVerified,
          verifiedBy: currentAuthState.verifiedBy
        };
        
        // Store good state
        lastKnownGoodAuthState = {
          timestamp: Date.now(),
          user: user,
          uid: user.uid
        };
        
        // Start token refresh if not already running
        if (!globalTokenRefreshInterval && user.emailVerified) {
          console.log('🚀 [Cross-tab sync] Starting token refresh');
          startGlobalTokenRefresh();
        }
        
        // Update UI if updateAuthUI function exists
        if (typeof updateAuthUI === 'function') {
          updateAuthUI(currentAuthState);
        }
        
        // Notify callbacks if they exist
        if (window.onAuthStateChanged) {
          window.onAuthStateChanged(currentAuthState);
        }
        if (window.authStateChanged) {
          window.authStateChanged(currentAuthState);
        }
        
      } else {
        console.log('⚠️ Possible logout detected from another tab, verifying...');
        
        // FIX: NEVER check isIntentionalLogout() here — that flag is per-tab (sessionStorage).
        // Another tab logging out is NOT intentional for THIS tab.
        // Always use ultra-protection for cross-tab logout detection.
        
        // Only update if we don't have a recent good auth state
        const timeSinceGoodState = lastKnownGoodAuthState 
          ? Date.now() - lastKnownGoodAuthState.timestamp 
          : Infinity;
        
        // If we had a good auth state recently (within 12 hours), ignore the logout
        // Another tab signing out should NOT force this tab to sign out
        if (timeSinceGoodState < 43200000) { // 12 hours
          console.log('🛡️ PROTECTED: Ignoring cross-tab logout - user was authenticated in this tab recently');
          console.log(`   Time since last good state: ${Math.round(timeSinceGoodState / 60000)} minutes`);
          console.log('🔄 Maintaining logged-in state in this tab');
          
          // Attempt to re-authenticate this tab by reloading the auth token
          // This handles the case where Firebase SDK cleared its internal state
          // but we still want to stay logged in
          setTimeout(async () => {
            try {
              if (auth && !auth.currentUser && lastKnownGoodAuthState) {
                console.log('🔄 Attempting to restore auth state after cross-tab event...');
                // Firebase should restore from its internal state or IndexedDB
                // If not, the user will need to refresh the page
              }
            } catch (e) {
              console.warn('⚠️ Could not restore auth state:', e);
            }
          }, 2000);
          
          return;
        }
        
        // Only if we have NO recent good auth state (very old session), 
        // perform extended checks
        console.log('⏳ No recent auth state, confirming logout is real...');
        
        const performDelayedChecks = async () => {
          // Check after 5 seconds
          await new Promise(resolve => setTimeout(resolve, 5000));
          if (auth && auth.currentUser) {
            console.log('✅ Auth restored after 5s, ignoring false logout');
            return;
          }
          
          // Check after 15 seconds total
          await new Promise(resolve => setTimeout(resolve, 10000));
          if (auth && auth.currentUser) {
            console.log('✅ Auth restored after 15s, ignoring false logout');
            return;
          }
          
          console.log('❌ Logout confirmed after 15 seconds of verification (no recent session)');
          
          // Stop token refresh on logout
          if (globalTokenRefreshInterval) {
            console.log('⏹️ [Cross-tab sync] Stopping token refresh');
            stopGlobalTokenRefresh();
          }
          
          // Update auth state to logged out
          currentAuthState = {
            isChecking: false,
            user: null,
            isLoggedIn: false,
            isVerified: false,
            error: null,
            manuallyVerified: false,
            verifiedBy: null
          };
          
          // Update UI if updateAuthUI function exists
          if (typeof updateAuthUI === 'function') {
            updateAuthUI(currentAuthState);
          }
          
          // Notify callbacks if they exist
          if (window.onAuthStateChanged) {
            window.onAuthStateChanged(currentAuthState);
          }
          if (window.authStateChanged) {
            window.authStateChanged(currentAuthState);
          }
        };
        
        // Run the checks
        performDelayedChecks();
      }
    }, 1000);
  }
});

console.log('👂 Cross-tab auth synchronization enabled');

// ============================================================
// CENTRALIZED TOKEN REFRESH SYSTEM
// ============================================================
// This provides centralized token refresh management in auth.js
// Pages can still implement their own token refresh, but this
// provides a fallback to ensure tokens are always being refreshed
//
// FIX: Uses localStorage timestamp coordination to prevent multiple tabs
// from all refreshing tokens simultaneously, which caused race conditions
// and storage events that could trigger false logouts.

let globalTokenRefreshInterval = null;
let tokenRefreshFailureCount = 0;
const MAX_TOKEN_REFRESH_FAILURES = 10; // Very tolerant
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes (tokens last ~1 hour)
const TOKEN_REFRESH_COORDINATION_KEY = 'hl_last_token_refresh';
const TOKEN_REFRESH_MIN_GAP = 5 * 60 * 1000; // Minimum 5 minutes between refreshes across all tabs

async function refreshAuthToken() {
  try {
    if (auth && auth.currentUser) {
      // FIX: Check if another tab has recently refreshed the token
      // This prevents multiple tabs from all calling getIdToken(true) simultaneously
      // which creates a burst of localStorage writes and storage events
      try {
        const lastRefresh = localStorage.getItem(TOKEN_REFRESH_COORDINATION_KEY);
        if (lastRefresh) {
          const timeSinceLastRefresh = Date.now() - parseInt(lastRefresh, 10);
          if (timeSinceLastRefresh < TOKEN_REFRESH_MIN_GAP) {
            console.log(`🔄 [Global] Token was refreshed ${Math.round(timeSinceLastRefresh / 1000)}s ago by another tab, skipping`);
            tokenRefreshFailureCount = 0; // Not a failure, just coordination
            return;
          }
        }
      } catch (e) {
        // If we can't read the coordination key, proceed with refresh anyway
      }
      
      await auth.currentUser.getIdToken(true); // Force token refresh
      console.log('🔄 [Global] Auth token refreshed successfully');
      tokenRefreshFailureCount = 0; // Reset failure count on success
      
      // Mark the refresh time so other tabs don't refresh simultaneously
      try {
        localStorage.setItem(TOKEN_REFRESH_COORDINATION_KEY, Date.now().toString());
      } catch (e) {
        // Non-critical
      }
      
      // Update last activity timestamp
      window._authLastActivity = Date.now();
      
      // Update last known good state
      if (auth.currentUser) {
        lastKnownGoodAuthState = {
          timestamp: Date.now(),
          user: auth.currentUser,
          uid: auth.currentUser.uid
        };
      }
    }
  } catch (error) {
    tokenRefreshFailureCount++;
    console.error(`❌ [Global] Error refreshing auth token (attempt ${tokenRefreshFailureCount}/${MAX_TOKEN_REFRESH_FAILURES}):`, error);
    
    // Only take action after multiple consecutive failures
    if (tokenRefreshFailureCount >= MAX_TOKEN_REFRESH_FAILURES) {
      console.error('❌ [Global] Token refresh failed multiple times, session may be invalid');
      // Don't force logout - let the next auth state check handle it
    }
  }
}

function startGlobalTokenRefresh() {
  if (globalTokenRefreshInterval) {
    clearInterval(globalTokenRefreshInterval);
  }
  
  // FIX: Add a random jitter (0-60 seconds) so tabs don't all refresh at the same moment
  const jitter = Math.floor(Math.random() * 60000);
  
  // Refresh after a short delay (with jitter)
  setTimeout(() => {
    refreshAuthToken();
  }, 1000 + jitter);
  
  // Then refresh every 45 minutes (with built-in cross-tab coordination)
  globalTokenRefreshInterval = setInterval(refreshAuthToken, TOKEN_REFRESH_INTERVAL);
  tokenRefreshFailureCount = 0;
  console.log(`✅ [Global] Token refresh interval started (every 45 min, jitter: ${Math.round(jitter / 1000)}s)`);
}

function stopGlobalTokenRefresh() {
  if (globalTokenRefreshInterval) {
    clearInterval(globalTokenRefreshInterval);
    globalTokenRefreshInterval = null;
    console.log('⏹️ [Global] Token refresh interval stopped');
  }
}

// Expose token refresh functions globally
window.refreshAuthToken = refreshAuthToken;
window.startGlobalTokenRefresh = startGlobalTokenRefresh;
window.stopGlobalTokenRefresh = stopGlobalTokenRefresh;

// Debug utilities
window.authDebug = {
  currentAuthState,
  auth: () => auth,
  app: () => app,
  db: () => db,
  initialize,
  headerLoaded: () => headerLoaded,
  authInitialized: () => authInitialized,
  isFirebaseReady: window.isFirebaseReady,
  refreshToken: refreshAuthToken,
  tokenRefreshActive: () => !!globalTokenRefreshInterval,
  failureCount: () => tokenRefreshFailureCount
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  setTimeout(initialize, 100);
}

console.log('📋 Auth script loaded, waiting for initialization...');

// ============================================================
// CROSS-DOMAIN SSO BRIDGE (HealthLuminate -> Pando)
// ============================================================
// Same Firebase Auth project (healthcareitdatabase) backs both
// healthluminate.com and pandonetworking.com, so the two sites share one set
// of accounts — but browser session storage is scoped per-origin, so simply
// being logged into HealthLuminate doesn't automatically show up here.
//
// This silently checks (once per browser tab session) whether the visitor
// already has a HealthLuminate session, and if so, signs them into Pando
// too via a short-lived custom token minted by the mintSsoToken Cloud
// Function (see functions/index.js). See sso-bridge.html on the
// HealthLuminate side for the other half of this flow.
(function initSsoBridge() {
  const BRIDGE_URL = 'https://healthluminate.com/sso-bridge.html';
  const ATTEMPT_FLAG = 'pandoSsoBridgeAttempted';

  // Only relevant on the new Pando domain — never run this on healthluminate.com itself.
  const host = window.location.hostname;
  const isPandoHost = host === 'pandonetworking.com' || host === 'www.pandonetworking.com';
  if (!isPandoHost) {
    console.log('ℹ️ [SSO Bridge] Not on Pando host, skipping (host: ' + host + ')');
    return;
  }

  // Uses a real top-level (same-tab) redirect through healthluminate.com and
  // back, rather than a hidden iframe. A hidden iframe can't reliably read
  // another site's login session in modern browsers — Safari ITP, Firefox
  // ETP, and Chrome's storage partitioning all block third-party iframes
  // from accessing another origin's storage by default. A real top-level
  // navigation to healthluminate.com is treated as first-party, so it has
  // full access to any existing session there.

  function extractSsoToken() {
    const hash = window.location.hash || '';
    const match = hash.match(/[#&]ssoToken=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function stripSsoTokenFromUrl() {
    const remaining = (window.location.hash || '')
      .replace(/^#/, '')
      .split('&')
      .filter(part => part && !part.startsWith('ssoToken='))
      .join('&');
    const cleanUrl = window.location.pathname + window.location.search + (remaining ? '#' + remaining : '');
    history.replaceState(null, '', cleanUrl);
  }

  // The attempt flag stores a timestamp and expires, so a transient failure
  // (network hiccup, Cloud Function error) self-heals on a later navigation
  // instead of leaving the tab permanently signed out.
  const ATTEMPT_TTL_MS = 30 * 60 * 1000; // retry at most every 30 minutes per tab

  function markAttempted() {
    try { sessionStorage.setItem(ATTEMPT_FLAG, Date.now().toString()); } catch (e) { /* no-op */ }
  }

  function recentlyAttempted() {
    try {
      const raw = sessionStorage.getItem(ATTEMPT_FLAG);
      if (!raw) return false;
      const at = parseInt(raw, 10);
      if (isNaN(at)) return true; // legacy '1' value — treat as attempted
      return (Date.now() - at) < ATTEMPT_TTL_MS;
    } catch (e) {
      return true; // no sessionStorage access — don't redirect-loop
    }
  }

  async function consumeReturnedToken() {
    const token = extractSsoToken();
    if (!token) return false;

    stripSsoTokenFromUrl();
    markAttempted();

    try {
      await window.firebaseReady;
      if (auth && !auth.currentUser) {
        const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
        await signInWithCustomToken(auth, token);
        console.log('✅ [SSO Bridge] Signed in via existing HealthLuminate session');
      } else {
        console.log('ℹ️ [SSO Bridge] Already signed in locally by the time the token arrived — ignoring.');
      }
    } catch (error) {
      console.warn('⚠️ [SSO Bridge] signInWithCustomToken failed:', error.message);
    }
    return true;
  }

  function attemptBridge() {
    if (recentlyAttempted()) {
      console.log('ℹ️ [SSO Bridge] Already attempted recently in this tab, skipping. Retries automatically after 30 minutes, or open a new tab.');
      return;
    }
    try {
      markAttempted();
    } catch (e) {
      console.warn('⚠️ [SSO Bridge] No sessionStorage access, skipping:', e.message);
      return; // No sessionStorage access — skip rather than retry every navigation
    }

    const returnUrl = window.location.href;
    const bridgeUrl = BRIDGE_URL + '?return=' + encodeURIComponent(returnUrl);
    console.log('🔄 [SSO Bridge] Not signed in locally — redirecting through HealthLuminate to check for an existing session...');
    window.location.assign(bridgeUrl);
  }

  (async () => {
    try {
      // First: did we just come back from the bridge with a token?
      const consumed = await consumeReturnedToken();
      if (consumed) return;

      await window.firebaseReady;
      // Already signed in on this domain — nothing to bridge.
      if (auth && auth.currentUser) {
        console.log('ℹ️ [SSO Bridge] Already signed in on pandonetworking.com, skipping bridge.');
        return;
      }
      attemptBridge();
    } catch (error) {
      console.warn('⚠️ [SSO Bridge] Skipped:', error.message);
    }
  })();
})();