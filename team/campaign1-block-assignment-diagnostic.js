// ==================================================================
// CAMPAIGN 1 BLOCK ASSIGNMENT DIAGNOSTIC
// Test why subsequent blocks aren't being assigned
// Run this in the browser console on phone-calls.html
// ==================================================================
(async function() {
    console.log('🔍 CAMPAIGN 1 BLOCK ASSIGNMENT DIAGNOSTIC');
    console.log('====================================\n');
    
    const campaignId = 'campaign_1763999310498';
    const userEmail = 'makwilcock@gmail.com';
    const count = 15; // What you need for next block
    const queryLimit = count * 20; // 300
    
    console.log(`📊 Query parameters:`);
    console.log(`   Campaign: Campaign 1: Large PT Direct Outreach`);
    console.log(`   User: ${userEmail}`);
    console.log(`   Requested calls: ${count}`);
    console.log(`   Query limit: ${queryLimit}`);
    console.log('');
    
    // Get current state
    const token = await window.auth.currentUser.getIdToken();
    
    console.log('📡 STEP 1: Check current assignments...\n');
    const assignedResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'campaignId', operator: '==', value: campaignId },
                { field: 'assignedTo', operator: '==', value: userEmail }
            ],
            limit: 100
        })
    });
    
    const assignedResult = await assignedResponse.json();
    const now = new Date();
    const activeAssignments = assignedResult.data.filter(call => {
        if (!call.assignmentExpiry) return false;
        const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
        return expiry > now;
    });
    
    console.log(`   Currently assigned to you: ${activeAssignments.length} calls`);
    if (activeAssignments.length > 0) {
        activeAssignments.forEach(call => {
            console.log(`      - ${call.firstName} ${call.lastName} (${call.id})`);
        });
    }
    console.log('');
    
    console.log('📡 STEP 2: Query available calls (what assignCallsToUser does)...\n');
    const availableResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
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
    
    const availableResult = await availableResponse.json();
    console.log(`   Query returned: ${availableResult.data.length} total calls`);
    console.log('');
    
    // Analyze what's blocking assignment
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let analysis = {
        total: availableResult.data.length,
        activelyAssigned: 0,
        unassigned: 0,
        overdue: 0,
        dueToday: 0,
        future: 0,
        noDate: 0,
        assignedToOthers: [],
        availableNow: []
    };
    
    availableResult.data.forEach(call => {
        // Check assignment
        let isAssigned = false;
        if (call.assignedTo && call.assignedTo !== 'unassigned') {
            if (call.assignmentExpiry) {
                const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
                if (expiry > now) {
                    isAssigned = true;
                    analysis.activelyAssigned++;
                    if (call.assignedTo !== userEmail) {
                        analysis.assignedToOthers.push({
                            name: `${call.firstName} ${call.lastName}`,
                            assignedTo: call.assignedTo.split('@')[0],
                            expiry: expiry
                        });
                    }
                }
            }
        }
        
        if (!isAssigned) {
            analysis.unassigned++;
            
            // Check scheduled date
            if (!call.scheduledDate) {
                analysis.noDate++;
                return;
            }
            
            const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
            schedDate.setHours(0, 0, 0, 0);
            
            if (schedDate < todayStart) {
                analysis.overdue++;
                analysis.availableNow.push(call);
            } else if (schedDate.getTime() === todayStart.getTime()) {
                analysis.dueToday++;
                analysis.availableNow.push(call);
            } else {
                analysis.future++;
            }
        }
    });
    
    console.log('📊 ANALYSIS:');
    console.log(`   Total calls in query: ${analysis.total}`);
    console.log(`   Actively assigned: ${analysis.activelyAssigned}`);
    console.log(`      - To you: ${activeAssignments.length}`);
    console.log(`      - To others: ${analysis.assignedToOthers.length}`);
    if (analysis.assignedToOthers.length > 0 && analysis.assignedToOthers.length <= 10) {
        analysis.assignedToOthers.forEach(a => {
            console.log(`         → ${a.name} (${a.assignedTo})`);
        });
    }
    console.log(`   Unassigned: ${analysis.unassigned}`);
    console.log('');
    
    console.log('📅 SCHEDULED DATE BREAKDOWN (unassigned only):');
    console.log(`   ⏰ Overdue: ${analysis.overdue}`);
    console.log(`   📅 Due today: ${analysis.dueToday}`);
    console.log(`   🔮 Future: ${analysis.future}`);
    console.log(`   ❓ No date: ${analysis.noDate}`);
    console.log('');
    
    console.log(`✅ AVAILABLE FOR ASSIGNMENT NOW: ${analysis.availableNow.length}`);
    console.log('');
    
    if (analysis.availableNow.length > 0) {
        console.log('📋 Sample of available calls (first 10):');
        analysis.availableNow.slice(0, 10).forEach((call, i) => {
            const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
            console.log(`   ${i + 1}. ${call.firstName} ${call.lastName}`);
            console.log(`      Phone: ${call.phoneNumber || 'N/A'}`);
            console.log(`      Scheduled: ${schedDate.toLocaleDateString()}`);
            console.log(`      Timezone: ${call.timezoneFromState || call.timezoneFromAreaCode || 'N/A'}`);
            console.log(`      State: ${call.contactState || 'N/A'}`);
        });
    }
    console.log('');
    
    console.log('====================================');
    console.log('💡 DIAGNOSIS:');
    if (analysis.availableNow.length >= count) {
        console.log(`   ✅ ${analysis.availableNow.length} calls available - SHOULD ASSIGN ${count}`);
        console.log('   ❌ If not assigning, check:');
        console.log('      1. Company cooldown filter (30h)');
        console.log('      2. Declined contact filter');
        console.log('      3. Sequential call filter (duplicate phone numbers)');
        console.log('      4. Timezone filter (if admin bypass not active)');
    } else if (analysis.availableNow.length > 0) {
        console.log(`   ⚠️ Only ${analysis.availableNow.length} calls available (need ${count})`);
        console.log('   → Should assign what\'s available');
    } else {
        console.log(`   ❌ NO calls available for assignment`);
        if (analysis.future > 0) {
            console.log(`   → ${analysis.future} future-dated calls exist`);
        }
        if (analysis.activelyAssigned > 0) {
            console.log(`   → ${analysis.activelyAssigned} calls actively assigned`);
        }
    }
    console.log('====================================');
})();

