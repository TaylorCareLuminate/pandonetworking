// ==================================================================
// FIX ALEX'S ASSIGNMENTS - Clear ghost assignments
// Run in browser console on phone-calls.html
// ==================================================================
(async function() {
    console.log('🔧 FIXING ALEX\'S ASSIGNMENTS');
    console.log('====================================\n');
    
    const alexEmail = 'alex@careluminate.com'; // Update if needed
    const token = await window.auth.currentUser.getIdToken();
    const now = new Date();
    
    console.log(`👤 Target user: ${alexEmail}\n`);
    
    // Find all problematic calls
    const problems = [];
    
    // 1. Completed calls with assignedTo (ghost assignments)
    console.log('📋 Step 1: Finding ghost assignments...\n');
    
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
    const ghostCalls = completedResult.data || [];
    
    console.log(`   Found ${ghostCalls.length} ghost assignments`);
    problems.push(...ghostCalls.map(c => ({ ...c, issue: 'ghost' })));
    
    // 2. Expired assignments
    console.log('📋 Step 2: Finding expired assignments...\n');
    
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
    
    const expiredCalls = assignedCalls.filter(call => {
        if (!call.assignmentExpiry) return true;
        const expiry = typeof call.assignmentExpiry === 'string' 
            ? new Date(call.assignmentExpiry)
            : call.assignmentExpiry._seconds 
                ? new Date(call.assignmentExpiry._seconds * 1000)
                : new Date(call.assignmentExpiry);
        return expiry <= now;
    });
    
    console.log(`   Found ${expiredCalls.length} expired assignments`);
    problems.push(...expiredCalls.map(c => ({ ...c, issue: 'expired' })));
    
    console.log(`\n📊 Total problems to fix: ${problems.length}\n`);
    
    if (problems.length === 0) {
        console.log('✅ No problems found!');
        return;
    }
    
    // Show what we found
    console.log('📋 Calls that need fixing:');
    problems.slice(0, 15).forEach((call, i) => {
        const issueLabel = call.issue === 'ghost' ? '👻' : '⏰';
        console.log(`   ${issueLabel} ${i + 1}. ${call.contactName || 'Unknown'} - ${call.outcome || call.status} (${call.issue})`);
    });
    if (problems.length > 15) {
        console.log(`   ... and ${problems.length - 15} more`);
    }
    console.log('');
    
    // Confirm fix
    const proceed = confirm(
        `Fix ${problems.length} problematic assignments for Alex?\n\n` +
        `Ghost assignments: ${ghostCalls.length}\n` +
        `Expired assignments: ${expiredCalls.length}\n\n` +
        `This will clear assignedTo/assignmentExpiry fields.\n\n` +
        `Click OK to proceed, or Cancel to stop.`
    );
    
    if (!proceed) {
        console.log('❌ Fix cancelled');
        return;
    }
    
    console.log('🔧 Fixing assignments...\n');
    
    // Update each call
    let fixed = 0;
    let failed = 0;
    
    for (const call of problems) {
        try {
            const updateResponse = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/update/phone_activities', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: call.id,
                    data: {
                        assignedTo: null,
                        assignmentExpiry: null,
                        assignedAt: null,
                        reservedBy: null
                    }
                })
            });
            
            if (updateResponse.ok) {
                fixed++;
                if (fixed % 10 === 0 || fixed === problems.length) {
                    console.log(`   ✅ Fixed ${fixed} / ${problems.length} calls...`);
                }
            } else {
                failed++;
                console.error(`   ❌ Failed to fix ${call.id}: ${updateResponse.statusText}`);
            }
        } catch (error) {
            failed++;
            console.error(`   ❌ Error fixing ${call.id}:`, error);
        }
    }
    
    console.log('\n====================================');
    if (failed === 0) {
        console.log(`✅ SUCCESS! Fixed all ${fixed} problematic assignments`);
    } else {
        console.log(`⚠️ PARTIAL SUCCESS: Fixed ${fixed}, failed ${failed}`);
    }
    console.log('====================================\n');
    console.log('💡 NEXT STEPS:');
    console.log('   1. Have Alex refresh the page (Ctrl+Shift+R)');
    console.log('   2. He should click "Start Calling"');
    console.log(`   3. System will assign him ${12 - (assignedCalls.length - expiredCalls.length)} more calls to complete his 40-call reservation`);
    console.log('====================================');
    
})();

