# Reserve-Calls.html - Campaign-Specific Workflow

## UI Flow

```
┌─────────────────────────────────────────────────────┐
│ RESERVE FUTURE CALLS                                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Select Campaign: [ABC Services ▼]                   │
│                  (Only trained campaigns shown)      │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │     JANUARY 2025 - ABC SERVICES                  │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Mon   Tue   Wed   Thu   Fri   Sat   Sun         │ │
│ │  6     7     8     9    10    11    12          │ │
│ │ 100   100    75    50    25     0     0         │ │
│ │ ✅    ✅    🟡   🟠   🔴    -     -          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Click a date to reserve calls for that day          │
│                                                      │
├─────────────────────────────────────────────────────┤
│ MY ACTIVE RESERVATIONS                               │
├─────────────────────────────────────────────────────┤
│ ┌─ ABC Services - Jan 6 ─────────────────────────┐ │
│ │ Reserved: 40 calls | Completed: 15 (37%)       │ │
│ │ [Go to Phone Calls] [Release Reservation]      │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ XYZ Corp - Jan 7 ─────────────────────────────┐ │
│ │ Reserved: 30 calls | Completed: 0 (0%)         │ │
│ │ [Go to Phone Calls] [Release Reservation]      │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Key Features

### 1. Campaign Selector (Shows Only Trained Campaigns)

```javascript
async function loadAvailableCampaigns() {
    // Same logic as phone-calls.html
    const trainedCampaignIds = teamMemberData.campaignAssignments
        .filter(a => a.trainingStatus === 'completed')
        .map(a => a.campaignId);
    
    // Load campaign details
    const campaigns = [];
    for (const campaignId of trainedCampaignIds) {
        const campaignDoc = await getDoc(doc(db, 'campaigns', campaignId));
        if (campaignDoc.exists()) {
            campaigns.push({
                id: campaignId,
                ...campaignDoc.data()
            });
        }
    }
    
    // Populate dropdown
    const select = document.getElementById('campaignSelect');
    select.innerHTML = campaigns.map(c => 
        `<option value="${c.id}">${c.name}</option>`
    ).join('');
}
```

### 2. Calendar Shows Availability for Selected Campaign Only

```javascript
async function loadCalendarForCampaign(campaignId, month, year) {
    // Query available calls for this campaign only
    const availableCallsQuery = query(
        collection(db, 'phone_activities'),
        where('campaignId', '==', campaignId),  // ← ONE CAMPAIGN
        where('status', '==', 'scheduled'),
        where('assignedTo', '==', null)  // Not yet reserved
    );
    
    const snapshot = await getDocs(availableCallsQuery);
    
    // Group by date
    const availabilityByDate = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        const dateStr = data.scheduledDate.toDate().toDateString();
        availabilityByDate[dateStr] = (availabilityByDate[dateStr] || 0) + 1;
    });
    
    // Render calendar
    renderCalendar(availabilityByDate);
}
```

### 3. Reserve Calls for Specific Campaign + Date

```javascript
async function reserveCallsForCampaign(campaignId, date, numberOfCalls) {
    console.log(`📋 Reserving ${numberOfCalls} calls for ${campaignId} on ${date}`);
    
    // Find available calls for THIS campaign on THIS date
    const availableQuery = query(
        collection(db, 'phone_activities'),
        where('campaignId', '==', campaignId),  // ← Specific campaign
        where('scheduledDate', '==', Timestamp.fromDate(date)),
        where('status', '==', 'scheduled'),
        where('assignedTo', '==', null),
        limit(numberOfCalls)
    );
    
    const snapshot = await getDocs(availableQuery);
    
    if (snapshot.size < numberOfCalls) {
        throw new Error(`Only ${snapshot.size} calls available for ${campaignId} on ${date.toDateString()}`);
    }
    
    // Assign calls
    const batch = writeBatch(db);
    const assignedCallIds = [];
    
    snapshot.forEach(doc => {
        assignedCallIds.push(doc.id);
        batch.update(doc.ref, {
            assignedTo: currentUser.email,
            assignmentType: 'reserved',
            reservationDate: Timestamp.fromDate(date),
            reservationDeadline: getEndOfDay(date)
        });
    });
    
    // Create reservation record (includes campaignId)
    const reservationRef = doc(collection(db, 'callReservations'));
    batch.set(reservationRef, {
        campaignId: campaignId,  // ← Track which campaign
        userEmail: currentUser.email,
        date: Timestamp.fromDate(date),
        reservedCalls: numberOfCalls,
        actualCallIds: assignedCallIds,
        status: 'active',
        createdAt: new Date()
    });
    
    await batch.commit();
    
    console.log(`✅ Reserved ${numberOfCalls} calls for ${campaignId}`);
}
```

### 4. Display My Reservations (Grouped by Campaign)

```javascript
async function loadMyReservations() {
    const reservationsQuery = query(
        collection(db, 'callReservations'),
        where('userEmail', '==', currentUser.email),
        where('status', '==', 'active')
    );
    
    const snapshot = await getDocs(reservationsQuery);
    
    // Group by campaign
    const reservationsByCampaign = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!reservationsByCampaign[data.campaignId]) {
            reservationsByCampaign[data.campaignId] = [];
        }
        reservationsByCampaign[data.campaignId].push({
            id: doc.id,
            ...data
        });
    });
    
    // Display grouped by campaign
    displayReservationsByCampaign(reservationsByCampaign);
}
```

---

## Agent Experience: No Context Switching

### Scenario: Agent has reservations in 2 campaigns

**Morning - Works on ABC Services:**
```
1. Opens phone-calls.html
2. Selects "ABC Services" from dropdown
3. Clicks "Load Calls"
4. Gets queue:
   - 15 reserved ABC Services calls
   - 10 pool ABC Services calls
   - Total: 25 calls, ALL from ABC Services
