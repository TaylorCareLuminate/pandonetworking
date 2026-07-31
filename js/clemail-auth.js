// CLEmail Authentication Module
// Version: 1.0.1
// Purpose: Initialize CLEmail Firebase with authentication from HealthcareITDatabase

console.log('🔐 CLEmail Auth Module Loading...');

// =====================================================
// CLEmail Firebase Configuration
// =====================================================
const clemailConfig = {
  apiKey: "AIzaSyDGESh2UQT4awIg9Y3kBcZPN-aaWthC1k4",
  authDomain: "clemail.firebaseapp.com",
  databaseURL: "https://clemail-default-rtdb.firebaseio.com",
  projectId: "clemail",
  storageBucket: "clemail.firebasestorage.app",
  messagingSenderId: "762477610174",
  appId: "1:762477610174:web:8547f62e6d9f3b819acaef",
  measurementId: "G-EFW8G912Y7"
};

// Config is now set!
const CONFIG_NOT_SET = false;
console.log('✅ CLEmail Firebase config loaded for project:', clemailConfig.projectId);

// Global variables for CLEmail Firebase
let clemailApp = null;
let clemailDb = null;
let clemailAuth = null;
let clemailInitialized = false;

// Promise to track initialization
window.clemailReady = new Promise((resolve) => {
  window._resolveClemailReady = resolve;
});

/**
 * Initialize CLEmail Firebase with authentication from HealthcareITDatabase
 * This function must be called after the main auth.js has initialized
 */
async function initializeClemailWithAuth() {
  try {
    console.log('🚀 Initializing CLEmail Firebase...');
    
    // Check if config is set
    if (CONFIG_NOT_SET) {
      const errorMsg = 'CLEmail Firebase config not set! Please update js/clemail-auth.js with your actual Firebase config from the CLEmail project.';
      console.error('❌ ' + errorMsg);
      throw new Error(errorMsg);
    }
    
    // Wait for main Firebase (HealthcareITDatabase) to be ready
    if (!window.firebaseReady) {
      console.error('❌ Main Firebase not initialized. Make sure auth.js is loaded first.');
      throw new Error('Main Firebase not initialized');
    }
    
    await window.firebaseReady;
    console.log('✅ Main Firebase ready, proceeding with CLEmail initialization...');
    
    // Check if user is authenticated
    if (!window.auth || !window.auth.currentUser) {
      console.warn('⚠️ No authenticated user found. CLEmail access will be limited.');
    }
    
    // Import Firebase modules
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
    const { getFirestore, connectFirestoreEmulator } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    const { getAuth, connectAuthEmulator } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    
    // Initialize CLEmail app as a secondary Firebase app
    clemailApp = initializeApp(clemailConfig, 'clemail');
    console.log('✅ CLEmail Firebase app initialized');
    
    // Initialize CLEmail Firestore
    clemailDb = getFirestore(clemailApp);
    console.log('✅ CLEmail Firestore initialized');
    
    // Initialize CLEmail Auth (we'll use this to sign in with custom token)
    clemailAuth = getAuth(clemailApp);
    console.log('✅ CLEmail Auth initialized');
    
    // If we have a user authenticated in the main app, sign them into CLEmail
    if (window.auth && window.auth.currentUser) {
      await authenticateWithClemail(window.auth.currentUser);
    }
    
    // Expose CLEmail instances globally
    window.clemailApp = clemailApp;
    window.clemailDb = clemailDb;
    window.clemailAuth = clemailAuth;
    
    clemailInitialized = true;
    
    // Resolve the ready promise
    if (window._resolveClemailReady) {
      window._resolveClemailReady({ 
        app: clemailApp, 
        db: clemailDb, 
        auth: clemailAuth 
      });
    }
    
    console.log('🎉 CLEmail Firebase initialization complete');
    
    return { app: clemailApp, db: clemailDb, auth: clemailAuth };
    
  } catch (error) {
    console.error('❌ CLEmail Firebase initialization failed:', error);
    throw error;
  }
}

/**
 * Authenticate the user with CLEmail using their HealthcareITDatabase auth
 * For cross-project authentication, we need to sign in the user to CLEmail
 */
