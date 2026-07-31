# Call Reservation System - Best Practices & Considerations
## What You Might Not Be Thinking About

**Created:** December 29, 2025  
**Audience:** System Design & Business Logic

---

## Things You Might Not Be Considering

### 1. **Agent Behavior & Gaming the System**

#### The Problem:
- Agents will naturally gravitate toward high-achievement-pool campaigns
- Some agents may "hoard" reservations (reserve but not complete)
- Agents may reserve more than they can complete to "lock in" good campaigns
- Agents working at different times may have unfair advantages

#### Solutions:
- **Reservation Limits:** Max 200 calls per agent at any time
- **Completion Rate Tracking:** Track agent's history of completing reservations
- **Reservation Priority:** Agents with better completion rates get first dibs on new calls
- **Time-Based Fairness:** Stagger reservation windows (high performers get early access, but everyone gets access)
- **Penalties for Low Completion:** Agents who consistently complete <70% of reservations get temporary reservation limits reduced

```javascript
// Example: Calculate agent's reservation allowance
function getAgentReservationLimit(agentEmail) {
    const baseLimit = 200;
    const recentCompletionRate = getAgentCompletionRate(agentEmail, last30Days);
    
    if (recentCompletionRate >= 0.90) {
        return baseLimit * 1.5;  // 300 calls for high performers
    } else if (recentCompletionRate >= 0.70) {
        return baseLimit;  // 200 calls for average
    } else if (recentCompletionRate >= 0.50) {
        return baseLimit * 0.5;  // 100 calls for struggling
    } else {
        return 0;  // No reservations allowed, must work from pool
    }
}
```

---

### 2. **Timezone Complications**

#### The Problem:
- Agent in EST reserves 50 calls scheduled for "Jan 5"
- Some contacts are PST, so "Jan 5" for them extends 3 hours later
- When exactly does the reservation expire?
- What if agent works late and calls PST contacts at 11 PM EST (8 PM PST)?

#### Solutions:
- **Use contact's timezone for deadlines:** Reservation for Jan 5 expires at 11:59 PM in the CONTACT's timezone
- **Grace period:** 2-hour grace period after midnight in contact's timezone before releasing to pool
- **Clear UI indicators:** Show agent which calls are expiring soon
- **Agent timezone preference:** Let agents filter reservations by timezone compatibility

```javascript
function calculateReservationDeadline(reservationDate, contactTimezone) {
    // Set deadline to end of day in CONTACT's timezone
    const deadline = new Date(reservationDate);
    deadline.setHours(23, 59, 59, 999);
    
    // Convert to UTC considering contact's timezone
    const deadlineInContactTZ = toTimeZone(deadline, contactTimezone);
    
    // Add 2-hour grace period
    deadlineInContactTZ.setHours(deadlineInContactTZ.getHours() + 2);
    
    return deadlineInContactTZ.toISOString();
}
```

---

### 3. **Campaign Scheduling vs Agent Availability**

#### The Problem:
- Company wants 500 calls made across 2 weeks (Jan 1-14)
- That's ~35 calls/day, but what if there aren't enough agents available each day?
- What if most agents are available Mon-Fri, but calls need to happen on weekends?
- What if a campaign launches mid-week and agents already have reservations elsewhere?

#### Solutions:
- **Capacity Planning Dashboard (Admin):**
  - Show total agent capacity vs scheduled calls per day
  - Alert when under-staffed days exist
  - Suggest redistribution of calls to better-staffed days

- **Flexible Scheduling:**
  - Allow admins to mark certain days as "priority" (higher achievement pool)
  - Allow agents to see under-staffed campaigns and get bonus for helping

- **Auto-Rebalancing:**
  - If a day reaches 90% of time window with <50% completion, auto-release future reservations for that date
  - Allows more agents to jump in

