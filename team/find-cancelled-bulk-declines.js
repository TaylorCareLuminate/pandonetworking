// Diagnostic: Find contacts where Mak marked one call as declined/contact-left today,
// but has 2+ other pending calls for the same contact

console.log('🔍 FINDING CANCELLED BULK DECLINES');
console.log('====================================\n');

// Get today's date range (midnight to now)
const today = new Date();
today.setHours(0, 0, 0, 0);
const now = new Date();

console.log(`📅 Searching from ${today.toLocaleString()} to ${now.toLocaleString()}\n`);

// Query for calls completed today with permanent failure outcomes
const completedTodayQuery = query(
    collection(db, 'phone_activities'),
    where('completedAt', '>=', today.toISOString()),
    where('outcome', 'in', ['contact-left-no-replacement', 'spoke-declined', 'bad-number-wrong-person'])
);

const snapshot = await getDocs(completedTodayQuery);
console.log(`📊 Found ${snapshot.docs.length} permanent failure calls marked today\n`);

// Group by customerId and company to find contacts with incomplete bulk declines
const contactsMap = new Map();

for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    
    // Only look at Mak's calls (adjust email if needed)
    if (!data.completedBy || !data.completedBy.includes('mak')) {
        continue;
    }
    
    if (data.customerId && data.company) {
        const key = `${data.company}|||${data.customerId}`;
        
        if (!contactsMap.has(key)) {
            contactsMap.set(key, {
                contactName: data.contactName || 'Unknown',
                company: data.company,
                customerId: data.customerId,
                outcome: data.outcome,
                completedAt: data.completedAt,
                completedBy: data.completedBy,
                callId: docSnap.id,
                pendingCalls: []
            });
        }
    }
}

console.log(`👤 Found ${contactsMap.size} unique contacts marked by Mak today\n`);

// For each contact, check if they have other pending calls
for (const [key, contact] of contactsMap.entries()) {
    const pendingQuery = query(
        collection(db, 'phone_activities'),
        where('customerId', '==', contact.customerId),
        where('status', 'in', ['pending', 'scheduled', 'callback-scheduled'])
    );
    
    const pendingSnapshot = await getDocs(pendingQuery);
    
    // Filter to only same company
    const samePending = pendingSnapshot.docs.filter(doc => {
        const d = doc.data();
        return d.company === contact.company;
    });
    
    if (samePending.length > 0) {
        contact.pendingCalls = samePending.map(doc => ({
            id: doc.id,
            campaignId: doc.data().campaignId,
            scheduledDate: doc.data().scheduledDate,
            status: doc.data().status
        }));
    }
}

// Filter to only contacts that have pending calls remaining
const incompleteDeclines = Array.from(contactsMap.values()).filter(c => c.pendingCalls.length > 0);

console.log('═══════════════════════════════════════');
console.log(`🎯 INCOMPLETE BULK DECLINES: ${incompleteDeclines.length}`);
console.log('═══════════════════════════════════════\n');

if (incompleteDeclines.length === 0) {
    console.log('✅ No incomplete bulk declines found - all contacts were fully processed!');
} else {
    incompleteDeclines.forEach((contact, i) => {
        console.log(`${i + 1}. ${contact.contactName}`);
        console.log(`   Company: ${contact.company}`);
        console.log(`   CustomerId: ${contact.customerId}`);
        console.log(`   Outcome: ${contact.outcome}`);
        console.log(`   Completed: ${new Date(contact.completedAt).toLocaleString()}`);
        console.log(`   Completed By: ${contact.completedBy}`);
        console.log(`   Original Call ID: ${contact.callId}`);
        console.log(`   ⚠️  ${contact.pendingCalls.length} PENDING CALLS REMAIN:`);
        contact.pendingCalls.forEach((pending, j) => {
            console.log(`      ${j + 1}. ${pending.id} (${pending.status}, campaign: ${pending.campaignId})`);
        });
        console.log('');
    });
    
    console.log('\n📋 TO FIX MANUALLY:');
    console.log('Copy the call IDs above and mark them with the same outcome.');
    console.log('Or re-run the script below to auto-complete them:\n');
    
    incompleteDeclines.forEach((contact, i) => {
        console.log(`// Fix contact ${i + 1}: ${contact.contactName}`);
        contact.pendingCalls.forEach(pending => {
            console.log(`await updateDoc(doc(db, 'phone_activities', '${pending.id}'), {`);
            console.log(`    status: 'completed',`);
            console.log(`    outcome: '${contact.outcome}',`);
            console.log(`    completedAt: new Date().toISOString(),`);
            console.log(`    completedBy: currentUser.email,`);
            console.log(`    notes: 'Contact ${contact.outcome === 'contact-left-no-replacement' ? 'left company' : contact.outcome === 'spoke-declined' ? 'declined permanently' : 'wrong person/company'} (bulk-fix from ${contact.callId})',`);
            console.log(`    autoCompletedReason: 'bulk-decline-fix',`);
            console.log(`    originalCallId: '${contact.callId}',`);
            console.log(`    basePayment: 0,`);
            console.log(`    totalPayment: 0`);
            console.log(`});`);
        });
        console.log('');
    });
}

