// Firebase configuration and initialization
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBG814ayodB3Gt-Dn_wNDPTDaMeEF41Gck",
  authDomain: "ppchotsheets.firebaseapp.com",
  databaseURL: "https://healthcareitdatabase-default-rtdb.firebaseio.com",
  projectId: "healthcareitdatabase-default-rtdb",
  storageBucket: "ppchotsheets.firebasestorage.app",
  messagingSenderId: "481606291946",
  appId: "1:481606291946:web:c9dc545db5cfc0ad692293",
  measurementId: "G-XM0BNPJ05Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Export the app for other uses
export default app;