```javascript
// Admin view: Daily capacity vs demand
function calculateDailyCapacity(date) {
    const agentAvailability = getAgentAvailabilityForDate(date);
    const averageCallsPerAgentPerDay = 30;  // Historical average
    
    const estimatedCapacity = agentAvailability.length * averageCallsPerAgentPerDay;
    const scheduledCalls = getScheduledCallsForDate(date);
    const reservedCalls = getReservedCallsForDate(date);
    
    return {
        capacity: estimatedCapacity,
        scheduled: scheduledCalls,
        reserved: reservedCalls,
        available: scheduledCalls - reservedCalls,
        utilizationRate: reservedCalls / estimatedCapacity,
        atRisk: utilizationRate < 0.3,  // Less than 30% reserved
    };
}
```

---

### 4. **Callback & Follow-up Complications**

#### The Problem:
- Agent completes a call, schedules callback for 3 days later
- 3 days later, callback is in the pool (not assigned to original agent)
- Different agent calls, customer is confused ("I already talked to someone")
- Original agent's rapport is lost

#### Solutions:
- **Auto-assign callbacks to original agent:**
  - When callback is created, automatically set `assignedTo` to original agent
  - Does NOT count against their reservation limit
  - But DOES count toward their workload visibility

- **Callback Ownership Rules:**
  - Callbacks stay with original agent for 7 days
  - After 7 days, if not completed, move to pool
  - Original agent gets notification before release

- **UI Indicator:**
  - Show agents their pending callbacks separately from reservations
  - "You have 5 callbacks due this week"

```javascript
async function createCallback(originalCall, callbackDate) {
    const callbackActivity = {
        ...originalCall,  // Copy all contact data
        
        status: 'callback-scheduled',
        scheduledDate: callbackDate,
        isCallback: true,
        originalCallId: originalCall.id,
        
        // AUTO-ASSIGN to original agent
        assignedTo: originalCall.completedBy,
        assignedBy: 'system',
        assignmentType: 'callback-owned',  // Special type
        reservationDeadline: addDays(callbackDate, 7),  // 7-day window
        
        // Don't count toward reservation limit
        countsTowardReservationLimit: false,
        
        createdAt: new Date(),
    };
    
    await addDoc(collection(db, 'phone_activities'), callbackActivity);
}
```

---

### 5. **Contact-Level Conflicts**

#### The Problem:
- Same contact is in multiple campaigns
- Agent A reserves contact from Campaign X
- Agent B reserves same contact from Campaign Y
- Both agents call the same person on the same day

#### Solutions:
- **Global Contact Lock:**
  - When a call is assigned (reserved), mark that contact as "in use"
  - Check across ALL campaigns before allowing reservation
  - Prevent duplicate assignment of same contact

- **Contact Scheduling Buffer:**
  - If contact was called today, don't allow reservations for same contact until +2 business days
  - Enforce at reservation time, not call time

- **Admin Override:**
  - Admins can override and assign same contact to different campaigns
  - Use case: Different products, coordinated outreach

```javascript
async function canReserveContact(contactId, campaignId, date) {
    // Check if contact has any active assignments
    const activeAssignmentsQuery = query(
        collection(db, 'phone_activities'),
        where('outreachSetId', '==', contactId),
        where('status', 'in', ['pending', 'scheduled']),
        where('assignedTo', '!=', null)
    );
    
    const activeAssignments = await getDocs(activeAssignmentsQuery);
    
    if (!activeAssignments.empty) {
        // Contact is already assigned to someone
        const existingAssignment = activeAssignments.docs[0].data();
        
        // Check if in different campaign
        if (existingAssignment.campaignId !== campaignId) {
            return {
                canReserve: false,
                reason: `Contact already assigned in ${existingAssignment.campaignId}`,
                assignedTo: existingAssignment.assignedTo,
            };
        }
    }
    
    // Check recent call history
    const recentCallsQuery = query(
        collection(db, 'phone_activities'),
        where('outreachSetId', '==', contactId),
        where('status', '==', 'completed'),
        where('completedAt', '>', subtractBusinessDays(new Date(), 2))
    );
    
    const recentCalls = await getDocs(recentCallsQuery);
    
    if (!recentCalls.empty) {
        return {
            canReserve: false,
            reason: 'Contact was called within last 2 business days',
            lastCallDate: recentCalls.docs[0].data().completedAt,
        };
    }
    
    return { canReserve: true };
}
```

