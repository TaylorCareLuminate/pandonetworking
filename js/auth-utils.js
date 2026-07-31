// Authentication utilities for protected pages
// Save this as: js/auth-utils.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { 
  getAuth, 
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Define page permissions by domain
export const PAGE_PERMISSIONS = {
  // Pages that any authenticated user can access
  'dashboard.html': ['*'],
  'profile.html': ['*'],
  
  // Pages only for specific domains
  'client-portal.html': ['healthluminate.com', 'careluminate.com'],
  'admin-panel.html': ['healthluminate.com'],
  'company-data.html': ['client1.com', 'client2.com'],
  
  // You can add more pages and their allowed domains here
};

// Helper function to get domain from email
export function getDomainFromEmail(email) {
  return email.split('@')[1].toLowerCase();
}

// Check if user has access to current page
export function checkPageAccess(userEmail, currentPage) {
  const domain = getDomainFromEmail(userEmail);
  const allowedDomains = PAGE_PERMISSIONS[currentPage] || [];
  
  // If page allows all domains or user's domain is specifically allowed
  return allowedDomains.includes('*') || allowedDomains.includes(domain);
}

// Get current page filename
export function getCurrentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

// Redirect to login if not authenticated
export function redirectToLogin() {
  window.location.href = 'login.html';
}

// Show access denied message
export function showAccessDenied() {
  document.body.innerHTML = `
    <div style="
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #fafafa;
    ">
      <div style="
        background: white;
        padding: 3rem 2rem;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        text-align: center;
        max-width: 500px;
      ">
        <h1 style="color: #2D6B83; margin-bottom: 1rem;">Access Denied</h1>
        <p style="color: #5B5B5B; margin-bottom: 2rem;">
          Sorry, your email domain is not authorized to access this page. 
          Please contact support if you believe this is an error.
        </p>
        <button onclick="window.location.href='index.html'" style="
          padding: 0.9rem 1.8rem;
          background-color: #DBA660;
          color: white;
          border: none;
          border-radius: 30px;
          font-weight: 600;
          cursor: pointer;
          margin-right: 1rem;
        ">Go Home</button>
        <button onclick="logout()" style="
          padding: 0.9rem 1.8rem;
          background-color: #5B5B5B;
          color: white;
          border: none;
          border-radius: 30px;
          font-weight: 600;
          cursor: pointer;
        ">Logout</button>
      </div>
    </div>
  `;
  
  // Add logout function to global scope
  window.logout = async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  };
}

// Main protection function - call this on protected pages
export function protectPage(requiredAccess = null) {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      const currentPage = getCurrentPageName();
      
      if (!user) {
        // User not logged in
        redirectToLogin();
        reject('Not authenticated');
        return;
      }
      
      if (!user.emailVerified) {
        // Email not verified
        alert('Please verify your email address before accessing this page.');
        redirectToLogin();
        reject('Email not verified');
        return;
      }
      
      // Check domain-based access
      if (!checkPageAccess(user.email, currentPage)) {
        showAccessDenied();
        reject('Access denied');
        return;
      }
      
      // User has access
      resolve(user);
    });
  });
}

// Display user info in header (optional utility)
export function displayUserInfo(user, containerId = 'user-info') {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem;">
        <span>Welcome, ${user.displayName || user.email}</span>
        <button onclick="logout()" style="
          padding: 0.5rem 1rem;
          background-color: #5B5B5B;
          color: white;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.9rem;
        ">Logout</button>
      </div>
    `;
    
    // Add logout function
    window.logout = async () => {
      await signOut(auth);
      window.location.href = 'login.html';
    };
  }
}