# Call Reservation System Redesign
## Complete Implementation Plan

**Created:** December 29, 2025  
**Status:** PLANNING  
**Priority:** HIGH - Needed as call volume decreases and competition increases

---

## Executive Summary

**Problem:** Current reservation system doesn't actually assign calls to agents. Multiple agents can see/work the same calls, causing confusion and wasted effort.

**Solution:** Implement a three-tier call distribution system:
1. **Reserved Calls** - Hard assignments that only the assigned agent can see
2. **Urgent/Overdue Pool** - Open pool for anyone (current system)
3. **Future Planning** - Ability to reserve upcoming calls

---

## System Architecture

### Three Call Tiers

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: RESERVED CALLS                                      │
│  ─────────────────────────────────────────────────────────  │
│  • Hard assignment to specific agent                         │
│  • Only assigned agent can see these calls                   │
│  • Reserved for specific date range                          │
│  • If not completed by deadline → moves to Tier 2            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TIER 2: URGENT/OVERDUE POOL (Current System)               │
│  ─────────────────────────────────────────────────────────  │
│  • Calls past scheduled date                                 │
│  • Unreserved calls scheduled for today                      │
│  • Failed reservations (missed deadline)                     │
│  • Released assignments (admin action)                       │
│  • ANYONE can work these - first come, first served          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TIER 3: FUTURE AVAILABLE                                    │
│  ─────────────────────────────────────────────────────────  │
│  • Calls scheduled for future dates                          │
│  • Not yet assigned to anyone                                │
│  • Available for reservation                                 │
│  • Visible in planning/forecast view                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### 1. Add New Fields to `phone_activities`

```javascript
{
    // NEW FIELDS FOR RESERVATIONS
    assignedTo: string,              // Email of agent who has this call reserved
    assignedAt: Date,                // When the assignment was made
    assignedBy: string,              // Who made the assignment (agent email or "admin")
    
    assignmentType: string,          // "reserved" | "pool" | "admin-assigned"
    reservationDate: Date,           // The date this call is reserved for
    reservationDeadline: Date,       // When reservation expires (end of reserved day)
    
    assignmentStatus: string,        // "active" | "expired" | "released" | "completed"
    
    // Track if moved from reserved to pool
    wasReserved: boolean,            // True if this was reserved but moved to pool
    movedToPoolAt: Date,             // When it was moved to pool
    movedToPoolReason: string,       // "deadline-expired" | "agent-released" | "admin-released"
    
    // Priority calculation
    priorityScore: number,           // Calculated score for queue ordering
    isOverdue: boolean,              // True if past scheduledDate
    daysOverdue: number,             // Number of days past scheduledDate
    
    // Campaign achievement tracking
    campaignAchievementPool: number, // Achievement pool value for this campaign
    campaignCompletionRate: number,  // % of campaign calls completed (for priority)
}
```

### 2. Update `callReservations` Collection (Keep for History/Analytics)

```javascript
{
    // Existing fields
    campaignId: string,
    userEmail: string,
    date: Date,
    reservedCalls: number,
    status: string,                  // "active" | "completed" | "cancelled" | "expired"
    createdAt: Date,
    
    // NEW FIELDS
    actualCallIds: array,            // Array of phone_activity IDs assigned
    completedCallIds: array,         // Array of phone_activity IDs completed
    completedCount: number,          // How many were actually completed
    completionRate: number,          // completedCount / reservedCalls
    
    expiredAt: Date,                 // When reservation expired
    releasedAt: Date,                // If manually released
    releasedBy: string,              // Who released it (user or admin)
}
```

### 3. New Collection: `callForecasts` (Redesigned)

```javascript
{
    campaignId: string,
    date: Date,                      // The date these calls are planned for
    
    // Planning data (set by admin when scheduling campaign)
    totalCallsScheduled: number,     // How many calls scheduled for this date
    targetDailyCompletion: number,   // How many SHOULD be completed this day
    
    // Reservation tracking (updated as agents reserve)
    totalReserved: number,           // Sum of active reservations
    totalAvailable: number,          // Not yet reserved
    totalInPool: number,             // In urgent/overdue pool
    
    // Completion tracking (updated as calls complete)
    totalCompleted: number,          // How many completed so far
    completionRate: number,          // totalCompleted / totalCallsScheduled
    
    // Agent assignments
    agentReservations: array,        // [{userEmail, reservedCount, completedCount}]
    
    // Achievement pool impact
    achievementPoolTotal: number,    // Total pool value for this campaign
    achievementPoolRemaining: number, // Remaining pool value
    
    updatedAt: Date,
}
```

