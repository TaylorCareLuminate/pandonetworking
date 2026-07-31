// ==================================================================
// ALEX ASSIGNMENT DIAGNOSTIC
// Run this in browser console on phone-calls.html
// ==================================================================
(async function() {
    console.log('🔍 ALEX ASSIGNMENT DIAGNOSTIC');
    console.log('====================================\n');
    
    const alexEmail = 'alex@careluminate.com'; // Update if needed
    const token = await window.auth.currentUser.getIdToken();
    const now = new Date();
    
    // STEP 1: Check completed calls still assigned to Alex
    console.log('📋 STEP 1: Checking for ghost assignments...\n');
    
    const completedResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'assignedTo', operator: '==', value: alexEmail },
                { field: 'status', operator: '==', value: 'completed' }
            ],
            limit: 100
        })
    });
    
    const completedResult = await completedResponse.json();
    const ghostAssignments = completedResult.data || [];
    
    console.log(`📊 Ghost assignments (completed but still assigned): ${ghostAssignments.length}`);
    
    if (ghostAssignments.length > 0) {
        console.log('⚠️ FOUND GHOST ASSIGNMENTS!');
        console.log('   These completed calls still have assignedTo set:');
        ghostAssignments.slice(0, 10).forEach((call, i) => {
            console.log(`   ${i + 1}. ${call.contactName || 'Unknown'} - ${call.outcome || 'no outcome'}`);
        });
        console.log('');
    }
    
    // STEP 2: Check current assignments
    console.log('📋 STEP 2: Checking current assignments...\n');
    
    const assignedResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'assignedTo', operator: '==', value: alexEmail },
                { field: 'status', operator: 'in', value: ['pending', 'scheduled'] }
            ],
            limit: 100
        })
    });
    
    const assignedResult = await assignedResponse.json();
    const assignedCalls = assignedResult.data || [];
    
    const validAssignments = assignedCalls.filter(call => {
        if (!call.assignmentExpiry) return false;
        const expiry = typeof call.assignmentExpiry === 'string' 
            ? new Date(call.assignmentExpiry)
            : call.assignmentExpiry._seconds 
                ? new Date(call.assignmentExpiry._seconds * 1000)
                : new Date(call.assignmentExpiry);
        return expiry > now;
    });
    
    const expiredAssignments = assignedCalls.filter(call => {
        if (!call.assignmentExpiry) return true;
        const expiry = typeof call.assignmentExpiry === 'string' 
            ? new Date(call.assignmentExpiry)
            : call.assignmentExpiry._seconds 
                ? new Date(call.assignmentExpiry._seconds * 1000)
                : new Date(call.assignmentExpiry);
        return expiry <= now;
    });
    
    console.log(`📊 Total assigned (pending/scheduled): ${assignedCalls.length}`);
    console.log(`   ✅ Valid (not expired): ${validAssignments.length}`);
    console.log(`   ⏰ Expired: ${expiredAssignments.length}\n`);
    
    // Check for bad outcomes in valid assignments
    const badOutcomes = validAssignments.filter(call => 
        call.outcome && ['declined', 'bad-number', 'do-not-call'].includes(call.outcome)
    );
    
    if (badOutcomes.length > 0) {
        console.log('⚠️ FOUND BAD CALLS IN VALID ASSIGNMENTS:');
        badOutcomes.forEach((call, i) => {
            console.log(`   ${i + 1}. ${call.contactName || 'Unknown'} - ${call.outcome} (${call.id})`);
        });
        console.log('');
    }
    
    // STEP 3: Summary
    console.log('====================================');
    console.log('💡 DIAGNOSIS:\n');
    
    const totalBadCalls = ghostAssignments.length + expiredAssignments.length + badOutcomes.length;
    
    if (totalBadCalls > 0) {
        console.log(`❌ FOUND ${totalBadCalls} PROBLEMATIC CALLS:\n`);
        
        if (ghostAssignments.length > 0) {
            console.log(`   • ${ghostAssignments.length} ghost assignments (completed but still assigned)`);
            console.log('     → Blocking: System thinks Alex has these calls');
        }
        
        if (expiredAssignments.length > 0) {
            console.log(`   • ${expiredAssignments.length} expired assignments`);
            console.log('     → Blocking: Need to be released');
        }
        
        if (badOutcomes.length > 0) {
            console.log(`   • ${badOutcomes.length} bad calls in queue (declined/bad-number)`);
            console.log('     → Blocking: Should be filtered out before assignment');
        }
        
        console.log('\n✅ SOLUTION:');
        console.log('   Run the cleanup script to fix these issues');
        console.log('   Script: team/fix-alex-assignments.js');
    } else {
        console.log('✅ No ghost assignments found!');
        console.log('   Issue might be company cooldown or other filters.');
        console.log('   Check company cooldown diagnostic next.');
    }
    
    console.log('\n====================================');
    console.log('📊 ALEX\'S STATUS:');
    console.log(`   Reservation: 40 calls`);
    console.log(`   Completed: 28 calls`);
    console.log(`   Remaining: 12 calls`);
    console.log(`   Valid assignments: ${validAssignments.length}`);
    console.log(`   Should get: ${12 - validAssignments.length} more calls`);
    console.log('====================================');
})();