---

### 6. **Achievement Pool Dynamics**

#### The Problem:
- Campaign A: 1000 calls, $5000 achievement pool ($5/call average)
- Campaign B: 1000 calls, $500 achievement pool ($0.50/call average)
- All agents flock to Campaign A
- Campaign B never gets completed

#### Solutions:
- **Dynamic Pool Adjustment:**
  - If campaign falls behind schedule, auto-increase achievement pool
  - Calculate: `daysOverdue * basePoolIncrease`
  - Example: Campaign 3 days overdue, add $1000 to pool

- **Mandatory Diversity:**
  - Agents must work at least 2 different campaigns per week
  - OR: First 20 calls of the week must be from assigned campaign (admin assigns low-pool campaigns)

- **Pool Call Bonuses:**
  - Calls in the pool (unreserved/overdue) get automatic 25% bonus
  - Incentivizes agents to clean up backlog

- **Visible Incentive Ladder:**
  - Show agents: "This campaign's pool increases by $200 every day it's not completed"
  - Gamify the urgency

```javascript
function calculateDynamicAchievementPool(campaign) {
    const basePool = campaign.originalAchievementPool;
    const today = new Date();
    const targetCompletionDate = campaign.targetCompletionDate;
    
    // Calculate days overdue
    const daysOverdue = Math.max(0, daysBetween(targetCompletionDate, today));
    
    // Add $100 per day overdue
    const overdueBonus = daysOverdue * 100;
    
    // Calculate completion rate
    const completionRate = campaign.completedCalls / campaign.totalCalls;
    
    // If completion rate is below target, add bonus
    let lowCompletionBonus = 0;
    if (completionRate < 0.5 && daysOverdue > 3) {
        lowCompletionBonus = 500;  // Flat bonus for struggling campaigns
    }
    
    return basePool + overdueBonus + lowCompletionBonus;
}
```

---

### 7. **Forecasting Accuracy**

#### The Problem:
- Admin schedules 100 calls per day for 10 days
- Reality: Some days 200 calls get made, other days 20 calls
- Agents don't actually work evenly
- Business doesn't know when calls will actually be completed

#### Solutions:
- **Historical-Based Forecasting:**
  - Track actual completion velocity per campaign type
  - Use agent historical patterns (e.g., "Joe averages 35 calls on Mondays, 15 on Fridays")
  - Predict ACTUAL completion date, not just scheduled date

- **Agent Availability Calendar:**
  - Let agents mark days they'll be available
  - System auto-suggests which days to reserve based on availability
  - Prevents over-scheduling on days when few agents are working

- **Real-Time Adjustment:**
  - If Day 3 of a campaign only gets 30% completion, auto-alert admin
  - Suggest: "Redistribute Day 8-10 calls to earlier dates"

```javascript
function predictActualCompletionDate(campaign) {
    const remainingCalls = campaign.totalCalls - campaign.completedCalls;
    
    // Get agent availability for next 14 days
    const agentAvailability = getAgentAvailabilityForecast(14);
    
    // Calculate average daily capacity
    const avgDailyCapacity = agentAvailability.reduce((sum, day) => {
        const agentsAvailable = day.agentCount;
        const avgCallsPerAgent = 30;
        return sum + (agentsAvailable * avgCallsPerAgent);
    }, 0) / agentAvailability.length;
    
    // Estimate days needed
    const daysNeeded = Math.ceil(remainingCalls / avgDailyCapacity);
    
    // Account for weekends (if no weekend calling)
    const businessDaysNeeded = daysNeeded * 1.4;  // Rough adjustment
    
    return addBusinessDays(new Date(), businessDaysNeeded);
}
```

