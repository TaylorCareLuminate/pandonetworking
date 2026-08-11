/**
 * Firebase Cloud Functions - Call Assignment Background Jobs
 * 
 * This is the RECOMMENDED deployment method for the background jobs.
 * 
 * ADVANTAGES OVER NODE.JS CRON:
 * - No server to maintain
 * - Automatic scaling
 * - Built-in monitoring and logging
 * - Firebase console integration
 * - Pay only for execution time
 * - Automatic retries on failure
 * 
 * DEPLOYMENT:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Login: firebase login
 * 3. Initialize: firebase init functions (if not already done)
 * 4. Deploy: firebase deploy --only functions
 * 
 * FUNCTIONS DEPLOYED:
 * - releaseExpiredAssignments (runs every 15 minutes)
 * - dailyRebalance (runs daily at 2 PM Mountain Time)
 * - cleanupAbandonedReservations (runs every hour)
 * - manualReleaseExpired (HTTP endpoint for manual trigger)
 * - manualRebalance (HTTP endpoint for manual trigger)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    TIMEZONE: 'America/Denver',
    BATCH_SIZE: 500,
    ABANDONED_THRESHOLD_HOURS: 24
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Release expired assignments helper
 */
async function releaseExpiredAssignmentsHelper() {
    console.log('🕐 Starting: Release Expired Assignments');
    const startTime = Date.now();

    try {
        const now = admin.firestore.Timestamp.now();
        
        const snapshot = await db.collection('phone_activities')
            .where('status', 'in', ['pending', 'scheduled'])
            .get();

        let expiredCount = 0;
        const batches = [];
        let currentBatch = db.batch();
        let operationsInBatch = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            
            if (data.assignedTo && data.assignmentExpiry) {
                let expiry;
                
                if (data.assignmentExpiry.toDate) {
                    expiry = data.assignmentExpiry;
                } else if (typeof data.assignmentExpiry === 'string') {
                    expiry = admin.firestore.Timestamp.fromDate(new Date(data.assignmentExpiry));
                } else {
                    return;
                }
                
                if (expiry.toMillis() <= now.toMillis()) {
                    currentBatch.update(doc.ref, {
                        assignedTo: admin.firestore.FieldValue.delete(),
                        assignedAt: admin.firestore.FieldValue.delete(),
                        assignmentExpiry: admin.firestore.FieldValue.delete()
                    });
                    
                    expiredCount++;
                    operationsInBatch++;
                    
                    if (operationsInBatch >= CONFIG.BATCH_SIZE) {
                        batches.push(currentBatch);
                        currentBatch = db.batch();
                        operationsInBatch = 0;
                    }
                }
            }
        });

        if (operationsInBatch > 0) {
            batches.push(currentBatch);
        }

        for (const batch of batches) {
            await batch.commit();
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Released ${expiredCount} expired assignments in ${duration}ms`);
        
        return { 
            success: true, 
            count: expiredCount,
            batches: batches.length,
            duration: duration 
        };

    } catch (error) {
        console.error('❌ Error releasing expired assignments:', error);
        throw error;
    }
}

/**
 * Daily rebalance helper
 */
async function dailyRebalanceHelper() {
    console.log('🔄 Starting: Daily Rebalance');
    const startTime = Date.now();

    try {
        const snapshot = await db.collection('phone_activities')
            .where('status', 'in', ['pending', 'scheduled'])
            .get();

        let releasedCount = 0;
        const batches = [];
        let currentBatch = db.batch();
        let operationsInBatch = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            
            if (data.assignedTo) {
                currentBatch.update(doc.ref, {
                    assignedTo: admin.firestore.FieldValue.delete(),
                    assignedAt: admin.firestore.FieldValue.delete(),
                    assignmentExpiry: admin.firestore.FieldValue.delete()
                });
                
                releasedCount++;
                operationsInBatch++;
                
                if (operationsInBatch >= CONFIG.BATCH_SIZE) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationsInBatch = 0;
                }
            }
        });

        if (operationsInBatch > 0) {
            batches.push(currentBatch);
        }

        for (const batch of batches) {
            await batch.commit();
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Daily rebalance complete - released ${releasedCount} assignments in ${duration}ms`);
        
        return { 
            success: true, 
            count: releasedCount,
            batches: batches.length,
            duration: duration 
        };

    } catch (error) {
        console.error('❌ Error during daily rebalance:', error);
        throw error;
    }
}

/**
 * Cleanup abandoned reservations helper
 */