---

## Core Workflows

### Workflow 1: Admin Schedules Campaign Calls

**File:** `crm/campaign_schedule.html` or similar  
**Action:** Creates `phone_activities` for a campaign

```javascript
// When admin schedules calls for a campaign
async function scheduleCampaignCalls(campaignId, contacts, dateRange) {
    const callsPerDay = distributeCallsAcrossDateRange(contacts.length, dateRange);
    
    for (const [date, contactsForDay] of callsPerDay) {
        // Create phone_activities
        for (const contact of contactsForDay) {
            await addDoc(collection(db, 'phone_activities'), {
                campaignId: campaignId,
                outreachSetId: contact.id,
                
                // Contact data (from contact record)
                contactName: contact.name,
                phoneNumber: contact.phone,
                // ... all other contact fields ...
                
                // Scheduling
                status: 'scheduled',
                scheduledDate: date,
                
                // NEW: Assignment fields (initially unassigned)
                assignedTo: null,              // Not yet assigned
                assignmentType: 'pool',        // Starts in available pool
                assignmentStatus: 'active',    // Active and available
                
                // Priority
                isOverdue: false,
                daysOverdue: 0,
                priorityScore: calculateInitialPriority(date, campaignId),
                
                // Campaign data
                campaignAchievementPool: getCampaignAchievementPool(campaignId),
                
                createdAt: new Date(),
                createdBy: currentUser.email,
            });
        }
        
        // Create forecast record for this date
        await createOrUpdateForecast(campaignId, date, contactsForDay.length);
    }
}

// Helper: Create/update daily forecast
async function createOrUpdateForecast(campaignId, date, callCount) {
    const forecastId = `${campaignId}_${date.toISOString().split('T')[0]}`;
    
    await setDoc(doc(db, 'callForecasts', forecastId), {
        campaignId: campaignId,
        date: date,
        totalCallsScheduled: callCount,
        targetDailyCompletion: callCount,  // Default: complete all scheduled for that day
        
        totalReserved: 0,
        totalAvailable: callCount,
        totalInPool: 0,
        totalCompleted: 0,
        completionRate: 0,
        
        agentReservations: [],
        
        achievementPoolTotal: getCampaignAchievementPool(campaignId),
        achievementPoolRemaining: getCampaignAchievementPool(campaignId),
        
        updatedAt: new Date(),
    });
}
```

---

### Workflow 2: Agent Reserves Calls

**File:** `team/reserve-calls.html`  
**Action:** Agent commits to X calls for a specific date

```javascript
async function reserveCalls(campaignId, date, numberOfCalls) {
    const userEmail = currentUser.email;
    
    // Step 1: Check availability
    const forecastId = `${campaignId}_${date.toISOString().split('T')[0]}`;
    const forecastDoc = await getDoc(doc(db, 'callForecasts', forecastId));
    
    if (!forecastDoc.exists()) {
        throw new Error('No calls scheduled for this date');
    }
    
    const forecast = forecastDoc.data();
    const availableCalls = forecast.totalAvailable;
    
    if (numberOfCalls > availableCalls) {
        throw new Error(`Only ${availableCalls} calls available for reservation`);
    }
    
    // Step 2: Query for unassigned calls
    const unassignedQuery = query(
        collection(db, 'phone_activities'),
        where('campaignId', '==', campaignId),
        where('scheduledDate', '==', date),
        where('status', '==', 'scheduled'),
        where('assignedTo', '==', null),  // Not assigned to anyone
        limit(numberOfCalls)
    );
    
    const snapshot = await getDocs(unassignedQuery);
    
    if (snapshot.docs.length < numberOfCalls) {
        throw new Error(`Only ${snapshot.docs.length} calls actually available`);
    }
    
    // Step 3: Assign calls to this agent
    const batch = writeBatch(db);
    const assignedCallIds = [];
    const reservationDeadline = new Date(date);
    reservationDeadline.setHours(23, 59, 59, 999);  // End of reservation day
    
    snapshot.docs.forEach((docSnap) => {
        assignedCallIds.push(docSnap.id);
        
        batch.update(docSnap.ref, {
            assignedTo: userEmail,
            assignedAt: new Date(),
            assignedBy: userEmail,
            assignmentType: 'reserved',
            reservationDate: date,
            reservationDeadline: reservationDeadline,
            assignmentStatus: 'active',
        });
    });
    
    // Step 4: Create reservation record
    const reservationData = {
        campaignId: campaignId,
        userEmail: userEmail,
        date: date,
        reservedCalls: numberOfCalls,
        actualCallIds: assignedCallIds,
        status: 'active',
        createdAt: new Date(),
        
        completedCallIds: [],
        completedCount: 0,
        completionRate: 0,
    };
    
    const reservationRef = await addDoc(collection(db, 'callReservations'), reservationData);
    
    // Step 5: Update forecast
    batch.update(doc(db, 'callForecasts', forecastId), {
        totalReserved: increment(numberOfCalls),
        totalAvailable: increment(-numberOfCalls),
        agentReservations: arrayUnion({
            userEmail: userEmail,
            reservedCount: numberOfCalls,
            completedCount: 0,
            reservationId: reservationRef.id,
        }),
        updatedAt: new Date(),
    });
    
    await batch.commit();
    
    console.log(`✅ Reserved ${numberOfCalls} calls for ${userEmail} on ${date}`);
    return { reservationId: reservationRef.id, callIds: assignedCallIds };
}
```

