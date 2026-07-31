// ==================================================================
// COMPREHENSIVE ASSIGNMENT BLOCKING DIAGNOSTIC
// Run this in the browser console on phone-calls.html
// Run as ANY agent (not just admin)
// ==================================================================
(async function() {
    console.log('🔍 ASSIGNMENT BLOCKING DIAGNOSTIC');
    console.log('====================================\n');
    
    const userEmail = window.currentUser?.email;
    if (!userEmail) {
        console.error('❌ No user logged in');
        return;
    }
    
    console.log(`👤 Agent: ${userEmail}\n`);
    
    // Get today's date string
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    console.log(`📅 Today: ${todayStr}\n`);
    
    const token = await window.auth.currentUser.getIdToken();
    
    // ============================================================
    // 1. CHECK USER'S CURRENT ASSIGNMENTS
    // ============================================================
    console.log('1️⃣ CHECKING CURRENT ASSIGNMENTS');
    console.log('====================================');
    
    const assignedResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'assignedTo', operator: '==', value: userEmail },
                { field: 'status', operator: 'in', value: ['pending', 'scheduled'] }
            ],
            limit: 200
        })
    });
    
    const assignedResult = await assignedResponse.json();
    if (!assignedResult.success) {
        console.error('❌ Failed to query assignments:', assignedResult.error);
        return;
    }
    
    const assignedCalls = assignedResult.data;
    console.log(`📊 Total assigned calls: ${assignedCalls.length}`);
    
    // Group by campaign
    const byCampaign = {};
    assignedCalls.forEach(call => {
        const cid = call.campaignId || 'unknown';
        if (!byCampaign[cid]) {
            byCampaign[cid] = [];
        }
        byCampaign[cid].push(call);
    });
    
    console.log(`📊 By campaign:`);
    Object.entries(byCampaign).forEach(([cid, calls]) => {
        const campaignName = window.availableCampaigns?.find(c => c.id === cid)?.name || cid;
        console.log(`   ${campaignName}: ${calls.length} assigned`);
    });
    console.log('');
    
    // Check assignment expiry
    const now = new Date();
    let validAssignments = 0;
    let expiredAssignments = 0;
    let noExpiryAssignments = 0;
    
    assignedCalls.forEach(call => {
        if (!call.assignmentExpiry) {
            noExpiryAssignments++;
        } else {
            const expiry = new Date(call.assignmentExpiry);
            if (expiry > now) {
                validAssignments++;
            } else {
                expiredAssignments++;
            }
        }
    });
    
    console.log(`📊 Assignment expiry status:`);
    console.log(`   ✅ Valid (not expired): ${validAssignments}`);
    console.log(`   ⏰ Expired: ${expiredAssignments}`);
    console.log(`   ❓ No expiry set: ${noExpiryAssignments}`);
    console.log('');
    
    // ============================================================
    // 2. CHECK HOW MANY WOULD ACTUALLY LOAD (FILTER ANALYSIS)
    // ============================================================
    console.log('2️⃣ FILTER ANALYSIS - WHY CALLS DON\'T LOAD');
    console.log('====================================');
    
    let filteredDeclined = 0;
    let filteredFutureDate = 0;
    let filteredTimezone = 0;
    let filteredCooldown = 0;
    let filteredExpired = 0;
    let loadableCalls = 0;
    
    // Helper: Check if call can load
    function parseScheduledDate(dateValue) {
        if (!dateValue) return null;
        if (typeof dateValue === 'object') {
            if (dateValue.toDate) return dateValue.toDate();
            if (dateValue._seconds) return new Date(dateValue._seconds * 1000);
            if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
        }
        const parsedDate = new Date(dateValue);
        return isNaN(parsedDate.getTime()) ? null : parsedDate;
    }
    
    assignedCalls.forEach(call => {
        let filterReason = null;
        
        // Check expiry first
        if (call.assignmentExpiry) {
            const expiry = new Date(call.assignmentExpiry);
            if (expiry <= now) {
                filteredExpired++;
                filterReason = 'expired assignment';
            }
        }
        
        if (!filterReason) {
            // Check declined
            if (call.declined || call.outcome === 'declined' || call.outcome === 'bad_number' || call.outcome === 'wrong_number') {
                filteredDeclined++;
                filterReason = 'declined/bad number';
            }
        }
        
        if (!filterReason) {
            // Check future-dated
            const schedDate = parseScheduledDate(call.scheduledDate);
            if (schedDate && schedDate > now) {
                filteredFutureDate++;
                filterReason = 'future-dated';
            }
        }
        
        if (!filterReason) {
            // Check timezone (simplified check)
            // This would require the full timezone logic, so we'll skip for now
            // But note: this is a MAJOR filter
        }
        
        if (!filterReason) {
            loadableCalls++;
        }
    });
    
    console.log(`📊 Filter breakdown:`);
    console.log(`   🚫 Declined/bad: ${filteredDeclined}`);
    console.log(`   📅 Future-dated: ${filteredFutureDate}`);
    console.log(`   ⏰ Expired assignment: ${filteredExpired}`);
    console.log(`   🌍 Timezone (not checked): ???`);
    console.log(`   ✅ Potentially loadable: ${loadableCalls}`);
    console.log('');
    
    // ============================================================
    // 3. CHECK RESERVATION STATUS
    // ============================================================
    console.log('3️⃣ RESERVATION STATUS');
    console.log('====================================');
    
    // Check completed calls today
    const completedResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/campaign_call_tracking', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'userEmail', operator: '==', value: userEmail }
            ],
            limit: 500
        })
    });
    
    const completedResult = await completedResponse.json();
    if (!completedResult.success) {
        console.error('❌ Failed to query completed calls:', completedResult.error);
        return;
    }
    
    // Filter for today
    let completedToday = 0;
    completedResult.data.forEach(call => {
        if (call.timestamp) {
            const callDate = new Date(call.timestamp);
            const callDateStr = `${callDate.getFullYear()}-${String(callDate.getMonth() + 1).padStart(2, '0')}-${String(callDate.getDate()).padStart(2, '0')}`;
            if (callDateStr === todayStr) {
                completedToday++;
            }
        }
    });
    
    console.log(`📊 Calls completed today: ${completedToday}`);
    console.log(`📊 Currently assigned (valid): ${validAssignments}`);
    console.log(`📊 Total calls today: ${completedToday + validAssignments}`);
    console.log('');
    
    // Check reservation
    // This would require querying callReservations collection
    // For now, we'll skip this
    
    // ============================================================
    // 4. CHECK "CONTINUE CALLING" SESSION FLAG
    // ============================================================
    console.log('4️⃣ SESSION FLAGS');
    console.log('====================================');
    
    const continueCallingKey = `continueCallingAfterReservation_${todayStr}`;
    const continueCallingChoice = sessionStorage.getItem(continueCallingKey);
    
    console.log(`📊 Continue calling after reservation?`);
    if (!continueCallingChoice) {
        console.log(`   ❓ Not asked yet (or cleared)`);
    } else if (continueCallingChoice === 'yes') {
        console.log(`   ✅ YES - Agent agreed to continue`);
    } else if (continueCallingChoice === 'no') {
        console.log(`   ❌ NO - Agent declined to continue`);
        console.log(`   🚨 THIS IS BLOCKING NEW ASSIGNMENTS!`);
    }
    console.log('');
    
    // ============================================================
    // 5. CHECK AVAILABLE CALLS IN CAMPAIGNS
    // ============================================================
    console.log('5️⃣ AVAILABLE CALLS IN CAMPAIGNS');
    console.log('====================================');
    
    const campaigns = window.availableCampaigns || [];
    console.log(`📊 Agent is trained on ${campaigns.length} campaigns`);
    
    for (const campaign of campaigns.slice(0, 3)) { // Check first 3 campaigns
        console.log(`\n📌 ${campaign.name}`);
        
        const campaignCallsResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                constraints: [
                    { field: 'campaignId', operator: '==', value: campaign.id },
                    { field: 'status', operator: 'in', value: ['pending', 'scheduled'] }
                ],
                limit: 500
            })
        });
        
        const campaignCallsResult = await campaignCallsResponse.json();
        if (!campaignCallsResult.success) {
            console.error(`   ❌ Failed to query: ${campaignCallsResult.error}`);
            continue;
        }
        
        const allCalls = campaignCallsResult.data;
        console.log(`   Total pending/scheduled: ${allCalls.length}`);
        
        // Count unassigned
        let unassigned = 0;
        let assignedToOthers = 0;
        let assignedToMe = 0;
        
        allCalls.forEach(call => {
            if (!call.assignedTo) {
                unassigned++;
            } else if (call.assignedTo === userEmail) {
                assignedToMe++;
            } else {
                assignedToOthers++;
            }
        });
        
        console.log(`   Unassigned: ${unassigned}`);
        console.log(`   Assigned to me: ${assignedToMe}`);
        console.log(`   Assigned to others: ${assignedToOthers}`);
    }
    
    console.log('');
    
    // ============================================================
    // 6. RECOMMENDATIONS
    // ============================================================
    console.log('6️⃣ RECOMMENDATIONS');
    console.log('====================================');
    
    if (continueCallingChoice === 'no') {
        console.log('🔧 ISSUE: Agent declined to continue calling after reservation');
        console.log('   FIX: Run this command to reset:');
        console.log(`   sessionStorage.removeItem('${continueCallingKey}');`);
        console.log('');
    }
    
    if (filteredExpired > 0 && loadableCalls === 0) {
        console.log('🔧 ISSUE: All assigned calls have expired assignments');
        console.log('   FIX: Click "Release My Call Block" button');
        console.log('');
    }
    
    if (filteredFutureDate > 0 && loadableCalls === 0) {
        console.log('🔧 ISSUE: All assigned calls are future-dated');
        console.log('   FIX: Click "Release My Call Block" to get today\'s calls');
        console.log('');
    }
    
    if (filteredDeclined > 0 && loadableCalls === 0) {
        console.log('🔧 ISSUE: All assigned calls are declined/bad numbers');
        console.log('   FIX: Click "Release My Call Block" to get fresh calls');
        console.log('');
    }
    
    if (validAssignments > 0 && loadableCalls === 0) {
        console.log('🔧 ISSUE: All valid assignments are filtered (likely timezone)');
        console.log('   FIX: Wait until calling hours OR admin can override timezone');
        console.log('');
    }
    
    console.log('====================================');
    console.log('✅ DIAGNOSTIC COMPLETE');
    console.log('====================================');
})();

