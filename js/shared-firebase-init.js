// Shared Firebase Initialization Script
// Version: 1.0.0
// Purpose: Prevent Firebase app conflicts between /crm and /connect directories
// This ensures that only ONE Firebase app instance exists across all pages

console.log('🔧 Shared Firebase Init - Loading...');

// Firebase configuration (healthcareitdatabase)
const SHARED_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBpsxZCSULnandhpdVLI9nvsxd3_BH4dfs",
  authDomain: "healthcareitdatabase.firebaseapp.com",
  databaseURL: "https://healthcareitdatabase-default-rtdb.firebaseio.com",
  projectId: "healthcareitdatabase",
  storageBucket: "healthcareitdatabase.firebasestorage.app",
  messagingSenderId: "1024935247661",
  appId: "1:1024935247661:web:a74be5c7b9df74245bdda4",
  measurementId: "G-60KWQ8SJW4"
};

// Global promise that resolves when Firebase is ready
if (!window.sharedFirebaseReady) {
  window.sharedFirebaseReady = new Promise((resolve) => {
    window._resolveSharedFirebase = resolve;
  });
}

// Track if we've already initialized
let initializationStarted = false;

/**
 * Gets or creates the shared Firebase app instance
 * This is safe to call from multiple pages - it will always return the same instance
 */
async function getSharedFirebaseApp() {
  try {
    // Import Firebase modules
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
    const { getDatabase } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
    
    // Check if app already exists
    const existingApps = getApps();
    const existingDefaultApp = existingApps.find(a => a.name === '[DEFAULT]');
    
    let app;
    if (existingDefaultApp) {
      console.log('✅ Using existing shared Firebase [DEFAULT] app');
      app = existingDefaultApp;
    } else {
      console.log('🔥 Initializing new shared Firebase [DEFAULT] app');
      app = initializeApp(SHARED_FIREBASE_CONFIG);
    }
    
    // Get auth instance
    const auth = getAuth(app);
    
    // NOTE: Do NOT call setPersistence(browserLocalPersistence) here.
    // getAuth()'s default persistence (IndexedDB) already survives browser
    // restarts, and forcing localStorage migrates the saved session between
    // storage layers, which logs out tabs open in other directories.
    // See js/auth.js v1.5 fix for details.
    
    // Get database instances
    const database = getDatabase(app);
    const firestore = getFirestore(app);
    
    // Expose to window for compatibility with existing code
    if (!window.auth) window.auth = auth;
    if (!window.firebaseApp) window.firebaseApp = app;
    if (!window.database) window.database = database;
    if (!window.db) window.db = firestore;
    
    // Expose Firebase utilities
    if (!window.firebaseRTDB) {
      const { ref, get, set, update, remove, child } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
      window.firebaseRTDB = {
        ref: (path) => ref(database, path),
        get: get,
        set: set,
        update: update,
        remove: remove,
        child: child
      };
    }
    
    console.log('✅ Shared Firebase app ready');
    
    // Resolve the promise if not already resolved
    if (window._resolveSharedFirebase) {
      window._resolveSharedFirebase({ app, auth, database, firestore });
      window._resolveSharedFirebase = null; // Only resolve once
    }
    
    return { app, auth, database, firestore };
    
  } catch (error) {
    console.error('❌ Shared Firebase initialization failed:', error);
    throw error;
  }
}

/**
 * Initialize shared Firebase (safe to call multiple times)
 */
async function initSharedFirebase() {
  if (initializationStarted) {
    console.log('⏳ Shared Firebase initialization already in progress, waiting...');
    return await window.sharedFirebaseReady;
  }
  
  initializationStarted = true;
  console.log('🚀 Starting shared Firebase initialization...');
  
  try {
    const result = await getSharedFirebaseApp();
    return result;
  } catch (error) {
    console.error('❌ Shared Firebase initialization error:', error);
    initializationStarted = false; // Allow retry
    throw error;
  }
}

// Expose globally
window.getSharedFirebaseApp = getSharedFirebaseApp;
window.initSharedFirebase = initSharedFirebase;
window.SHARED_FIREBASE_CONFIG = SHARED_FIREBASE_CONFIG;

// Auto-initialize if auth.js hasn't already done it
// This ensures pages work even if they don't explicitly call init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to let auth.js load first if it's present
    setTimeout(() => {
      if (!window.auth) {
        console.log('🔄 Auto-initializing shared Firebase (auth.js not detected)');
        initSharedFirebase().catch(err => {
          console.error('❌ Auto-initialization failed:', err);
        });
      } else {
        console.log('✅ Auth.js already initialized Firebase, skipping auto-init');
      }
    }, 500);
  });
} else {
  setTimeout(() => {
    if (!window.auth) {
      console.log('🔄 Auto-initializing shared Firebase (auth.js not detected)');
      initSharedFirebase().catch(err => {
        console.error('❌ Auto-initialization failed:', err);
      });
    } else {
      console.log('✅ Auth.js already initialized Firebase, skipping auto-init');
    }
  }, 500);
}

console.log('✅ Shared Firebase Init script loaded');
