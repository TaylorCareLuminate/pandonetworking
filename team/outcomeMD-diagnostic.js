// ==================================================================
// OUTCOMEMD CAMPAIGN DIAGNOSTIC
// Run this in the browser console on phone-calls.html
// ==================================================================
(async function() {
    console.log('🔍 OUTCOMEMD CAMPAIGN DIAGNOSTIC');
    console.log('====================================\n');
    
    const campaignId = 'campaign_1762401107769';
    const token = await window.auth.currentUser.getIdToken();
    
    // Get ALL phone_activities for this campaign (no status filter)
    console.log('📡 Querying ALL phone_activities for OutcomeMD...\n');
    const response = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            constraints: [
                { field: 'campaignId', operator: '==', value: campaignId }
            ],
            limit: 5000
        })
    });
    
    const result = await response.json();
    if (!result.success) {
        console.error('❌ Query failed:', result.error);
        return;
    }
    
    console.log(`📊 Found ${result.data.length} total calls in OutcomeMD campaign\n`);
    
    // Status breakdown
    const byStatus = {};
    result.data.forEach(call => {
        byStatus[call.status] = (byStatus[call.status] || 0) + 1;
    });
    
    console.log('📊 Status Breakdown:');
    Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} calls`);
    });
    console.log('');
    
    // For pending/scheduled, check declined status
    const assignable = result.data.filter(call => call.status === 'pending' || call.status === 'scheduled');
    console.log(`📊 Assignable Calls (pending/scheduled): ${assignable.length}`);
    
    const declined = assignable.filter(call => 
        call.status === 'declined' || 
        call.outcome === 'declined' ||
        call.outcome === 'bad_number' ||
        call.outcome === 'wrong_number'
    );
    
    const notDeclined = assignable.filter(call => 
        !['declined', 'bad_number', 'wrong_number'].includes(call.outcome) &&
        call.status !== 'declined'
    );
    
    console.log(`   🚫 Declined: ${declined.length}`);
    console.log(`   ✅ Not declined: ${notDeclined.length}`);
    console.log('');
    
    // Check assignments
    const now = new Date();
    const activelyAssigned = notDeclined.filter(call => {
        if (!call.assignedTo || call.assignedTo === 'unassigned') return false;
        if (!call.assignmentExpiry) return false;
        const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
        return expiry > now;
    });
    
    const unassigned = notDeclined.filter(call => {
        if (!call.assignedTo || call.assignedTo === 'unassigned') return true;
        if (!call.assignmentExpiry) return true;
        const expiry = call.assignmentExpiry.toDate ? call.assignmentExpiry.toDate() : new Date(call.assignmentExpiry);
        return expiry <= now;
    });
    
    console.log(`📊 Assignment Status (non-declined calls):`);
    console.log(`   🔒 Actively assigned: ${activelyAssigned.length}`);
    if (activelyAssigned.length > 0) {
        const byUser = {};
        activelyAssigned.forEach(call => {
            const user = call.assignedTo.split('@')[0];
            byUser[user] = (byUser[user] || 0) + 1;
        });
        Object.entries(byUser).forEach(([user, count]) => {
            console.log(`      ${user}: ${count} calls`);
        });
    }
    console.log(`   ✅ Unassigned/expired: ${unassigned.length}`);
    console.log('');
    
    // Check scheduled dates for unassigned calls
    console.log(`📅 Scheduled Date Analysis (unassigned calls):`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdue = [];
    const dueToday = [];
    const future = [];
    const noDate = [];
    
    unassigned.forEach(call => {
        if (!call.scheduledDate) {
            noDate.push(call);
            return;
        }
        
        const schedDate = call.scheduledDate.toDate ? call.scheduledDate.toDate() : new Date(call.scheduledDate);
        schedDate.setHours(0, 0, 0, 0);
        
        if (schedDate < today) {
            overdue.push(call);
        } else if (schedDate.getTime() === today.getTime()) {
            dueToday.push(call);
        } else {
            future.push(call);
        }
    });
    
    console.log(`   ⏰ Overdue: ${overdue.length}`);
    console.log(`   📅 Due today: ${dueToday.length}`);
    console.log(`   🔮 Future: ${future.length}`);
    console.log(`   ❓ No date: ${noDate.length}`);
    console.log('');
    
    console.log('====================================');
    console.log('💡 SUMMARY:');
    console.log(`   Total calls: ${result.data.length}`);
    console.log(`   Assignable (pending/scheduled): ${assignable.length}`);
    console.log(`   After removing declined: ${notDeclined.length}`);
    console.log(`   Unassigned/expired: ${unassigned.length}`);
    console.log(`   Overdue + today: ${overdue.length + dueToday.length}`);
    console.log('====================================');
})();

