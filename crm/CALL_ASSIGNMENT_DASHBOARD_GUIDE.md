# Call Assignment Monitor - Admin Dashboard Guide

## Overview

**Location**: `https://healthluminate.com/crm/call-assignments.html`

**Purpose**: Real-time monitoring and management of the call assignment system across all campaigns and team members.

**Access**: CRM admins only (not visible to team members)

---

## Dashboard Features

### 1. **Statistics Overview** (Top Cards)

Six real-time metrics displayed:

- **Active Agents**: Agents with non-expired assignments (active within 15 min)
- **Total Assigned**: Total number of calls currently assigned to agents
- **Idle Agents**: Agents with expired assignments (15+ min idle)
- **Over-Reserved**: Campaigns with more reservations than available calls
- **Campaigns**: Number of campaigns with activity
- **Available Calls**: Total unassigned calls across all campaigns

---

### 2. **Admin Controls**

Three powerful management tools:

#### **Release Expired Assignments**
- Finds all assignments with expired 15-minute timers
- Releases them back to the unassigned pool
- **Use when**: Idle agents need their calls freed up
- **Effect**: Instant - calls become available for reassignment

#### **Force Rebalance All Campaigns**
- ⚠️ **Nuclear option** - releases ALL assignments system-wide
- Clears every agent's queue
- **Use when**: Major issues or end-of-day reset at 2 PM
- **Effect**: Agents must reload to get new assignments based on current reservations

#### **Refresh Data**
- Reloads all data from Firestore
- Updates dashboard display
- **Use when**: Need latest information
- **Effect**: Dashboard updates only

---

### 3. **Agent Assignments**

Detailed view of every agent with active assignments:

**Information Shown:**
- Agent name
- Active/Idle status
- Number of calls assigned
- Number of calls reserved
- Campaigns they're working on
- Time idle (if applicable)

**Per-Agent Actions:**
- **Release This Agent's Calls** button (for idle agents)
- Immediately frees up their assigned calls

**Filters Available:**
- Campaign (filter by specific campaign)
- Status (Active/Idle)
- Sort by (Most Assigned, Name, Idle Time)

**Visual Cues:**
- 🟢 **Green status badge**: Active (within 15 min)
- 🟡 **Yellow card background**: Idle (15+ min)
- Campaign chips show which campaigns agent is working

---

### 4. **Campaign Balance Status**

Shows health of call distribution per campaign:

**Color Coding:**
- 🔴 **Red background**: Over-reserved (more reservations than calls exist)
- 🟢 **Green background**: Under-reserved (calls available to reserve)
- ⚪ **White background**: Balanced (reservations match calls)

**Information Per Campaign:**
- Total Calls: Total available in system
- Assigned: How many currently assigned to agents
- Available: How many unassigned (can be assigned)
- Reserved: Total reservations from all agents
- Status: "Over by X", "X available", or "Balanced"

---

## How to Use This Dashboard

### **Daily Monitoring Workflow**

**Start of Day:**
1. Check if any idle agents from yesterday
2. Release expired assignments
3. Monitor "Over-Reserved" count

**During the Day:**
1. Dashboard auto-refreshes every 30 seconds
2. Watch for idle agents (yellow cards)
3. Monitor campaign balance for issues

**2 PM Mountain Time:**
1. Run "Force Rebalance All Campaigns"
2. This is the daily reset point
3. All assignments cleared and redistributed

**Troubleshooting:**
- **Agent stuck/inactive**: Use "Release This Agent's Calls"
- **Campaign unbalanced**: Check if over/under reserved
- **Calls not appearing**: Check if agents have reservations
- **System issues**: Use "Force Rebalance" to reset

---

## Understanding the Metrics

### **Active vs Idle**

- **Active**: Agent's last assignment was within 15 minutes
- **Idle**: Agent's last assignment was 15+ minutes ago

**What this means:**
- Active = agent is currently calling or recently called
- Idle = agent stopped calling or lost connection

### **Assigned vs Reserved**

- **Assigned**: Calls currently in agent's rolling window (max 10)
- **Reserved**: Agent's total commitment for the day

**Example:**
```
Agent has 40 calls reserved
Currently has 10 calls assigned
Completes 3 calls
System auto-assigns 3 more (back to 10)
Still has 37 remaining in reservation
```

### **Campaign Over-Reserved**

**Scenario:**
- Campaign has 100 calls total
- 3 agents reserved 40 calls each (120 total)
- System is over-reserved by 20

**What happens:**
- System will only assign the 100 available calls
- Last 20 reservations can't be fulfilled
- Shows as "Over by 20" in dashboard

**Action:**
- Normal operation - not necessarily a problem
- Agents will complete what's available
- Consider rebalancing if severe

---

## Alert Types

### **Warning: Idle Agents**
```
⚠️ 3 idle agents with expired assignments (15+ minutes).
Consider releasing their calls.
```