5. Works through all ABC Services calls
6. All calls use same pitch/script/mindset
```

**Afternoon - Switches to XYZ Corp:**
```
1. Finishes ABC Services calls
2. Goes BACK to campaign dropdown
3. Selects "XYZ Corp" from dropdown
4. Clicks "Load Calls"
5. Gets NEW queue:
   - 20 reserved XYZ Corp calls
   - 5 pool XYZ Corp calls
   - Total: 25 calls, ALL from XYZ Corp
6. Different pitch/script/mindset
7. Conscious context switch
```

**Result**: ✅ No accidental mixing of campaigns!

---

## Priority Scoring is Per-Campaign

### What This Means:

```
Campaign ABC Services:
├─ Call #1: Priority 1,500 (5 days overdue)
├─ Call #2: Priority 1,200 (3 days overdue)
├─ Call #3: Priority 300 (reserved today)
└─ Call #4: Priority 150 (pool)

Campaign XYZ Corp:
├─ Call #1: Priority 2,000 (10 days overdue)
├─ Call #2: Priority 800 (pool, low completion)
└─ Call #3: Priority 200 (pool)
```

**Agent loads ABC Services**: Sees calls #1-4 in that order
**Agent loads XYZ Corp**: Sees calls #1-3 in that order

**Never mixed together!**

---

## "Go to Phone Calls" Button

### From Reserve-Calls to Phone-Calls:

```html
<!-- In My Reservations section -->
<div class="reservation-card">
    <h4>ABC Services - Jan 6</h4>
    <p>Reserved: 40 calls | Completed: 15 (37%)</p>
    <button onclick="goToPhoneCalls('campaign_abc_123')">
        <i class="fas fa-phone"></i> Go to Phone Calls
    </button>
</div>

<script>
function goToPhoneCalls(campaignId) {
    // Navigate to phone-calls.html with campaign pre-selected
    window.location.href = `phone-calls.html?campaign=${campaignId}`;
}
</script>
```

### In phone-calls.html (handle URL parameter):

```javascript
// On page load, check for campaign parameter
const urlParams = new URLSearchParams(window.location.search);
const preselectedCampaign = urlParams.get('campaign');

if (preselectedCampaign) {
    // Set dropdown to this campaign
    document.getElementById('campaignSelect').value = preselectedCampaign;
    // Auto-load calls
    loadCallsForCampaign(preselectedCampaign);
}
```

---

## Summary: Campaign Isolation Enforcement

| Level | Enforcement | How |
|-------|-------------|-----|
| **Training** | ✅ Only trained campaigns shown | `trainingStatus === 'completed'` filter |
| **Dropdown** | ✅ Agent selects ONE campaign | Existing UI in phone-calls.html |
| **Query** | ✅ Filters by campaignId | `where('campaignId', '==', selected)` |
| **Reservations** | ✅ Per-campaign reservations | Reserve 40 from ABC, 30 from XYZ separately |
| **Priority** | ✅ Sorted within campaign | Sort AFTER filtering by campaign |
| **Context Switch** | ✅ Manual & obvious | Agent must change dropdown and reload |
| **Call Queue** | ✅ Single campaign only | Never mixed |

---

## Next: Update Migration Script

We should also add `campaignId` validation to the migration to ensure data integrity:

```javascript
// In migration script, skip records without valid campaignId
if (!data.campaignId) {
    console.warn(`Skipping record ${docSnap.id}: missing campaignId`);
    errorCount++;
    continue;
}
```

**Does this approach solve your concerns about campaign mixing?** The key is that:
1. Training status is already enforced ✅
2. Campaign selection is explicit and manual ✅  
3. Queries are campaign-specific ✅
4. No accidental context switching ✅

