/**
 * Auth.js Cache Buster
 * This script ensures users get the latest version of auth.js
 */

(function() {
  const CURRENT_AUTH_VERSION = '1.1.0';
  const VERSION_KEY = 'healthluminate_auth_version';
  
  // Check stored version
  const storedVersion = localStorage.getItem(VERSION_KEY);
  
  if (storedVersion !== CURRENT_AUTH_VERSION) {
    console.log(`🔄 Auth version update detected: ${storedVersion || 'none'} → ${CURRENT_AUTH_VERSION}`);
    
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
          console.log(`🗑️ Cleared cache: ${name}`);
        });
      });
    }
    
    // Update stored version
    localStorage.setItem(VERSION_KEY, CURRENT_AUTH_VERSION);
    
    // Force reload auth.js by adding version parameter
    const authScript = document.querySelector('script[src*="auth.js"]');
    if (authScript) {
      const src = authScript.src;
      const newSrc = src.includes('?') 
        ? src.replace(/[?&]v=[\d.]+/, '') + `&v=${CURRENT_AUTH_VERSION}`
        : src + `?v=${CURRENT_AUTH_VERSION}`;
      
      // Create new script element
      const newScript = document.createElement('script');
      newScript.src = newSrc;
      authScript.parentNode.replaceChild(newScript, authScript);
      
      console.log(`✅ Auth.js updated to v${CURRENT_AUTH_VERSION}`);
    }
  }
})(); 