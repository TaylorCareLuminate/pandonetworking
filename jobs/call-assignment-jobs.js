/**
 * Call Assignment Background Jobs
 * 
 * This script handles automated maintenance tasks for the call assignment system:
 * 1. Release expired assignments (every 15 minutes)
 * 2. Daily 2 PM rebalance (once per day)
 * 3. Cleanup abandoned reservations (hourly)
 * 
 * DEPLOYMENT OPTIONS:
 * 
 * Option 1: Node.js Cron Job (Simple)
 *   - Run this script on a server with: node call-assignment-jobs.js
 *   - Keeps running indefinitely, executes tasks on schedule
 *   - Requires: Node.js 16+, active server/VM
 * 
 * Option 2: Firebase Cloud Functions (Recommended)
 *   - Deploy as serverless functions (see firebase-functions.js)
 *   - No server maintenance required
 *   - Automatic scaling and monitoring
 * 
 * Option 3: Separate Cron Jobs
 *   - Schedule individual functions via system cron
 *   - Most control, but more complex setup
 */

// Import required modules
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// NOTE: You'll need to download service account key from Firebase Console
// Go to: Project Settings → Service Accounts → Generate New Private Key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    TIMEZONE: 'America/Denver', // Mountain Time
    REBALANCE_HOUR: 14, // 2 PM (24-hour format)
    REBALANCE_MINUTE: 0,
    RELEASE_INTERVAL_MINUTES: 15, // Release expired every 15 min
    CLEANUP_INTERVAL_MINUTES: 60, // Cleanup abandoned every hour
    ABANDONED_THRESHOLD_HOURS: 24, // Consider reservation abandoned after 24h no activity
    BATCH_SIZE: 500 // Firestore batch write limit
};

// ============================================================================
// JOB 1: RELEASE EXPIRED ASSIGNMENTS
// ============================================================================

/**
 * Releases assignments that have expired (past assignmentExpiry time)
 * 
 * When agents go idle for 15+ minutes, their assignments should be released
 * back to the pool so other agents can call them.
 * 
 * Runs: Every 15 minutes
 * 
 * What it does:
 * 1. Query phone_activities for pending/scheduled calls with assignedTo set
 * 2. Check if assignmentExpiry is in the past
 * 3. Clear assignedTo, assignedAt, assignmentExpiry fields
 * 4. Log results
 */
