// ==================================================================
// OUTCOMEMD ASSIGNMENT QUERY TEST
// Test the exact query used by assignCallsToUser
// Run this in the browser console on phone-calls.html
// ==================================================================
(async function() {
    console.log('🔍 TESTING OUTCOMEMD ASSIGNMENT QUERY');
    console.log('====================================\n');
    
    const campaignId = 'campaign_1762401107769';
    const count = 14; // What Mak needs
    const queryLimit = count * 20; // 280
    
    console.log(`📊 Query parameters:`);
    console.log(`   Campaign: ${campaignId}`);
    console.log(`   Requested calls: ${count}`);
    console.log(`   Query limit: ${queryLimit}`);
    console.log('');
    
    // Test 1: Railway API query (what assignCallsToUser uses)
    console.log('📡 TEST 1: Railway API query (current method)...\n');
    const token = await window.auth.currentUser.getIdToken();
    
    const railwayResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'campaignId', operator: '==', value: campaignId },
                { field: 'status', operator: 'in', value: ['pending', 'scheduled'] }
            ],
            limit: queryLimit
        })
    });
    
    const railwayResult = await railwayResponse.json();
    console.log(`   Railway API returned: ${railwayResult.data?.length || 0} calls`);
    
    if (railwayResult.data?.length > 0) {
        // Check assignment status
        const now = new Date();
        const assigned = railwayResult.data.filter(call => {
            if (!call.assignedTo || call.assignedTo === 'unassigned') return false;
            if (!call.assignmentExpiry) return false;
            const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
            return expiry > now;
        });
        const unassigned = railwayResult.data.filter(call => {
            if (!call.assignedTo || call.assignedTo === 'unassigned') return true;
            if (!call.assignmentExpiry) return true;
            const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
            return expiry <= now;
        });
        
        console.log(`   Assignment breakdown:`);
        console.log(`      Actively assigned: ${assigned.length}`);
        console.log(`      Unassigned/expired: ${unassigned.length}`);
        console.log('');
        
        // Check scheduled dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const overdue = unassigned.filter(call => {
            if (!call.scheduledDate) return false;
            const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
            schedDate.setHours(0, 0, 0, 0);
            return schedDate < today;
        });
        
        const dueToday = unassigned.filter(call => {
            if (!call.scheduledDate) return false;
            const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
            schedDate.setHours(0, 0, 0, 0);
            return schedDate.getTime() === today.getTime();
        });
        
        console.log(`   Scheduled date breakdown (unassigned):`);
        console.log(`      Overdue: ${overdue.length}`);
        console.log(`      Due today: ${dueToday.length}`);
        console.log(`      Total due: ${overdue.length + dueToday.length}`);
    }
    console.log('');
    
    // Test 2: Firebase SDK query (direct)
    console.log('📡 TEST 2: Firebase SDK query (direct)...\n');
    
    try {
        const { collection, query, where, limit, getDocs } = window.clemailFirestore;
        const db = window.clemailDb;
        
        const directQuery = query(
            collection(db, 'phone_activities'),
            where('campaignId', '==', campaignId),
            where('status', 'in', ['pending', 'scheduled']),
            limit(queryLimit)
        );
        
        const snapshot = await getDocs(directQuery);
        console.log(`   Firebase SDK returned: ${snapshot.docs.length} calls`);
        
        if (snapshot.docs.length > 0) {
            const calls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Check assignment status
            const now = new Date();
            const assigned = calls.filter(call => {
                if (!call.assignedTo || call.assignedTo === 'unassigned') return false;
                if (!call.assignmentExpiry) return false;
                const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
                return expiry > now;
            });
            const unassigned = calls.filter(call => {
                if (!call.assignedTo || call.assignedTo === 'unassigned') return true;
                if (!call.assignmentExpiry) return true;
                const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
                return expiry <= now;
            });
            
            console.log(`   Assignment breakdown:`);
            console.log(`      Actively assigned: ${assigned.length}`);
            console.log(`      Unassigned/expired: ${unassigned.length}`);
            console.log('');
            
            // Check scheduled dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const overdue = unassigned.filter(call => {
                if (!call.scheduledDate) return false;
                const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
                schedDate.setHours(0, 0, 0, 0);
                return schedDate < today;
            });
            
            const dueToday = unassigned.filter(call => {
                if (!call.scheduledDate) return false;
                const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
                schedDate.setHours(0, 0, 0, 0);
                return schedDate.getTime() === today.getTime();
            });
            
            console.log(`   Scheduled date breakdown (unassigned):`);
            console.log(`      Overdue: ${overdue.length}`);
            console.log(`      Due today: ${dueToday.length}`);
            console.log(`      Total due: ${overdue.length + dueToday.length}`);
        }
    } catch (err) {
        console.error('   ❌ Firebase SDK query failed:', err.message);
    }
    
    console.log('');
    console.log('====================================');
    console.log('💡 DIAGNOSIS:');
    console.log('   If Railway API returns significantly fewer results,');
    console.log('   the API has a hidden filter or limit issue.');
    console.log('====================================');
})();