---

### Workflow 3: Agent Loads Calls (Updated Logic)

**File:** `team/phone-calls.html`  
**Action:** Agent clicks "Load Calls" for a campaign

```javascript
async function loadCallsForCampaign(campaignId) {
    const userEmail = currentUser.email;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Query for calls this agent can work
    // Includes:
    // 1. Calls assigned to them (reserved)
    // 2. Calls in the pool (unassigned and overdue/today)
    const callsQuery = query(
        collection(db, 'phone_activities'),
        where('campaignId', '==', campaignId),
        where('status', 'in', ['pending', 'scheduled']),
        where(or(
            // Their reserved calls
            where('assignedTo', '==', userEmail),
            // OR calls in the open pool
            and(
                where('assignedTo', '==', null),
                where('scheduledDate', '<=', today)  // Today or overdue
            )
        ))
    );
    
    const snapshot = await getDocs(callsQuery);
    const calls = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        
        // Calculate priority
        const priority = calculateCallPriority(data);
        
        calls.push({
            id: doc.id,
            ...data,
            priority: priority,
            isMyReservation: data.assignedTo === userEmail,
            isPoolCall: data.assignedTo === null,
        });
    });
    
    // Sort by priority (overdue first, then reserved, then achievement pool value)
    calls.sort((a, b) => b.priority - a.priority);
    
    return calls;
}

// Calculate priority score for queue ordering
function calculateCallPriority(call) {
    let score = 0;
    
    // HIGHEST PRIORITY: Overdue calls
    if (call.isOverdue) {
        score += 1000;
        score += (call.daysOverdue || 0) * 100;  // More overdue = higher priority
    }
    
    // SECOND: Expired reservations (were reserved but deadline passed)
    if (call.wasReserved && call.movedToPoolReason === 'deadline-expired') {
        score += 500;
    }
    
    // THIRD: Reserved calls for today
    if (call.assignedTo && call.reservationDate) {
        const resDate = new Date(call.reservationDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (resDate <= today) {
            score += 300;
        }
    }
    
    // FOURTH: Campaign completion rate (lower completion = higher priority)
    // This ensures campaigns with low activity get attention
    const completionRate = call.campaignCompletionRate || 0;
    score += (1 - completionRate) * 200;
    
    // FIFTH: Achievement pool value (higher pool = more attractive)
    const poolValue = call.campaignAchievementPool || 0;
    score += poolValue * 0.1;  // Small weight
    
    return score;
}
```

---

### Workflow 4: Nightly Job - Move Expired Reservations to Pool

**File:** `jobs/call-assignment-jobs.js` (Cloud Function or scheduled task)  
**Schedule:** Runs daily at 12:01 AM

