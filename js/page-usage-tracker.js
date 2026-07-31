/**
 * Page Usage Tracker
 * 
 * Lightweight script to track page visits in Firebase.
 * Include this script at the bottom of any CRM page you want to track.
 * 
 * Usage:
 * <script src="../js/page-usage-tracker.js"></script>
 */

(function() {
    'use strict';

    // Only track if Firebase is initialized and user is authenticated
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.warn('Page Usage Tracker: Firebase not initialized');
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // Track page view
    function trackPageView(user) {
        try {
            // Get page info
            const pagePath = window.location.pathname.split('/').pop() || 'index.html';
            const pageFullPath = window.location.pathname;
            const pageTitle = document.title;
            
            // Prepare tracking data
            const trackingData = {
                pagePath: pagePath,
                pageFullPath: pageFullPath,
                pageTitle: pageTitle,
                userId: user.uid,
                userEmail: user.email || 'unknown',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'direct'
            };

            // Log to Firestore
            db.collection('pageUsageTracking')
                .add(trackingData)
                .then(() => {
                    console.log('Page view tracked:', pagePath);
                })
                .catch((error) => {
                    console.error('Error tracking page view:', error);
                });

        } catch (error) {
            console.error('Error in trackPageView:', error);
        }
    }

    // Wait for auth state
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Small delay to ensure page is loaded
            setTimeout(() => {
                trackPageView(user);
            }, 500);
        }
    });
})();