**Meaning**: Agents stopped calling but still have calls assigned
**Action**: Click "Release Expired Assignments" button

### **Warning: Over-Reserved Campaigns**
```
⚠️ 2 campaigns over-reserved. More calls reserved than available.
```

**Meaning**: More commitments than available work
**Action**: Monitor - may need to rebalance or adjust reservations

---

## Technical Details

### **Data Sources**

1. **`phone_activities`** collection:
   - Fields: `assignedTo`, `assignedAt`, `assignmentExpiry`
   - Filtered by: `status` in ['pending', 'scheduled']
   - Used for: Current assignment counts

2. **`callReservations`** collection:
   - Fields: `userEmail`, `campaignId`, `reservedCalls`
   - Filtered by: `status` == 'active', `date` <= today
   - Used for: Reservation totals

3. **`teamMembers`** collection:
   - Used for: Agent names

4. **`campaigns`** collection:
   - Filtered by: `status` == 'active'
   - Used for: Campaign names

### **Update Frequency**

- **Auto-refresh**: Every 30 seconds
- **Manual refresh**: Click "Refresh Data" button
- **Real-time**: Actions (release, rebalance) take effect immediately

### **Performance**

- Loads all data in parallel (fast)
- Processes client-side (no backend lag)
- Handles hundreds of agents/campaigns efficiently

---

## Common Scenarios

### **Scenario 1: Agent Leaves for Lunch**

**Problem**: Agent has 10 calls assigned but stopped calling

**Timeline:**
- 0 min: Agent stops calling
- 15 min: Assignment expires (assignmentExpiry timestamp passes)
- Next refresh: Dashboard shows agent as "Idle"
- Admin action: Click "Release This Agent's Calls"
- Result: 10 calls freed for other agents

### **Scenario 2: Campaign Running Out of Calls**

**Problem**: Campaign has 50 calls, but 100 reserved

**Dashboard shows:**
- "Over by 50" in Campaign Balance
- Some agents may not get full window

**Resolution:**
- Normal operation - first-come-first-served
- Agents who load first get calls
- Others complete when new calls available

### **Scenario 3: End of Day Cleanup**

**Problem**: Need fresh start for tomorrow

**Action:**
1. At 2 PM, click "Force Rebalance All Campaigns"
2. All assignments cleared
3. When agents return/reload, they get new assignments
4. Based on current reservations

---

## Integration with Other Pages

### **Links from Dashboard:**

- **Reservation Page**: Button to view `../team/reserve-calls.html`
  - Where agents make reservations
  
- **Team Performance**: Button to `team-performance.html`
  - View earnings and completion rates
  
- **Back to CRM**: Button to `index.html`
  - Main CRM dashboard

### **Related Systems:**

1. **Reserve Calls Page** (`team/reserve-calls.html`):
   - Creates reservations
   - Triggers initial assignments
   
2. **Phone Calls Page** (`team/phone-calls.html`):
   - Displays assigned calls to agents
   - Auto-requests new assignments when needed
   
3. **Team Performance** (`crm/team-performance.html`):
   - Shows reservation completion rates
   - Still works with new system (verified)

---

## Troubleshooting

### **Dashboard Not Loading**

**Check:**
1. User is logged in as admin
2. Browser console for errors
3. Firestore permissions

**Fix:**
- Hard refresh (Ctrl+Shift+R)
- Clear cache
- Check auth.js is loading

### **Data Seems Wrong**

**Check:**
1. Time since last refresh (auto every 30s)
2. Timezone settings (should be Mountain Time)

**Fix:**
- Click "Refresh Data"
- Check system time
- Verify assignments in Firestore directly

### **Release Not Working**

**Check:**
1. Browser console for errors
2. Firestore write permissions

**Fix:**
- Try manual Firestore update
- Check batch write limits (500 docs max)
- If >500 assignments, need to chunk

---

## Future Enhancements (Not Yet Implemented)

### **Background Jobs** (TODO):
- Auto-release expired assignments every 15 min
- Scheduled 2 PM daily rebalance
- Cleanup abandoned reservations

### **Enhanced Features** (Ideas):
- Assignment history log
- Agent activity timeline
- Campaign health scores
- Predictive analytics
- Email alerts for admin

---

## Summary

This dashboard gives you **complete visibility** and **full control** over the call assignment system:

✅ **Monitor** - See who has what in real-time  
✅ **Manage** - Release stuck assignments  
✅ **Balance** - Identify over/under-reserved campaigns  
✅ **Control** - Force rebalance when needed  

**Remember**: This is an admin-only tool. Team members cannot access it - they only see their assigned calls on the phone-calls page.

---

**Dashboard URL**: https://healthluminate.com/crm/call-assignments.html

**Access**: CRM folder (admin only)

**Support**: Contact development team for issues or enhancement requests