---

### 8. **Edge Cases & System Failures**

#### What if...?

**Agent disconnects mid-call:**
- Solution: Call remains claimed for 30 minutes, then auto-releases
- Agent can re-claim if they return

**Agent reserves 100 calls, then quits:**
- Solution: Admin releases all assignments
- Nightly job also catches abandoned reservations (no activity in 7 days)

**System goes down for 2 hours during prime calling time:**
- Solution: Claims extend by downtime duration automatically
- Reservations don't expire during system outages

**Agent completes call but save fails (network issue):**
- Solution: Store call outcome in browser localStorage
- On reconnect, retry save with deduplication check

**Two agents load the same call simultaneously:**
- Solution: First to claim wins (atomic update with timestamp check)
- Second agent gets error, auto-loads next call

```javascript
// Atomic claim with race condition handling
async function claimCall(callId, userEmail) {
    const callRef = doc(db, 'phone_activities', callId);
    
    try {
        await runTransaction(db, async (transaction) => {
            const callDoc = await transaction.get(callRef);
            
            if (!callDoc.exists()) {
                throw new Error('Call not found');
            }
            
            const data = callDoc.data();
            
            // Check if already claimed by someone else
            if (data.claimedBy && data.claimedBy !== userEmail) {
                const claimAge = Date.now() - new Date(data.claimedAt).getTime();
                const claimExpired = claimAge > (30 * 60 * 1000);  // 30 minutes
                
                if (!claimExpired) {
                    throw new Error(`Call already claimed by ${data.claimedBy}`);
                }
            }
            
            // Claim the call
            transaction.update(callRef, {
                claimedBy: userEmail,
                claimedAt: new Date().toISOString(),
                claimedByName: currentUser.displayName,
            });
        });
        
        return { success: true };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

---

## Best Practices from Call Center Industry

### 1. **Forecast-to-Schedule Model**

**Industry Standard:**
- Week 1: Historical analysis → Predict call volume needed
- Week 2: Generate schedule → Create call forecasts
- Week 3: Agent bidding → Agents reserve shifts/calls
- Week 4: Execution → Agents work scheduled calls
- Week 5: Analysis → Review actual vs forecast

**Your Application:**
- Admin creates campaign with target dates
- System generates daily forecasts
- Agents reserve calls 3-7 days in advance
- Agents work their reservations
- System tracks completion vs forecast

---

### 2. **Adherence Tracking**

**Industry Standard:**
- Track agent's adherence to their schedule
- Agents who consistently hit their commitments get better shifts

**Your Application:**
- Track agent's reservation completion rate
- High-completers get:
  - Higher reservation limits
  - Early access to high-pool campaigns
  - Priority for callback assignments

---

### 3. **Real-Time Dashboards**

**Industry Standard:**
- Supervisors see live metrics: calls waiting, agents available, avg handle time
- Agents see personal metrics: calls completed, time spent, quality score

**Your Application:**
- Admin dashboard:
  - Calls overdue by campaign
  - Agent utilization rates
  - Completion velocity vs forecast
- Agent dashboard:
  - Calls completed today
  - Reservations due this week
  - Pool calls available
  - Achievement pool earnings

---

### 4. **Skill-Based Routing**

**Industry Standard:**
- Route Spanish calls to bilingual agents
- Route technical calls to experienced agents

**Your Application:**
- Track agent performance by campaign type
- Auto-suggest campaigns they excel at
- Restrict complex campaigns to trained agents only

---

### 5. **Queue Prioritization**

**Industry Standard:**
- VIP customers get priority
- Overdue tickets escalate
- SLA compliance drives order

**Your Application:**
- Priority score algorithm (already in design)
- Overdue > Expired Reservations > Today's Reservations > Campaign Completion Rate > Achievement Pool

---

## Recommended Key Performance Indicators (KPIs)

### Agent-Level KPIs:
1. **Reservation Completion Rate** - % of reserved calls actually completed
2. **Pool Call Contribution** - % of their calls from pool (shows flexibility)
3. **Average Calls Per Day** - Productivity metric
4. **Achievement Pool Earnings** - Performance metric
5. **Callback Success Rate** - Quality metric (did callback result in meeting?)

### System-Level KPIs:
1. **Reservation Utilization** - % of calls that get reserved (vs staying in pool)
2. **On-Time Completion Rate** - % of calls made by scheduled date
3. **Pool Accumulation** - How many calls fall through to pool
4. **Campaign Completion Velocity** - Days to complete campaign
5. **Forecast Accuracy** - Predicted completion date vs actual

### Campaign-Level KPIs:
1. **Days to Complete** - Total time from schedule to 100% complete
2. **Reservation Rate** - % of calls that were reserved (vs pool)
3. **Achievement Pool Effectiveness** - Did pool size correlate with completion speed?
4. **Contact Quality** - % of bad numbers, wrong persons, etc.

---

## Red Flags to Monitor

### Agent Behavior:
- ⚠️ Agent reserves >50 calls, completes <20 (hoarding)
- ⚠️ Agent only works high-pool campaigns (cherry picking)
- ⚠️ Agent releases reservations >30% of the time (over-committing)
- ⚠️ Agent's calls have unusually high "no answer" rate (not trying hard enough)

### System Health:
- ⚠️ Pool accumulation >50% of total calls (reservation system not being used)
- ⚠️ Campaign completion velocity slowing over time (fatigue or over-scheduling)
- ⚠️ Multiple campaigns >7 days overdue (capacity problem)
- ⚠️ High-pool campaigns completing 3x faster than low-pool (incentive imbalance)

### Business Risk:
- ⚠️ Client campaign at risk of missing deadline
- ⚠️ Insufficient agent capacity for scheduled calls
- ⚠️ High agent turnover causing abandoned reservations
- ⚠️ Contact quality declining (high bad number rate)

---

## Recommendations Summary

1. **Start Simple:** Implement basic reservation → assignment flow first. Add complexity (dynamic pools, forecasting) later.

2. **Track Everything:** You can't improve what you don't measure. Log all agent actions, completion rates, pool movements.

3. **Agent Incentives Matter:** The achievement pool is powerful. Use it strategically to drive behavior (complete overdue calls, work diverse campaigns).

4. **Admin Control is Critical:** Build robust admin tools BEFORE launching to agents. You'll need to fix issues quickly.

5. **Communication:** Agents need to understand the new system. Create clear documentation and training.

6. **Iterate:** Launch as beta with small group of agents. Get feedback. Refine. Then full rollout.

7. **Fairness:** Ensure system is perceived as fair. High performers should be rewarded, but everyone should have opportunity.

8. **Rollback Plan:** Have a kill switch to revert to old system if needed. Don't burn bridges.

---

## Final Thoughts

The reservation system is essentially **workforce management for gig-style calling agents**. The core challenge is balancing:

- **Agent autonomy** (let them choose when/what to work)
- **Business needs** (all calls must be completed on time)
- **Fairness** (everyone gets opportunity)
- **Quality** (incentivize good work, not just volume)

The three-tier system (Reserved → Pool → Future) gives you flexibility while maintaining control. The key is making the "pool" attractive enough that agents will work it, even without reservations, while still incentivizing planning ahead via reservations.

Your instinct about achievement pools affecting call completion is correct. The solution is dynamic pool adjustment + priority boosting for lagging campaigns. Make it impossible to ignore low-pool campaigns by making them financially attractive if they fall behind.

Good luck with implementation! The design is sound, but the devil is in the details and agent behavior management.

