/**
 * MASS COMPLETION RECOVERY SCRIPT - Console Version
 * 
 * HOW TO USE:
 * 1. Navigate to https://healthluminate.com/team/phone-calls.html (or any authenticated page)
 * 2. Open browser console (F12 or Ctrl+Shift+I)
 * 3. Paste this entire script
 * 4. Press Enter
 * 5. First it will run in DRY RUN mode (no changes)
 * 6. Review the output, then call executeRecovery() to apply changes
 */

(async function() {
    console.log('%c🚨 MASS COMPLETION RECOVERY SCRIPT 🚨', 'color: red; font-size: 20px; font-weight: bold');
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: blue');
    console.log('%cThis script will restore 644 phone activities that were incorrectly mass-completed', 'color: orange');
    console.log('%con November 6, 2025 due to a customerId bug (now fixed).', 'color: orange');
    console.log('%c═══════════════════════════════════════════════════════════════', 'color: blue');
    console.log('');

    // Check if we have Firestore access
    if (typeof db === 'undefined') {
        console.error('❌ ERROR: Firestore (db) is not available. Please run this from an authenticated HealthLuminate page.');
        console.log('   Try: https://healthluminate.com/team/phone-calls.html');
        return;
    }

    // Check if user is authenticated
    if (typeof auth === 'undefined' || !auth.currentUser) {
        console.error('❌ ERROR: Not authenticated. Please sign in first.');
        return;
    }

    console.log(`✅ Authenticated as: ${auth.currentUser.email}`);
    console.log(`✅ User ID: ${auth.currentUser.uid}`);
    console.log('');

    // Import Firestore functions from the v9 compat API
    const { collection, query, where, getDocs, doc, writeBatch } = firebase.firestore;

    const CAMPAIGN_ID = 'campaign_1758725559074'; // Start 4B High Google Ratings
    const MASS_COMPLETION_TIMESTAMPS = [
        '2025-11-06T17:43:04.184Z', // Alex at 10:43 AM MT (431 activities)
        '2025-11-06T21:39:41.048Z'  // Kristen at 2:39 PM MT (213 activities)
    ];

    async function runRecovery(dryRun = true) {
        const mode = dryRun ? 'DRY RUN' : 'LIVE EXECUTION';
        console.log(`%c${'═'.repeat(80)}`, 'color: cyan');
        console.log(`%c${dryRun ? '🔍' : '⚡'} ${mode} MODE ${dryRun ? '(NO CHANGES WILL BE MADE)' : '(APPLYING CHANGES)'}`, dryRun ? 'color: orange; font-weight: bold' : 'color: red; font-weight: bold');
        console.log(`%c${'═'.repeat(80)}`, 'color: cyan');
        console.log('');

        try {
            // Query all completed activities for the campaign
            console.log(`📊 Querying phone_activities for campaign: ${CAMPAIGN_ID}`);
            const q = query(
                collection(db, 'phone_activities'),
                where('campaignId', '==', CAMPAIGN_ID),
                where('status', '==', 'completed')
            );

            const querySnapshot = await getDocs(q);
            console.log(`📦 Found ${querySnapshot.size} completed activities`);

            // Filter to only activities completed at the target timestamps
            const activitiesToRecover = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (MASS_COMPLETION_TIMESTAMPS.includes(data.completedAt)) {
                    activitiesToRecover.push({
                        id: docSnap.id,
                        data: data
                    });
                }
            });

            console.log(`🎯 Found ${activitiesToRecover.length} activities to recover`);
            console.log('');

            if (activitiesToRecover.length === 0) {
                console.log('✅ No activities found matching the mass completion timestamps.');
                console.log('   Either they were already recovered, or the timestamps are incorrect.');
                return;
            }

            // Show sample of what will be recovered
            console.log('%c📋 Sample of activities to recover (first 10):', 'color: cyan; font-weight: bold');
            activitiesToRecover.slice(0, 10).forEach((act, idx) => {
                console.log(`   ${idx + 1}. ${act.data.contactName || 'Unknown'} - ${act.data.company || 'Unknown'}`);
                console.log(`      Status: ${act.data.status} → will become: pending`);
                console.log(`      Completed at: ${act.data.completedAt}`);
                console.log(`      Completed by: ${act.data.completedBy || 'unknown'}`);
            });
            console.log('');

            if (dryRun) {
                console.log('%c✅ DRY RUN COMPLETE', 'color: green; font-weight: bold');
                console.log(`   Found ${activitiesToRecover.length} activities that would be recovered.`);
                console.log('');
                console.log('%cTo apply these changes, run:', 'color: yellow; font-weight: bold');
                console.log('%cexecuteRecovery()', 'color: yellow; font-size: 16px; background: black; padding: 5px');
                
                // Store the function globally so user can call it
                window.executeRecovery = () => runRecovery(false);
                return;
            }

            // LIVE MODE - Apply changes
            console.log('%c⚡ APPLYING CHANGES...', 'color: red; font-weight: bold');
            console.log('');

            const batch = writeBatch(db);
            let batchCount = 0;
            let totalRestored = 0;

            for (const activity of activitiesToRecover) {
                batch.update(doc(db, 'phone_activities', activity.id), {
                    status: 'pending',
                    scheduledDate: new Date(), // Schedule for today
                    completedAt: null,
                    completedBy: null,
                    outcome: null,
                    autoCompletedReason: 'recovered-from-mass-completion',
                    notes: `[RECOVERED ${new Date().toLocaleDateString()}] Original status incorrectly set to completed. Restored to pending. Original notes: ${activity.data.notes || ''}`.substring(0, 500)
                });
                batchCount++;

                if (batchCount >= 499) { // Firestore batch limit is 500
                    console.log(`💾 Committing batch of ${batchCount} updates...`);
                    await batch.commit();
                    totalRestored += batchCount;
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                console.log(`💾 Committing final batch of ${batchCount} updates...`);
                await batch.commit();
                totalRestored += batchCount;
            }

            console.log('');
            console.log(`%c✅ RECOVERY COMPLETE!`, 'color: green; font-size: 20px; font-weight: bold');
            console.log(`%c   Restored ${totalRestored} activities to pending status`, 'color: green; font-size: 16px');
            console.log('');
            console.log('📝 Next steps:');
            console.log('   1. Navigate to the Phone Calls page');
            console.log('   2. Select campaign: Start 4B High Google Ratings');
            console.log('   3. Verify that calls are now showing in the queue');

        } catch (error) {
            console.error('❌ ERROR during recovery:', error);
            console.error(error);
        }
    }

    // Run in DRY RUN mode automatically
    await runRecovery(true);

})();