async function cleanupAbandonedReservationsHelper() {
    console.log('🧹 Starting: Cleanup Abandoned Reservations');
    const startTime = Date.now();

    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - CONFIG.ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000);
        const twentyFourHoursAgoStr = twentyFourHoursAgo.toISOString();

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

            const assignmentsSnapshot = await db.collection('phone_activities')
                .where('assignedTo', '==', userEmail)
                .where('assignedAt', '>=', twentyFourHoursAgoStr)
                .limit(1)
                .get();

            const completionsSnapshot = await db.collection('phone_activities')
                .where('completedBy', '==', userEmail)
                .where('completedAt', '>=', twentyFourHoursAgoStr)
                .limit(1)
                .get();

            if (assignmentsSnapshot.empty && completionsSnapshot.empty) {
                console.log(`⚠️  Abandoning reservation for ${userEmail}`);
                
                batch.update(reservationDoc.ref, {
                    status: 'abandoned',
                    abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
                    abandonedReason: 'No activity detected in 24 hours'
                });
                
                abandonedCount++;
                operationsInBatch++;

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

                if (operationsInBatch >= CONFIG.BATCH_SIZE - 100) {
                    await batch.commit();
                    operationsInBatch = 0;
                }
            }
        }

        if (operationsInBatch > 0) {
            await batch.commit();
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Cleanup complete - marked ${abandonedCount} reservations as abandoned in ${duration}ms`);
        console.log(`⏭️  Skipped ${skippedFutureCount} future/recent reservations`);
        
        return { 
            success: true, 
            count: abandonedCount,
            skippedFuture: skippedFutureCount,
            duration: duration 
        };

    } catch (error) {
        console.error('❌ Error cleaning up abandoned reservations:', error);
        throw error;
    }
}

// ============================================================================
// SCHEDULED CLOUD FUNCTIONS
// ============================================================================

/**
 * Release Expired Assignments - Runs every hour (reduced from 15 min to save costs)
 * 
 * Schedule: 0 * * * * (every hour)
 * COST OPTIMIZATION: Changed from every 15 min (96x/day) to hourly (24x/day) = 75% cost reduction
 */
exports.releaseExpiredAssignments = functions
    .runWith({
        timeoutSeconds: 540, // 9 minutes max
        memory: '512MB'
    })
    .pubsub.schedule('every 60 minutes')
    .timeZone(CONFIG.TIMEZONE)
    .onRun(async (context) => {
        console.log('⏰ Scheduled run: releaseExpiredAssignments');
        try {
            const result = await releaseExpiredAssignmentsHelper();
            console.log('📊 Result:', result);
            return result;
        } catch (error) {
            console.error('❌ Function failed:', error);
            throw error; // Cloud Functions will retry
        }
    });

/**
 * Daily Rebalance - Runs at 2 PM Mountain Time every day
 * 
 * Schedule: 0 14 * * * (2 PM daily)
 */
exports.dailyRebalance = functions
    .runWith({
        timeoutSeconds: 540, // 9 minutes max
        memory: '512MB'
    })
    .pubsub.schedule('0 14 * * *') // 2 PM
    .timeZone(CONFIG.TIMEZONE)
    .onRun(async (context) => {
        console.log('⏰ Scheduled run: dailyRebalance (2 PM Mountain Time)');
        try {
            const result = await dailyRebalanceHelper();
            console.log('📊 Result:', result);
            return result;
        } catch (error) {
            console.error('❌ Function failed:', error);
            throw error;
        }
    });

/**
 * Cleanup Abandoned Reservations - Runs every 4 hours (reduced to save costs)
 *
 * Schedule: every 4 hours  (cron: 0 * /4 * * *)
 * COST OPTIMIZATION: Changed from hourly (24x/day) to every 4 hours (6x/day) = 75% cost reduction
 */
exports.cleanupAbandonedReservations = functions
    .runWith({
        timeoutSeconds: 540, // 9 minutes max
        memory: '512MB'
    })
    .pubsub.schedule('0 */4 * * *')
    .timeZone(CONFIG.TIMEZONE)
    .onRun(async (context) => {
        console.log('⏰ Scheduled run: cleanupAbandonedReservations');
        try {
            const result = await cleanupAbandonedReservationsHelper();
            console.log('📊 Result:', result);
            return result;
        } catch (error) {
            console.error('❌ Function failed:', error);
            throw error;
        }
    });

// ============================================================================
// MANUAL TRIGGER ENDPOINTS (HTTP Functions)
// ============================================================================

/**
 * Manual trigger for releasing expired assignments
 * 
 * Usage: 
 * curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/manualReleaseExpired
 * 
 * Or from admin dashboard: fetch('/api/releaseExpired', {method: 'POST'})
 */
exports.manualReleaseExpired = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .https.onRequest(async (req, res) => {
        // Add CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        console.log('🔧 Manual trigger: releaseExpiredAssignments');

        try {
            const result = await releaseExpiredAssignmentsHelper();
            res.status(200).json({
                success: true,
                message: `Released ${result.count} expired assignments`,
                details: result
            });
        } catch (error) {
            console.error('❌ Manual trigger failed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

/**
 * Manual trigger for daily rebalance
 * 
 * Usage: 
 * curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/manualRebalance
 */
exports.manualRebalance = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .https.onRequest(async (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        console.log('🔧 Manual trigger: dailyRebalance');

        try {
            const result = await dailyRebalanceHelper();
            res.status(200).json({
                success: true,
                message: `Rebalanced and released ${result.count} assignments`,
                details: result
            });
        } catch (error) {
            console.error('❌ Manual trigger failed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

// ============================================================================
// ADMIN USER MANAGEMENT
// ============================================================================

/**
 * Update a user's email address in both Firebase Auth and Firestore.
 * Called directly from the admin panel via fetch + Firebase ID token.
 *
 * Client usage (see admin/users.html panelSaveEmail):
 *   const idToken = await auth.currentUser.getIdToken();
 *   await fetch('.../updateUserEmail', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
 *     body: JSON.stringify({ uid, newEmail })
 *   });
 *
 * Deploy:
 *   firebase deploy --only functions:updateUserEmail
 */
exports.updateUserEmail = functions.https.onRequest(async (req, res) => {
    // ── CORS ───────────────────────────────────────────────────────────────
    const allowedOrigins = [
        'https://healthluminate.com',
        'https://healthcareitdatabase.firebaseapp.com',
        'https://healthcareitdatabase.web.app',
        'https://euphonious-crisp-69ab03.netlify.app'
    ];
    const origin = req.headers.origin || '';
    const corsOrigin = allowedOrigins.includes(origin) || origin.startsWith('http://localhost')
        ? origin
        : allowedOrigins[0];

    res.set('Access-Control-Allow-Origin',  corsOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age',       '3600');

    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header.' });
        return;
    }

    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    } catch (e) {
        res.status(401).json({ error: 'Invalid ID token.' });
        return;
    }

    // ── Admin check ────────────────────────────────────────────────────────
    const callerDoc = await db.collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || !callerDoc.data().isAdmin) {
        res.status(403).json({ error: 'Admin access is required.' });
        return;
    }

    // ── Validate payload ───────────────────────────────────────────────────
    const { uid, newEmail } = req.body || {};
    if (!uid || !newEmail) {
        res.status(400).json({ error: 'uid and newEmail are required.' });
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        res.status(400).json({ error: 'Invalid email address format.' });
        return;
    }

    // ── Update ─────────────────────────────────────────────────────────────
    try {
        await admin.auth().updateUser(uid, { email: newEmail });
        await db.collection('users').doc(uid).update({
            email:           newEmail,
            domain:          newEmail.split('@')[1] || '',
            emailUpdatedBy:  decoded.email || decoded.uid,
            emailUpdatedAt:  admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Admin ${decoded.email} updated email for ${uid} → ${newEmail}`);
        res.status(200).json({ success: true, email: newEmail });
    } catch (error) {
        console.error('❌ updateUserEmail error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// CROSS-DOMAIN SSO BRIDGE (HealthLuminate -> Pando Executive Networking)
// ============================================================================

/**
 * Mints a short-lived Firebase custom token for the SAME user who calls this
 * endpoint, so that a session on one origin (healthluminate.com) can be
 * silently re-established on another origin (pandonetworking.com) that
 * shares this Firebase Auth project (healthcareitdatabase).
 *
 * This does NOT let anyone log in as someone else: the caller must already
 * present a valid Firebase ID token (proof they are currently signed in),
 * and the custom token this returns is only ever minted for that same uid.
 *
 * Flow:
 *   1. healthluminate.com/sso-bridge.html (loaded in a hidden iframe by
 *      pandonetworking.com) checks its own Firebase Auth session.
 *   2. If signed in, it POSTs its ID token here with `Authorization: Bearer <idToken>`.
 *   3. This function verifies that ID token and mints a custom token for the
 *      same uid, returned as `{ token }`.
 *   4. The bridge page postMessages the custom token back to
 *      pandonetworking.com, which calls signInWithCustomToken().
 *
 * IMPORTANT: This must be deployed to the `healthcareitdatabase` Firebase
 * project (the project that actually owns these users), NOT `clemail`:
 *   firebase deploy --only functions:mintSsoToken --project healthcareitdatabase
 */
exports.mintSsoToken = functions.https.onRequest(async (req, res) => {
    // ── CORS: only the legacy site is allowed to call this ──────────────────
    const allowedOrigins = [
        'https://healthluminate.com',
        'https://www.healthluminate.com'
    ];
    const origin = req.headers.origin || '';
    const originAllowed = allowedOrigins.includes(origin) || origin.startsWith('http://localhost');

    res.set('Access-Control-Allow-Origin', originAllowed ? origin : allowedOrigins[0]);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    res.set('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method Not Allowed' }); return; }
    if (!originAllowed)           { res.status(403).json({ error: 'Origin not allowed.' }); return; }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header.' });
        return;
    }

    try {
        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
        const customToken = await admin.auth().createCustomToken(decoded.uid);
        console.log(`✅ Minted SSO bridge token for ${decoded.email || decoded.uid}`);
        res.status(200).json({ token: customToken });
    } catch (error) {
        console.error('❌ mintSsoToken error:', error.message);
        res.status(401).json({ error: 'Invalid ID token.' });
    }
});