```javascript
async function releaseExpiredReservations() {
    console.log('🔄 Running nightly job: Release expired reservations');
    
    const now = new Date();
    
    // Find all active reservations where deadline has passed
    const expiredQuery = query(
        collection(db, 'phone_activities'),
        where('assignmentStatus', '==', 'active'),
        where('assignmentType', '==', 'reserved'),
        where('reservationDeadline', '<', now)
    );
    
    const snapshot = await getDocs(expiredQuery);
    
    if (snapshot.empty) {
        console.log('✅ No expired reservations found');
        return;
    }
    
    console.log(`📊 Found ${snapshot.size} expired reservations to release`);
    
    const batch = writeBatch(db);
    const expiredByAgent = {};  // Track by agent for analytics
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const agentEmail = data.assignedTo;
        
        // Move to pool
        batch.update(docSnap.ref, {
            assignedTo: null,
            assignmentType: 'pool',
            assignmentStatus: 'expired',
            
            wasReserved: true,
            movedToPoolAt: now,
            movedToPoolReason: 'deadline-expired',
            
            // Recalculate priority
            isOverdue: true,
            daysOverdue: calculateDaysOverdue(data.scheduledDate),
            priorityScore: calculateCallPriority({
                ...data,
                isOverdue: true,
                wasReserved: true,
            }),
        });
        
        // Track for analytics
        if (!expiredByAgent[agentEmail]) {
            expiredByAgent[agentEmail] = 0;
        }
        expiredByAgent[agentEmail]++;
    });
    
    await batch.commit();
    
    // Update callReservations to mark as expired
    for (const [agentEmail, count] of Object.entries(expiredByAgent)) {
        const reservationsQuery = query(
            collection(db, 'callReservations'),
            where('userEmail', '==', agentEmail),
            where('status', '==', 'active'),
            where('date', '<', now)
        );
        
        const resSnapshot = await getDocs(reservationsQuery);
        const resBatch = writeBatch(db);
        
        resSnapshot.forEach(resDoc => {
            const resData = resDoc.data();
            
            resBatch.update(resDoc.ref, {
                status: 'expired',
                expiredAt: now,
                completionRate: resData.completedCount / resData.reservedCalls,
            });
        });
        
        await resBatch.commit();
    }
    
    console.log(`✅ Released ${snapshot.size} expired reservations:`, expiredByAgent);
}
```

---

### Workflow 5: Admin Releases or Reassigns Calls

**File:** `admin/call-assignments.html` (New admin tool)  
**Action:** Admin manually releases calls or reassigns them

```javascript
// Release calls from an agent (if they quit, get fired, etc.)
async function adminReleaseCallsFromAgent(agentEmail, campaignId = null) {
    const constraints = [
        where('assignedTo', '==', agentEmail),
        where('status', 'in', ['pending', 'scheduled']),
    ];
    
    if (campaignId) {
        constraints.push(where('campaignId', '==', campaignId));
    }
    
    const callsQuery = query(collection(db, 'phone_activities'), ...constraints);
    const snapshot = await getDocs(callsQuery);
    
    const batch = writeBatch(db);
    
    snapshot.forEach(docSnap => {
        batch.update(docSnap.ref, {
            assignedTo: null,
            assignmentType: 'pool',
            assignmentStatus: 'released',
            
            wasReserved: true,
            movedToPoolAt: new Date(),
            movedToPoolReason: 'admin-released',
            
            // Recalculate priority
            priorityScore: calculateCallPriority(docSnap.data()),
        });
    });
    
    await batch.commit();
    
    console.log(`✅ Admin released ${snapshot.size} calls from ${agentEmail}`);
}

// Reassign calls from one agent to another
async function adminReassignCalls(fromEmail, toEmail, campaignId, numberOfCalls) {
    const callsQuery = query(
        collection(db, 'phone_activities'),
        where('assignedTo', '==', fromEmail),
        where('campaignId', '==', campaignId),
        where('status', 'in', ['pending', 'scheduled']),
        limit(numberOfCalls)
    );
    
    const snapshot = await getDocs(callsQuery);
    const batch = writeBatch(db);
    
    snapshot.forEach(docSnap => {
        batch.update(docSnap.ref, {
            assignedTo: toEmail,
            assignedBy: currentUser.email,  // Admin who made the reassignment
            assignmentType: 'admin-assigned',
            assignedAt: new Date(),
        });
    });
    
    await batch.commit();
    
    console.log(`✅ Admin reassigned ${snapshot.size} calls from ${fromEmail} to ${toEmail}`);
}
```

---

## Page Redesigns