async function authenticateWithClemail(user) {
  try {
    console.log('🔑 Authenticating user with CLEmail:', user.email);
    
    // Get the ID token from the main auth
    const idToken = await user.getIdToken();
    console.log('✅ Got ID token from main auth');
    
    // Import auth functions
    const { signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    
    // Sign in anonymously to CLEmail
    // This gives us request.auth in security rules
    // Security rules should check the user's email from the main app
    console.log('🔐 Signing in anonymously to CLEmail...');
    const userCredential = await signInAnonymously(clemailAuth);
    console.log('✅ Signed in anonymously to CLEmail:', userCredential.user.uid);
    
    // Store the main app's user info for security rules to access
    // This can be checked via the Railway backend or custom claims
    window.clemailUserEmail = user.email;
    window.clemailUserId = user.uid;
    
    console.log('⚠️ Note: Security rules should verify user email via Railway backend');
    console.log('ℹ️ Authenticated user email:', user.email);
    console.log('✅ CLEmail authentication complete');
    
  } catch (error) {
    console.error('❌ CLEmail authentication failed:', error);
    
    // If anonymous auth fails, check if it's enabled
    if (error.code === 'auth/operation-not-allowed') {
      console.error('❌ Anonymous authentication is not enabled in CLEmail Firebase Console');
      console.error('📝 Please enable Anonymous Authentication in Firebase Console > Authentication > Sign-in method');
    }
    
    throw error;
  }
}

/**
 * Helper function to get an authenticated Firestore reference
 * This ensures the user is authenticated before accessing CLEmail
 */
async function getClemailDb() {
  if (!clemailInitialized) {
    console.log('⏳ CLEmail not initialized, waiting...');
    await window.clemailReady;
  }
  
  // Check if user is authenticated in main app
  if (!window.auth || !window.auth.currentUser) {
    throw new Error('User must be authenticated to access CLEmail');
  }
  
  // Check if user is verified
  const authState = window.getCurrentAuthState ? window.getCurrentAuthState() : null;
  if (!authState || !authState.isVerified) {
    throw new Error('User must be verified to access CLEmail');
  }
  
  // Check if CLEmail auth is ready
  if (!clemailAuth || !clemailAuth.currentUser) {
    console.warn('⚠️ CLEmail auth not ready, attempting to authenticate...');
    await authenticateWithClemail(window.auth.currentUser);
  }
  
  return clemailDb;
}

/**
 * Secure Firestore operation wrapper
 * Ensures user is authenticated before performing operations
 */
async function secureClemailOperation(operation, errorMessage = 'CLEmail operation failed') {
  try {
    const db = await getClemailDb();
    return await operation(db);
  } catch (error) {
    console.error(`❌ ${errorMessage}:`, error);
    throw error;
  }
}

/**
 * Listen for auth state changes in main app and sync with CLEmail
 */
function setupClemailAuthSync() {
  if (!window.auth) {
    console.warn('⚠️ Main auth not available, cannot setup CLEmail auth sync');
    return;
  }
  
  const { onAuthStateChanged } = window.auth.constructor;
  
  // This is a workaround - ideally use Firebase Auth's onAuthStateChanged
  // But since we're using a secondary app, we'll listen to the main app's auth changes
  if (window.onAuthStateChanged) {
    const originalCallback = window.onAuthStateChanged;
    window.onAuthStateChanged = async (authState) => {
      // Call original callback
      if (typeof originalCallback === 'function') {
        originalCallback(authState);
      }
      
      // Sync with CLEmail
      if (authState.isLoggedIn && authState.isVerified && authState.user) {
        console.log('🔄 Syncing auth state with CLEmail...');
        try {
          if (!clemailInitialized) {
            await initializeClemailWithAuth();
          }
          await authenticateWithClemail(authState.user);
        } catch (error) {
          console.error('❌ Failed to sync auth with CLEmail:', error);
        }
      }
    };
  }
}

// Expose functions globally
window.initializeClemailWithAuth = initializeClemailWithAuth;
window.getClemailDb = getClemailDb;
window.secureClemailOperation = secureClemailOperation;
window.isClemailReady = () => clemailInitialized;

// Auto-initialize when main Firebase is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Wait a bit for auth.js to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (window.firebaseReady) {
        await window.firebaseReady;
        await initializeClemailWithAuth();
        setupClemailAuthSync();
      }
    } catch (error) {
      console.error('❌ Auto-initialization of CLEmail failed:', error);
    }
  });
} else {
  // DOM already loaded
  setTimeout(async () => {
    try {
      if (window.firebaseReady) {
        await window.firebaseReady;
        await initializeClemailWithAuth();
        setupClemailAuthSync();
      }
    } catch (error) {
      console.error('❌ Auto-initialization of CLEmail failed:', error);
    }
  }, 1000);
}

console.log('📋 CLEmail Auth Module loaded, waiting for initialization...');