/**
 * Health check endpoint
 * 
 * Usage: 
 * curl https://us-central1-YOUR-PROJECT.cloudfunctions.net/healthCheck
 */
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        timezone: CONFIG.TIMEZONE,
        functions: [
            'releaseExpiredAssignments',
            'dailyRebalance',
            'cleanupAbandonedReservations',
            'manualReleaseExpired',
            'manualRebalance',
            'reserveQueueDailyTopUp',
            'manualReserveQueueTopUp'
        ]
    });
});

// ============================================================================
// RESERVE QUEUE DAILY TOP-UP WITH CAMPAIGN PIPELINE CAP CHECK
// ============================================================================

const RAILWAY_BASE = 'https://railwayclemail-production.up.railway.app';

// Maximum total pending leads across ALL HeyReach campaigns for a BDR before
// skipping their reserve queue top-up for that day.
const RESERVE_TOPUP_CAP = 35;

/**
 * Fetches pending lead count for a single HeyReach campaign via Railway proxy.
 * Uses the same proxy path that the front-end message_history.html uses.
 */
async function countHeyReachPendingForCampaign(campaignId, apiKey) {
    const PAGE_SIZE = 100;
    let offset = 0;
    let pending = 0;
    let pages = 0;

    while (pages < 50) {
        const response = await fetch(`${RAILWAY_BASE}/proxy/heyreach/campaign/getleadsfromcampaign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ campaignId, offset, limit: PAGE_SIZE, timeFilter: 'Everywhere' })
        });

        if (!response.ok) {
            console.warn(`  Campaign ${campaignId}: HTTP ${response.status}`);
            break;
        }

        const result = await response.json();
        const items = result.items || result.list || result.data || result || [];
        if (!Array.isArray(items) || items.length === 0) break;

        items.forEach(lead => {
            const status = lead.leadCampaignStatus || lead.campaignLeadStatus || lead.status || '';
            if (status === 'Pending') pending++;
        });

        pages++;
        if (items.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return pending;
}

/**
 * Counts total pending leads for a BDR across ALL associated HeyReach campaigns:
 *   1. Connect campaigns stored in bdr_leaders.heyreachCampaigns
 *   2. CRM campaigns (campaigns collection) for the same customer
 *
 * Short-circuits once the cap is reached to avoid unnecessary API calls.
 */
async function countAllPendingForBdr(bdr, apiKeyMap, crmCampaignsByCustomer) {
    const { customerId, connectCampaigns } = bdr;
    const apiKey = customerId ? apiKeyMap[customerId] : null;

    if (!apiKey) {
        console.log(`  ${bdr.name}: no API key — skipping pipeline check`);
        return { total: 0, noApiKey: true };
    }

    // Build deduplicated set of all HeyReach campaign IDs for this BDR
    const campaignIdSet = new Set();

    (connectCampaigns || []).forEach(c => {
        const id = c.id || c.campaignId || c.Id;
        if (id) campaignIdSet.add(parseInt(id));
    });

    const crmCampaigns = crmCampaignsByCustomer[customerId] || [];
    crmCampaigns.forEach(campaign => {
        (campaign.heyreachCampaigns || []).forEach(c => {
            const id = c.id || c.campaignId;
            if (id) campaignIdSet.add(parseInt(id));
        });
    });

    console.log(`  ${bdr.name}: ${campaignIdSet.size} unique campaigns (${connectCampaigns.length} connect + ${crmCampaigns.length} CRM)`);

    let total = 0;
    for (const campaignId of campaignIdSet) {
        const pending = await countHeyReachPendingForCampaign(campaignId, apiKey);
        total += pending;
        console.log(`    Campaign ${campaignId}: ${pending} pending (running total: ${total})`);
        if (total >= RESERVE_TOPUP_CAP) {
            console.log(`    ⚡ Cap reached — stopping early`);
            break;
        }
    }

    return { total, campaignCount: campaignIdSet.size, noApiKey: false };
}

/**
 * Core logic for the reserve queue top-up with pipeline cap check.
 *
 * To call the Railway /api/reserve-queue/run-topup endpoint from Cloud Functions
 * we need a valid Firebase ID token. We generate one by signing in with the
 * RESERVE_TOPUP_SERVICE_UID custom token (a dedicated service uid that the
 * Railway backend will accept via verifyIdToken).
 *
 * Setup required:
 *   1. In Railway env vars, set RESERVE_TOPUP_SERVICE_UID to any stable string
 *      (e.g. "reserve-queue-cron-service").
 *   2. In Railway's auth middleware, also accept tokens for this UID
 *      (or add a health/cron bypass using a shared CRON_SECRET header instead).
 *   3. In Firebase Functions config:
 *      firebase functions:config:set firebase.web_api_key="YOUR_FIREBASE_WEB_API_KEY"
 *
 * Alternative: set CRON_SECRET in both Railway and Firebase Functions config
 * and update the Railway auth middleware to accept `X-Cron-Secret: <secret>`.
 */
async function reserveQueueTopUpHelper() {
    console.log('📬 Reserve queue top-up — starting pipeline cap check');
    const startTime = Date.now();

    // ── 1. Get Firebase ID token for Railway auth ──────────────────────────
    let railwayHeaders = { 'Content-Type': 'application/json' };
    try {
        const serviceUid = (functions.config().reserve && functions.config().reserve.service_uid)
            || process.env.RESERVE_TOPUP_SERVICE_UID
            || 'reserve-queue-cron-service';

        const webApiKey = (functions.config().firebase && functions.config().firebase.web_api_key)
            || process.env.FIREBASE_WEB_API_KEY;

        if (webApiKey) {
            const customToken = await admin.auth().createCustomToken(serviceUid, { cron: true });
            const signInRes = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: customToken, returnSecureToken: true })
                }
            );
            const signInData = await signInRes.json();
            if (signInData.idToken) {
                railwayHeaders['Authorization'] = `Bearer ${signInData.idToken}`;
                console.log('🔑 Railway auth token obtained');
            } else {
                console.warn('⚠️ Could not obtain ID token:', JSON.stringify(signInData));
            }
        } else {
            console.warn('⚠️ FIREBASE_WEB_API_KEY not set — Railway calls will be unauthenticated');
        }
    } catch (authErr) {
        console.error('❌ Auth setup error:', authErr.message);
    }

    // ── 2. Load all supporting Firestore data ──────────────────────────────
    const [customersSnap, accountsSnap, crmCampaignsSnap, leadersSnap] = await Promise.all([
        db.collection('customerList').get(),
        db.collection('linkedin_accounts').get(),
        db.collection('campaigns').get(),
        db.collection('bdr_leaders').get()
    ]);

    // Customer → HeyReach API key
    const apiKeyMap = {};
    customersSnap.forEach(d => {
        const data = d.data();
        if (data.heyreachApiKey) apiKeyMap[d.id] = data.heyreachApiKey;
    });
    console.log(`📋 ${Object.keys(apiKeyMap).length} customers with HeyReach API keys`);

    // bdr_leaders doc ID → customerId (via linkedin_accounts)
    const bdrLeaderToCustomer = {};
    accountsSnap.forEach(d => {
        const data = d.data();
        if (data.bdrLeaderId && data.customerId) bdrLeaderToCustomer[data.bdrLeaderId] = data.customerId;
    });

    // CRM campaigns grouped by customerId
    const crmCampaignsByCustomer = {};
    crmCampaignsSnap.forEach(d => {
        const data = d.data();
        if (data.customerId && data.heyreachCampaigns && data.heyreachCampaigns.length > 0) {
            if (!crmCampaignsByCustomer[data.customerId]) crmCampaignsByCustomer[data.customerId] = [];
            crmCampaignsByCustomer[data.customerId].push(data);
        }
    });
    console.log(`📋 CRM campaigns loaded for ${Object.keys(crmCampaignsByCustomer).length} customer(s)`);

    // Collect all auto-review BDRs
    const autoBdrs = [];
    leadersSnap.forEach(d => {
        const data = d.data();
        if (data.reviewMode === 'auto' && data.primaryEmail) {
            const customerId = data.customerId || bdrLeaderToCustomer[d.id];
            autoBdrs.push({
                id: d.id,
                name: data.name || data.primaryEmail,
                email: data.primaryEmail,
                customerId,
                connectCampaigns: data.heyreachCampaigns || [],
                target: data.targetDailyConnections || 0
            });
        }
    });
    console.log(`👥 ${autoBdrs.length} auto-review BDR(s) found`);

    // ── 3. Check pipeline for each BDR and decide eligibility ─────────────
    const eligibleBdrs = [];
    const cappedBdrs   = [];

    for (const bdr of autoBdrs) {
        console.log(`\n🔍 Checking ${bdr.name} (${bdr.email})…`);
        try {
            const { total, noApiKey } = await countAllPendingForBdr(bdr, apiKeyMap, crmCampaignsByCustomer);

            if (noApiKey) {
                console.log(`  ⚠️ No API key — proceeding with top-up (cannot verify cap)`);
                eligibleBdrs.push({ ...bdr, total: 0, reason: 'no_api_key' });
            } else if (total >= RESERVE_TOPUP_CAP) {
                console.log(`  ⛔ CAPPED — ${total} pending (≥${RESERVE_TOPUP_CAP}) — skipping top-up`);
                cappedBdrs.push({ ...bdr, total });
            } else {
                console.log(`  ✅ Eligible — only ${total} pending`);
                eligibleBdrs.push({ ...bdr, total });
            }
        } catch (e) {
            console.error(`  ❌ Pipeline check error for ${bdr.name}:`, e.message);
            // On error, proceed with top-up conservatively
            eligibleBdrs.push({ ...bdr, total: 0, checkError: e.message });
        }
    }

    // ── 4. Run top-up only for eligible BDRs ──────────────────────────────
    let totalPromoted = 0;
    const topUpResults = [];

    for (const bdr of eligibleBdrs) {
        console.log(`\n📤 Running top-up for ${bdr.name} (${bdr.email})…`);
        try {
            const res = await fetch(`${RAILWAY_BASE}/api/reserve-queue/run-topup`, {
                method: 'POST',
                headers: railwayHeaders,
                body: JSON.stringify({ accountEmail: bdr.email })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
            }

            const json = await res.json();
            const promoted = (json.data?.topUps || []).reduce((s, r) => s + (r.promoted || 0), 0);
            totalPromoted += promoted;
            console.log(`  ✅ Promoted ${promoted} message(s)`);
            topUpResults.push({ name: bdr.name, email: bdr.email, promoted, pending: bdr.total });
        } catch (e) {
            console.error(`  ❌ Top-up failed for ${bdr.name}:`, e.message);
            topUpResults.push({ name: bdr.name, email: bdr.email, promoted: 0, error: e.message });
        }
    }

    const duration = Date.now() - startTime;

    console.log('\n══════════════════════════════════════════');
    console.log(`📊 Reserve Queue Top-Up Complete`);
    console.log(`   ✅ Promoted  : ${totalPromoted} message(s)`);
    console.log(`   👥 Eligible  : ${eligibleBdrs.length} BDR(s)`);
    console.log(`   ⛔ Capped    : ${cappedBdrs.length} BDR(s) (≥${RESERVE_TOPUP_CAP} pending)`);
    if (cappedBdrs.length > 0) {
        cappedBdrs.forEach(b => console.log(`      - ${b.name}: ${b.total} pending`));
    }
    console.log(`   ⏱  Duration  : ${duration}ms`);
    console.log('══════════════════════════════════════════');

    return {
        success: true,
        promoted: totalPromoted,
        eligibleCount: eligibleBdrs.length,
        cappedCount: cappedBdrs.length,
        cappedBdrs: cappedBdrs.map(b => ({ name: b.name, email: b.email, pending: b.total })),
        topUpResults,
        duration
    };
}

/**
 * Scheduled reserve queue top-up — runs at 6:00 AM Mountain Time, Mon–Fri.
 *
 * For each auto-review BDR it:
 *   1. Collects every HeyReach campaign ID the BDR is part of (Connect campaigns
 *      from bdr_leaders + CRM campaigns from the campaigns collection).
 *   2. Queries the HeyReach API for each campaign's pending lead count.
 *   3. Skips the BDR if total pending ≥ 35 (they already have a full day's worth).
 *   4. Otherwise calls Railway /api/reserve-queue/run-topup for that BDR.
 *
 * DEPLOYMENT:
 *   firebase deploy --only functions:reserveQueueDailyTopUp
 *
 * REQUIRED CONFIG:
 *   firebase functions:config:set firebase.web_api_key="YOUR_WEB_API_KEY"
 *   (The web API key is used to exchange a custom token for an ID token so the
 *   Railway backend can authenticate the request.)
 */
exports.reserveQueueDailyTopUp = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .pubsub.schedule('0 6 * * 1-5')  // 6:00 AM, Monday–Friday
    .timeZone(CONFIG.TIMEZONE)        // America/Denver (Mountain Time)
    .onRun(async (context) => {
        console.log('⏰ Scheduled run: reserveQueueDailyTopUp (6 AM MT)');
        try {
            const result = await reserveQueueTopUpHelper();
            console.log('📊 Result:', JSON.stringify(result, null, 2));
            return result;
        } catch (error) {
            console.error('❌ reserveQueueDailyTopUp failed:', error);
            throw error;
        }
    });

/**
 * Manual HTTP trigger for the reserve queue top-up (for testing / ad-hoc runs).
 *
 * Usage:
 *   curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/manualReserveQueueTopUp
 */
exports.manualReserveQueueTopUp = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .https.onRequest(async (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

        console.log('🔧 Manual trigger: reserveQueueTopUp');
        try {
            const result = await reserveQueueTopUpHelper();
            res.status(200).json({
                success: true,
                message: `Promoted ${result.promoted} message(s). Skipped ${result.cappedCount} BDR(s) over the ${RESERVE_TOPUP_CAP}-message cap.`,
                details: result
            });
        } catch (error) {
            console.error('❌ Manual trigger failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

// ============================================================================
// CLIENT DASHBOARD — nightly revenue-per-client calculation
// ============================================================================
//
// Powers the "Client Dashboard" section on connect/index_admin.html (below the
// BDR Dashboard). That page tracks two things per client:
//   1. Satisfaction (red/yellow/green) — a plain manually-edited field, no
//      calculation needed, written straight to Firestore from the page.
//   2. Billing pace — how much revenue has actually been *earned* this month
//      (via the same per-activity billing formula as cost_revenue_tracking.html)
//      compared to what the client paid for the month.
//
// Earned-revenue-this-month requires scanning heyreach_activity +
// activity_tracking across every BDR, which is exactly the kind of scan that
// shouldn't run on every page load. So it's calculated once nightly here and
// cached to settings/client_dashboard_cache; the page combines that cached
// number with the always-current "days elapsed / days in month" math and the
// live paid-amount field to show pace instantly.

const CLIENT_DASHBOARD_DEFAULT_COSTS = {
    connection_request_sent: 1.60,  // CONNECTION_REQUEST_SENT (HeyReach)
    heyreach_message_sent:   1.60,  // MESSAGE_SENT / INMAIL_SENT (HeyReach)
    successful_connection:   1.00,  // CONNECTION_REQUEST_ACCEPTED (HeyReach)
    meeting_scheduled:       10.00, // activity_tracking
    follow_up_message:       1.60   // activity_tracking (written by review_replies.html)
};

const CLIENT_DASHBOARD_HEYREACH_EVENT_TO_TYPE = {
    CONNECTION_REQUEST_SENT: 'connection_request_sent',
    MESSAGE_SENT: 'heyreach_message_sent',
    INMAIL_SENT: 'heyreach_message_sent',
    CONNECTION_REQUEST_ACCEPTED: 'successful_connection'
};

/**
 * Core nightly/manual calculation: revenue earned this month, per client company.
 * Mirrors the billing formula in connect/cost_revenue_tracking.html but runs
 * across ALL BDRs at once (that page is scoped to one BDR/company at a time).
 */
async function calculateClientDashboardHelper() {
    console.log('📊 Starting: Client Dashboard nightly calculation');
    const startTime = Date.now();

    // ── 1. Cost settings (live rates, same doc cost_revenue_tracking.html uses) ──
    let costSettings = CLIENT_DASHBOARD_DEFAULT_COSTS;
    try {
        const settingsDoc = await db.collection('settings').doc('cost_revenue_tracking').get();
        if (settingsDoc.exists && settingsDoc.data().costs) {
            costSettings = { ...CLIENT_DASHBOARD_DEFAULT_COSTS, ...settingsDoc.data().costs };
        }
    } catch (e) {
        console.warn('⚠️ Could not load cost_revenue_tracking settings, using defaults:', e.message);
    }

    // ── 2. Company + BDR attribution maps (customerList, bdr_leaders, linkedin_accounts, linkedin_email_associations) ──
    const [customersSnap, bdrSnap, accountsSnap, assocSnap] = await Promise.all([
        db.collection('customerList').get(),
        db.collection('bdr_leaders').get(),
        db.collection('linkedin_accounts').get(),
        db.collection('linkedin_email_associations').get()
    ]);

    const customerNames = {}; // customerId -> display name
    customersSnap.forEach(d => {
        const x = d.data();
        customerNames[d.id] = x.name || x.shortName || d.id;
    });

    const linkedInEmailToCanonical = {}; // LinkedIn/Gmail alias (lowercased) -> canonical work email
    assocSnap.forEach(d => {
        const x = d.data();
        const primary = (x.authEmail || x.primaryEmail || '').toLowerCase();
        const linkedIn = (x.linkedInEmail || '').toLowerCase();
        if (primary && linkedIn && linkedIn !== primary) linkedInEmailToCanonical[linkedIn] = primary;
    });

    function normalizeEmail(email) {
        if (!email) return email;
        const lower = String(email).toLowerCase();
        return linkedInEmailToCanonical[lower] || lower;
    }

    const bdrEmailToCustomer = {}; // canonical bdr email (lowercased) -> customerId
    bdrSnap.forEach(d => {
        const x = d.data();
        if (x.status === 'inactive') return;
        if (x.primaryEmail && x.customerId) {
            bdrEmailToCustomer[normalizeEmail(x.primaryEmail)] = x.customerId;
        }
    });

    const accountIdToEmail = {}; // HeyReach linkedInAccountId (string) -> canonical bdr email
    accountsSnap.forEach(d => {
        const x = d.data();
        if (x.heyreachAccountId && x.bdrEmail) {
            accountIdToEmail[String(x.heyreachAccountId)] = normalizeEmail(x.bdrEmail);
        }
    });

    function resolveCustomerForEmail(email) {
        if (!email) return null;
        return bdrEmailToCustomer[normalizeEmail(email)] || null;
    }

    // ── 3. Current month's activity (scoped by date to keep the scan bounded) ──
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStartTs = admin.firestore.Timestamp.fromDate(monthStart);

    async function loadThisMonth(collectionName, field) {
        try {
            const snap = await db.collection(collectionName).where(field, '>=', monthStartTs).get();
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
            return docs;
        } catch (e) {
            console.warn(`⚠️ Query ${collectionName} by ${field} failed (field may not be a Timestamp on all docs):`, e.message);
            return [];
        }
    }

    // heyreach_activity records are written with BOTH `timestamp` and `receivedAt`
    // populated (see HEYREACH_WEBHOOKS_GUIDE.md), so querying on either field alone
    // would miss nothing — but querying both (to be safe against any legacy docs
    // missing one of the two) requires deduping by doc ID, since a doc can satisfy
    // both queries and get returned twice otherwise.
    const [heyreachByTimestamp, heyreachByReceivedAt] = await Promise.all([
        loadThisMonth('heyreach_activity', 'timestamp'),
        loadThisMonth('heyreach_activity', 'receivedAt')
    ]);
    const seenHeyreachIds = new Set();
    const heyreachActivities = [];
    [...heyreachByTimestamp, ...heyreachByReceivedAt].forEach(({ id, data }) => {
        if (seenHeyreachIds.has(id)) return;
        seenHeyreachIds.add(id);
        heyreachActivities.push(data);
    });

    // activity_tracking (meetings + follow-ups) is written with `created_at`.
    const activityTrackingData = (await loadThisMonth('activity_tracking', 'created_at')).map(({ data }) => data);

    console.log(`📥 Loaded ${heyreachActivities.length} heyreach_activity + ${activityTrackingData.length} activity_tracking docs for ${monthKey}`);

    // ── 4. Tally revenue per company using the same billing formula as cost_revenue_tracking.html ──
    const companyRevenue = {}; // customerId -> { revenue, activities, breakdown }
    const unattributed = { revenue: 0, activities: 0 };

    function addActivity(customerId, type, cost) {
        const bucket = customerId
            ? (companyRevenue[customerId] || (companyRevenue[customerId] = { revenue: 0, activities: 0, breakdown: {} }))
            : unattributed;
        bucket.revenue += cost;
        bucket.activities += 1;
        if (customerId) bucket.breakdown[type] = (bucket.breakdown[type] || 0) + 1;
    }

    heyreachActivities.forEach(activity => {
        const type = CLIENT_DASHBOARD_HEYREACH_EVENT_TO_TYPE[activity.eventType];
        if (!type) return;

        let bdrEmail = activity.bdrEmail || activity.linkedInAccountEmail ||
                       activity.accountEmail || activity.bdr_email || null;
        if (!bdrEmail && activity.linkedInAccountId) {
            bdrEmail = accountIdToEmail[String(activity.linkedInAccountId)] || null;
        }
        if (!bdrEmail) return;

        const customerId = resolveCustomerForEmail(bdrEmail);
        const cost = costSettings[type] ?? CLIENT_DASHBOARD_DEFAULT_COSTS[type] ?? 0;
        addActivity(customerId, type, cost);
    });

    activityTrackingData.forEach(tracking => {
        const type = tracking.activity_type;
        if (type !== 'meeting_scheduled' && type !== 'follow_up_message') return;

        const bdrEmail = tracking.bdr_email || tracking.bdr_auth_email || '';
        const customerId = resolveCustomerForEmail(bdrEmail);
        const cost = costSettings[type] ?? CLIENT_DASHBOARD_DEFAULT_COSTS[type] ?? 0;
        addActivity(customerId, type, cost);
    });

    // ── 5. Build + write the cache doc (one entry per known client company) ──
    const companies = {};
    Object.keys(customerNames).forEach(customerId => {
        const rev = companyRevenue[customerId] || { revenue: 0, activities: 0, breakdown: {} };
        companies[customerId] = {
            name: customerNames[customerId],
            revenueThisMonth: Math.round(rev.revenue * 100) / 100,
            activities: rev.activities,
            breakdown: rev.breakdown
        };
    });

    await db.collection('settings').doc('client_dashboard_cache').set({
        month: monthKey,
        monthStart: monthStartTs,
        calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        companies,
        unattributedRevenue: Math.round(unattributed.revenue * 100) / 100,
        unattributedActivities: unattributed.activities
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Client dashboard calculated for ${Object.keys(companies).length} companies in ${duration}ms`);

    return {
        success: true,
        month: monthKey,
        companies: Object.keys(companies).length,
        totalActivities: heyreachActivities.length + activityTrackingData.length,
        duration
    };
}

/**
 * Nightly Client Dashboard calculation — runs at 3:00 AM Mountain Time, daily.
 *
 * DEPLOYMENT:
 *   firebase deploy --only functions:nightlyClientDashboardCalc,functions:manualCalculateClientDashboard
 */
exports.nightlyClientDashboardCalc = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .pubsub.schedule('0 3 * * *') // 3:00 AM daily
    .timeZone(CONFIG.TIMEZONE)    // America/Denver (Mountain Time)
    .onRun(async (context) => {
        console.log('⏰ Scheduled run: nightlyClientDashboardCalc (3 AM MT)');
        try {
            const result = await calculateClientDashboardHelper();
            console.log('📊 Result:', JSON.stringify(result, null, 2));
            return result;
        } catch (error) {
            console.error('❌ nightlyClientDashboardCalc failed:', error);
            throw error;
        }
    });

/**
 * Manual trigger for the Client Dashboard calculation (the "Recalculate" button
 * on connect/index_admin.html's Client Dashboard section calls this directly).
 *
 * Usage:
 *   curl -X POST https://us-central1-clemail.cloudfunctions.net/manualCalculateClientDashboard
 */
exports.manualCalculateClientDashboard = functions
    .runWith({
        timeoutSeconds: 540,
        memory: '512MB'
    })
    .https.onRequest(async (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

        console.log('🔧 Manual trigger: calculateClientDashboard');
        try {
            const result = await calculateClientDashboardHelper();
            res.status(200).json(result);
        } catch (error) {
            console.error('❌ Manual trigger failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

/**
 * Google Photos media proxy for taylorsideproject/photos-player.html
 * Streams Picker API video bytes to the browser (Google blocks direct CORS access).
 *
 * Deploy: firebase deploy --only functions:gphotosMediaProxy,hosting
 */
exports.gphotosMediaProxy = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const rawUrl = req.query.url;
    const token = req.query.token;

    if (!rawUrl || !token) {
        res.status(400).json({ error: 'Missing url or token query parameters' });
        return;
    }

    let mediaUrl;
    try {
        mediaUrl = decodeURIComponent(rawUrl);
    } catch {
        res.status(400).json({ error: 'Invalid url parameter' });
        return;
    }

    if (!mediaUrl.startsWith('https://lh3.googleusercontent.com/')) {
        res.status(400).json({ error: 'Invalid media host' });
        return;
    }

    try {
        const upstreamHeaders = { Authorization: `Bearer ${token}` };
        if (req.headers.range) upstreamHeaders.Range = req.headers.range;

        const upstream = await fetch(mediaUrl, { headers: upstreamHeaders });

        res.status(upstream.status);
        const passHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        for (const name of passHeaders) {
            const value = upstream.headers.get(name);
            if (value) res.set(name, value);
        }

        if (!upstream.ok) {
            res.send(await upstream.text());
            return;
        }

        if (upstream.body) {
            const { Readable } = require('stream');
            Readable.fromWeb(upstream.body).pipe(res);
        } else {
            res.end();
        }
    } catch (error) {
        console.error('Google Photos proxy error:', error);
        if (!res.headersSent) {
            res.status(502).json({ error: error.message });
        }
    }
});