### 1. `my-campaigns.html` - Repurpose or Remove

**Option A: Remove entirely**
- Delete the file
- Update back button on `phone-calls.html` to go to `index.html` (team dashboard)

**Option B: Repurpose as "My Reservations" overview**
- Show all active reservations across campaigns
- Show completion progress
- Quick links to start calling
- Stats: reserved vs completed vs expired

**Recommendation:** Option A (remove) - The team dashboard already shows campaign overview

---

### 2. `reserve-calls.html` - Complete Redesign

**New Purpose:** Planning and reservation interface

**Key Sections:**
1. **Campaign Selector** - Choose which campaign to reserve calls for
2. **Calendar View** - Show available calls by date
3. **Reservation Form** - Reserve X calls for specific date(s)
4. **My Reservations** - Show active reservations and progress
5. **Available Pool** - Show how many calls are in urgent pool (unreserved)

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│ Reserve Future Calls                                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Campaign: [Dropdown Selector]                               │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         DECEMBER 2025 - CALL AVAILABILITY              │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  Mon    Tue    Wed    Thu    Fri    Sat    Sun        │  │
│  │         30     31      1      2      3      4          │  │
│  │                      (50)   (75)   (60)   (20)         │  │
│  │                                                         │  │
│  │   5      6      7      8      9     10     11          │  │
│  │ (100)  (100)  (100)  (100)  (100)  (50)    -          │  │
│  │                                                         │  │
│  │  Legend:                                                │  │
│  │  • Number = Calls available for reservation            │  │
│  │  • Green = Many available                              │  │
│  │  • Yellow = Some available                             │  │
│  │  • Red = Few available                                 │  │
│  │  • Gray = No calls scheduled / past date               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Reserve Calls:                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Date: [Date Picker]                                  │    │
│  │ Number of Calls: [Input]                             │    │
│  │ Available: 100 calls                                 │    │
│  │                                                       │    │
│  │ [Reserve Calls] [Cancel]                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MY ACTIVE RESERVATIONS                                 │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Campaign XYZ - Jan 5 - 50 calls - 15 completed        │  │
│  │ [Start Calling] [Release Reservation]                  │  │
│  │                                                         │  │
│  │ Campaign ABC - Jan 6 - 40 calls - 0 completed         │  │
│  │ [Start Calling] [Release Reservation]                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ URGENT POOL (Available to Anyone)                      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Campaign XYZ: 23 overdue calls                         │  │
│  │ Campaign ABC: 45 overdue calls                         │  │
│  │                                                         │  │
│  │ [Go to Phone Calls Page]                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. `phone-calls.html` - Minimal Changes

**Keep existing functionality, add:**
1. Visual indicator if a call is from your reservation vs pool
2. Stats showing: "Your Reserved: X | Pool: Y | Total: Z"
3. Priority-based queue ordering (using `priorityScore`)

**Changes Needed:**
- Update `loadCalls()` query (see Workflow 3 above)
- Add visual badges: "My Reservation" vs "Pool Call"
- Update stats display

---

## Admin Tools Needed

### 1. Call Assignment Dashboard

**File:** `admin/call-assignments.html` (NEW)

**Features:**
- View all active reservations by agent
- See completion rates
- Release calls from agents
- Reassign calls between agents
- Override system and manually assign calls
- View pool statistics

### 2. Campaign Forecasting Tool

**File:** `admin/call-forecasting.html` (NEW or enhance existing)

**Features:**
- Set expected daily call volumes when scheduling
- View reservation vs completion trends
- Identify campaigns falling behind
- Adjust achievement pool values to incentivize lagging campaigns

---

## Migration Plan

### Phase 1: Database Setup (Week 1)
1. Add new fields to `phone_activities` schema documentation
2. Create Firestore indexes:
   ```javascript
   // Index 1: For loading agent's calls
   phone_activities: campaignId, assignedTo, status, scheduledDate
   
   // Index 2: For loading pool calls
   phone_activities: campaignId, assignedTo, scheduledDate, status
   
   // Index 3: For expired reservations job
   phone_activities: assignmentStatus, assignmentType, reservationDeadline
   ```
3. Update scheduling code to set initial assignment fields
4. Backfill existing `phone_activities` with assignment defaults

### Phase 2: Core Reservation Logic (Week 2)
1. Implement `reserveCalls()` function
2. Update `phone-calls.html` loadCalls query
3. Add priority calculation
4. Test reservation → assignment flow

