// ==================================================================
// INSPECT CALL DATA STRUCTURE
// Run this in the browser console on phone-calls.html to see raw data
// ==================================================================
(async function() {
    console.log('🔍 INSPECTING CALL DATA STRUCTURE');
    console.log('====================================\n');
    
    const campaignId = 'campaign_1763999310498';
    const token = await window.auth.currentUser.getIdToken();
    
    console.log('📡 Fetching first 5 calls from Campaign 1...\n');
    
    const response = await fetch('https://railwayclemail-production.up.railway.app/api/clemail/query/phone_activities', {
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
            limit: 5
        })
    });
    
    const result = await response.json();
    console.log(`📊 Retrieved ${result.data.length} calls\n`);
    
    // Dump the raw structure of the first call
    if (result.data.length > 0) {
        console.log('📋 RAW STRUCTURE OF FIRST CALL:');
        console.log('====================================');
        console.log(JSON.stringify(result.data[0], null, 2));
        console.log('====================================\n');
        
        console.log('🔑 TOP-LEVEL KEYS:');
        console.log(Object.keys(result.data[0]));
        console.log('');
        
        // Check for nested data
        console.log('🔍 CHECKING FOR NESTED DATA STRUCTURE:');
        const firstCall = result.data[0];
        if (firstCall.data) {
            console.log('   ✅ Found "data" property!');
            console.log('   Keys in data:', Object.keys(firstCall.data));
        } else {
            console.log('   ❌ No "data" property');
        }
        
        if (firstCall.fields) {
            console.log('   ✅ Found "fields" property!');
            console.log('   Keys in fields:', Object.keys(firstCall.fields));
        } else {
            console.log('   ❌ No "fields" property');
        }
        console.log('');
        
        // Sample all 5 calls
        console.log('📊 SAMPLE OF ALL 5 CALLS:');
        result.data.forEach((call, i) => {
            console.log(`\n   Call ${i + 1}:`);
            console.log(`   Type: ${typeof call}`);
            console.log(`   Keys: ${Object.keys(call).slice(0, 10).join(', ')}...`);
            if (call.scheduledDate) {
                console.log(`   scheduledDate type: ${typeof call.scheduledDate}`);
                console.log(`   scheduledDate value:`, call.scheduledDate);
            }
            if (call.data && call.data.scheduledDate) {
                console.log(`   data.scheduledDate type: ${typeof call.data.scheduledDate}`);
                console.log(`   data.scheduledDate value:`, call.data.scheduledDate);
            }
        });
    } else {
        console.log('❌ No calls found!');
    }
    
    console.log('\n====================================');
    console.log('💡 Use this info to fix find-jan7-calls.js');
    console.log('====================================');
})();