async function releaseExpiredAssignments() {
    console.log('========================================');
    console.log('🕐 JOB: Release Expired Assignments');
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    console.log('========================================');

    try {
        const now = admin.firestore.Timestamp.now();
        
        // Query for assigned calls
        const snapshot = await db.collection('phone_activities')
            .where('status', 'in', ['pending', 'scheduled'])
            .get();

        let expiredCount = 0;
        const batches = [];
        let currentBatch = db.batch();
        let operationsInBatch = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Check if assigned and expired
            if (data.assignedTo && data.assignmentExpiry) {
                let expiry;
                
                // Handle different expiry formats
                if (data.assignmentExpiry.toDate) {
                    expiry = data.assignmentExpiry;
                } else if (typeof data.assignmentExpiry === 'string') {
                    expiry = admin.firestore.Timestamp.fromDate(new Date(data.assignmentExpiry));
                } else {
                    return; // Skip if invalid format
                }
                
                // Check if expired
                if (expiry.toMillis() <= now.toMillis()) {
                    currentBatch.update(doc.ref, {
                        assignedTo: admin.firestore.FieldValue.delete(),
                        assignedAt: admin.firestore.FieldValue.delete(),
                        assignmentExpiry: admin.firestore.FieldValue.delete()
                    });
                    
                    expiredCount++;
                    operationsInBatch++;
                    
                    // Firebase limit: 500 operations per batch
                    if (operationsInBatch >= CONFIG.BATCH_SIZE) {
                        batches.push(currentBatch);
                        currentBatch = db.batch();
                        operationsInBatch = 0;
                    }
                }
            }
        });

        // Add final batch if it has operations
        if (operationsInBatch > 0) {
            batches.push(currentBatch);
        }

        // Commit all batches
        for (const batch of batches) {
            await batch.commit();
        }

        console.log(`✅ Released ${expiredCount} expired assignments`);
        console.log(`📦 Used ${batches.length} batch(es)`);
        
        return { success: true, count: expiredCount };

    } catch (error) {
        console.error('❌ Error releasing expired assignments:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// JOB 2: DAILY REBALANCE AT 2 PM
// ============================================================================

/**
 * Force rebalance all campaigns at 2 PM Mountain Time daily
 * 
 * This clears ALL assignments so agents get a fresh start with new assignments
 * based on their current reservations. This is the daily "reset" point.
 * 
 * Runs: Once per day at 2 PM Mountain Time
 * 
 * What it does:
 * 1. Query ALL phone_activities with assignments
 * 2. Clear assignedTo, assignedAt, assignmentExpiry for ALL
 * 3. Log results
 * 
 * Note: Agents will get new assignments when they next load the phone-calls page
 */
async function dailyRebalance() {
    console.log('========================================');
    console.log('🔄 JOB: Daily 2 PM Rebalance');
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    console.log('========================================');

    try {
        // Query all assigned calls (no expiry check - clear everything)
        const snapshot = await db.collection('phone_activities')
            .where('status', 'in', ['pending', 'scheduled'])
            .get();

        let releasedCount = 0;
        const batches = [];
        let currentBatch = db.batch();
        let operationsInBatch = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            
            // If has assignment, clear it
            if (data.assignedTo) {
                currentBatch.update(doc.ref, {
                    assignedTo: admin.firestore.FieldValue.delete(),
                    assignedAt: admin.firestore.FieldValue.delete(),
                    assignmentExpiry: admin.firestore.FieldValue.delete()
                });
                
                releasedCount++;
                operationsInBatch++;
                
                // Firebase limit: 500 operations per batch
                if (operationsInBatch >= CONFIG.BATCH_SIZE) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationsInBatch = 0;
                }
            }
        });

        // Add final batch if it has operations
        if (operationsInBatch > 0) {
            batches.push(currentBatch);
        }

        // Commit all batches
        for (const batch of batches) {
            await batch.commit();
        }

        console.log(`✅ Daily rebalance complete - released ${releasedCount} assignments`);
        console.log(`📦 Used ${batches.length} batch(es)`);
        console.log(`🔔 Agents will receive new assignments when they reload`);
        
        return { success: true, count: releasedCount };

    } catch (error) {
        console.error('❌ Error during daily rebalance:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// JOB 3: CLEANUP ABANDONED RESERVATIONS
// ============================================================================

/**
 * Clean up abandoned reservations (no activity in 24 hours)
 * 
 * If an agent makes a reservation but never loads any calls or completes any work
 * for 24+ hours, mark their reservation as abandoned.
 * 
 * Runs: Every hour
 * 
 * What it does:
 * 1. Query active reservations
 * 2. Check if any phone_activities assigned to that user in last 24h
 * 3. Check if any completions by that user in last 24h
 * 4. If neither, mark reservation as 'abandoned'
 * 5. Release any calls still assigned to that user
 */
async function cleanupAbandonedReservations() {
    console.log('========================================');
    console.log('🧹 JOB: Cleanup Abandoned Reservations');
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    console.log('========================================');

    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - CONFIG.ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000);
        const twentyFourHoursAgoTimestamp = admin.firestore.Timestamp.fromDate(twentyFourHoursAgo);

        // Get active reservations
        const reservationsSnapshot = await db.collection('callReservations')
            .where('status', '==', 'active')
            .get();

        console.log(`📋 Checking ${reservationsSnapshot.size} active reservations...`);

        let abandonedCount = 0;
        let skippedFutureCount = 0;
        const batch = db.batch();
        let operationsInBatch = 0;

        for (const reservationDoc of reservationsSnapshot.docs) {
            const reservation = reservationDoc.data();
            const userEmail = reservation.userEmail;

            // CRITICAL: Skip reservations scheduled for the future
            // Only check reservations that have already started
            const startDate = reservation.startDate ? new Date(reservation.startDate) : null;
            if (startDate && startDate > twentyFourHoursAgo) {
                // This reservation is either in the future or just started - skip it
                skippedFutureCount++;
                continue;
            }

            // Check 1: Any assignments in last 24h?
            const assignmentsSnapshot = await db.collection('phone_activities')
                .where('assignedTo', '==', userEmail)
                .where('assignedAt', '>=', twentyFourHoursAgoTimestamp.toDate().toISOString())
                .limit(1)
                .get();

            // Check 2: Any completions in last 24h?
            const completionsSnapshot = await db.collection('phone_activities')
                .where('completedBy', '==', userEmail)
                .where('completedAt', '>=', twentyFourHoursAgoTimestamp.toDate().toISOString())
                .limit(1)
                .get();

            // If no activity in last 24h, mark as abandoned
            if (assignmentsSnapshot.empty && completionsSnapshot.empty) {
                console.log(`⚠️  Abandoning reservation for ${userEmail} (no activity in 24h)`);
                
                batch.update(reservationDoc.ref, {
                    status: 'abandoned',
                    abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
                    abandonedReason: 'No activity detected in 24 hours'
                });
                
                abandonedCount++;
                operationsInBatch++;

                // Also release any calls still assigned to this user
                const stillAssignedSnapshot = await db.collection('phone_activities')
                    .where('assignedTo', '==', userEmail)
                    .where('status', 'in', ['pending', 'scheduled'])
                    .get();

                stillAssignedSnapshot.forEach((doc) => {
                    batch.update(doc.ref, {
                        assignedTo: admin.firestore.FieldValue.delete(),
                        assignedAt: admin.firestore.FieldValue.delete(),
                        assignmentExpiry: admin.firestore.FieldValue.delete()
                    });
                    operationsInBatch++;
                });

                // Commit if approaching batch limit
                if (operationsInBatch >= CONFIG.BATCH_SIZE - 100) { // Leave buffer for next iteration
                    await batch.commit();
                    operationsInBatch = 0;
                }
            }
        }

        // Commit final batch
        if (operationsInBatch > 0) {
            await batch.commit();
        }

        console.log(`✅ Cleanup complete - marked ${abandonedCount} reservations as abandoned`);
        console.log(`⏭️  Skipped ${skippedFutureCount} future/recent reservations`);
        
        return { success: true, count: abandonedCount, skippedFuture: skippedFutureCount };

    } catch (error) {
        console.error('❌ Error cleaning up abandoned reservations:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Check if it's time to run the daily rebalance (2 PM Mountain Time)
 */
function shouldRunDailyRebalance() {
    const now = new Date();
    
    // Convert to Mountain Time
    const options = { timeZone: CONFIG.TIMEZONE, hour12: false };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    
    // Check if it's 2 PM (within the minute)
    return hour === CONFIG.REBALANCE_HOUR && minute === CONFIG.REBALANCE_MINUTE;
}

/**
 * Track last run times to avoid duplicate runs
 */
const lastRun = {
    releaseExpired: null,
    dailyRebalance: null,
    cleanup: null
};

/**
 * Main scheduler loop
 */
async function runScheduler() {
    console.log('🚀 Call Assignment Background Jobs Started');
    console.log(`📍 Timezone: ${CONFIG.TIMEZONE}`);
    console.log(`⏰ Daily Rebalance: ${CONFIG.REBALANCE_HOUR}:${CONFIG.REBALANCE_MINUTE.toString().padStart(2, '0')}`);
    console.log(`🔄 Release Expired: Every ${CONFIG.RELEASE_INTERVAL_MINUTES} minutes`);
    console.log(`🧹 Cleanup Abandoned: Every ${CONFIG.CLEANUP_INTERVAL_MINUTES} minutes`);
    console.log('========================================\n');

    // Run immediately on startup
    await releaseExpiredAssignments();

    // Main loop - check every minute
    setInterval(async () => {
        const now = new Date();
        const currentMinute = now.getMinutes();

        try {
            // Job 1: Release Expired (every 15 minutes)
            if (currentMinute % CONFIG.RELEASE_INTERVAL_MINUTES === 0) {
                const key = now.toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
                if (lastRun.releaseExpired !== key) {
                    lastRun.releaseExpired = key;
                    await releaseExpiredAssignments();
                }
            }

            // Job 2: Daily Rebalance (2 PM Mountain Time)
            if (shouldRunDailyRebalance()) {
                const dateKey = now.toISOString().substring(0, 10); // YYYY-MM-DD
                if (lastRun.dailyRebalance !== dateKey) {
                    lastRun.dailyRebalance = dateKey;
                    await dailyRebalance();
                }
            }

            // Job 3: Cleanup Abandoned (every 60 minutes)
            if (currentMinute % CONFIG.CLEANUP_INTERVAL_MINUTES === 0) {
                const key = now.toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
                if (lastRun.cleanup !== key) {
                    lastRun.cleanup = key;
                    await cleanupAbandonedReservations();
                }
            }

        } catch (error) {
            console.error('❌ Error in scheduler loop:', error);
        }

    }, 60 * 1000); // Check every minute
}

// ============================================================================
// ERROR HANDLING & PROCESS MANAGEMENT
// ============================================================================

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Don't exit - keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - keep running
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});

// ============================================================================
// EXPORT FOR TESTING / MANUAL RUNS
// ============================================================================

module.exports = {
    releaseExpiredAssignments,
    dailyRebalance,
    cleanupAbandonedReservations,
    runScheduler
};

// ============================================================================
// START SCHEDULER (if run directly)
// ============================================================================

if (require.main === module) {
    runScheduler().catch(error => {
        console.error('❌ Fatal error starting scheduler:', error);
        process.exit(1);
    });
}