### Phase 3: Release & Expiry Logic (Week 3)
1. Implement nightly expiration job
2. Add manual release functionality for agents
3. Test pool dynamics
4. Verify calls move correctly

### Phase 4: UI Updates (Week 4)
1. Redesign `reserve-calls.html` with calendar view
2. Update `phone-calls.html` with reservation indicators
3. Remove or repurpose `my-campaigns.html`
4. Test full user workflows

### Phase 5: Admin Tools (Week 5)
1. Create admin assignment dashboard
2. Add bulk release/reassign functions
3. Create forecasting view
4. Test admin override capabilities

### Phase 6: Testing & Launch (Week 6)
1. Full end-to-end testing
2. Load testing with multiple agents
3. Documentation and training
4. Phased rollout

---

## Questions to Answer Before Implementation

### 1. **Reservation Flexibility**
- Can agents release their own reservations if they can't complete them?
- Should there be a penalty or limit on releasing reservations?

**Recommendation:** Yes, allow self-release. Track release rate per agent to identify chronic over-committers.

### 2. **Over-Reservation**
- What happens if more calls are reserved than exist?
- Should we allow over-booking (like airlines) anticipating some non-completion?

**Recommendation:** Allow up to 110% reservation (10% over-booking). First-come-first-served gets the actual calls.

### 3. **Achievement Pool Impact**
- How do we ensure low-achievement-pool campaigns get completed?
- Should we boost priority for lagging campaigns?

**Recommendation:** Yes. Priority score includes campaign completion rate. Campaigns <50% complete get priority boost.

### 4. **Multi-Day Reservations**
- Can agents reserve calls for multiple days at once?
- Should there be limits on how far in advance you can reserve?

**Recommendation:** Allow up to 7 days in advance. Max 200 calls per agent at any time.

### 5. **Partial Completion**
- Agent reserves 50 calls, completes 30. What happens to the 20?
- Should they roll over or go to pool?

**Recommendation:** Uncompleted calls go to pool at deadline. Track completion rate per agent.

---

## Key Metrics to Track

### Agent Performance
- Reservation completion rate (completed / reserved)
- Average calls per reservation
- Release frequency (how often they release reservations)
- Pool call completion (how many non-reserved calls they take)

### System Health
- % of calls reserved vs pool
- Average time from scheduled date to completion
- Campaign completion velocity
- Achievement pool effectiveness (does it drive completion?)

### Campaign Health
- Days behind schedule
- % completed vs % scheduled
- Reservation rate (are agents claiming these calls?)
- Pool accumulation (how many falling through to pool?)

---

## Success Criteria

### Phase 1 Success:
- ✅ Agents can reserve calls and only see their calls
- ✅ No duplicate work between agents on reserved calls
- ✅ Pool calls accessible to anyone

### Phase 2 Success:
- ✅ Expired reservations automatically move to pool
- ✅ Priority queue ensures overdue calls get attention
- ✅ Admins can reassign calls as needed

### Phase 3 Success:
- ✅ 90%+ of calls are made by or before scheduled date
- ✅ All campaigns complete regardless of achievement pool size
- ✅ Agents can plan their workload 3-7 days in advance
- ✅ Reduced conflict/confusion about call assignments

---

## Rollback Plan

If system causes issues:

1. **Immediate Rollback:**
   - Set all `assignedTo` fields to `null`
   - System reverts to current "everyone sees everything" behavior
   - No data loss

2. **Partial Rollback:**
   - Keep assignment system but disable reservations
   - All calls go to pool
   - Admins can still manually assign

3. **Data Safety:**
   - All changes are additive (new fields)
   - No deletion of existing collections
   - Can always query old data

---

## Next Steps

1. **Review this plan** - Confirm approach aligns with business needs
2. **Answer key questions** - Especially around flexibility and policies
3. **Prototype** - Build Phase 1 in staging environment
4. **Test with small group** - 2-3 agents testing reservation flow
5. **Iterate** - Refine based on feedback
6. **Full rollout** - Deploy to all agents

---

**Status:** 🟡 PENDING APPROVAL  
**Estimated Timeline:** 6 weeks  
**Risk Level:** Medium - Significant changes but with rollback plan  
**Impact:** High - Will eliminate duplicate work and improve planning

