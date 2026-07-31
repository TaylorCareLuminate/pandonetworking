# 🎯 Campaign Auto-Selection Priority Logic

**Last Updated:** January 8, 2026  
**Feature:** "Start Calling" button auto-campaign selection

---

## 📋 Overview

When an agent clicks **"Start Calling"** without manually selecting a campaign, the system automatically chooses the most important campaign based on a 3-tier priority system.

---

## 🏆 Priority Tiers (in order)

### **1️⃣ HIGHEST PRIORITY: Oldest Overdue Call**
- Campaign with the **oldest scheduled call** wins
- Example: Campaign A has call from Jan 5, Campaign B from Jan 7 → **Campaign A wins**
- **Goal:** Handle the most overdue/urgent work first

### **2️⃣ MEDIUM PRIORITY: Earliest Call Attempt**
- If urgency is tied, prioritize campaigns with **earlier call numbers**
- **Call #1 > Call #2 > Call #3**
- Example: Both campaigns have calls from today, but Campaign A has 1st attempts, Campaign B has 3rd attempts → **Campaign A wins**
- **Goal:** Reach NEW prospects before spending time on follow-ups

### **3️⃣ LOWEST PRIORITY: Most Available Calls**
- If both urgency AND call number are tied, choose campaign with **more calls**
- Example: Both have 1st-attempt calls from today, Campaign A has 10 calls, Campaign B has 5 calls → **Campaign A wins**
- **Goal:** Maximize agent productivity by giving them larger blocks

---

## 🔧 Technical Implementation

### Code Location
`team/phone-calls.html` - `startCallingAuto()` function (lines ~3113-3126)

### Sorting Logic
```javascript
candidates.sort((a, b) => {
    // 1. PRIORITY: Oldest overdue calls (most urgent)
    if (a.oldestDueAtMs !== b.oldestDueAtMs) {
        return a.oldestDueAtMs - b.oldestDueAtMs;
    }
    
    // 2. PRIORITY: Earlier call attempts (1st call > 2nd call > 3rd call)
    // Reach fresh prospects before follow-ups
    if (a.lowestCallNumber !== b.lowestCallNumber) {
        return a.lowestCallNumber - b.lowestCallNumber;
    }
    
    // 3. PRIORITY: Most available calls (tie-breaker)
    return b.availableCalls - a.availableCalls;
});
```

### Data Tracking
When counting available calls per campaign (lines ~5160-5400):
- **`oldestDueAtMs`**: Tracks the timestamp of the oldest due call
- **`lowestCallNumber`**: Tracks the lowest `callNumber` field (1, 2, or 3) among available calls
- **`availableCalls`**: Total count of assignable calls (after all filters)

---

## 📊 Example Scenarios

### Scenario 1: Clear Winner by Urgency
```
Campaign A: 5 calls (oldest: Jan 5, call #2)
Campaign B: 10 calls (oldest: Jan 7, call #1)
WINNER: Campaign A (older due date)
```

### Scenario 2: Tied Urgency, Call Number Decides
```
Campaign A: 5 calls (oldest: Jan 8, call #1) ← First attempts
Campaign B: 10 calls (oldest: Jan 8, call #3) ← Third attempts
WINNER: Campaign A (earlier call number)
```

### Scenario 3: Tied Urgency & Call Number, Volume Decides
```
Campaign A: 10 calls (oldest: Jan 8, call #1)
Campaign B: 5 calls (oldest: Jan 8, call #1)
WINNER: Campaign A (more calls)
```

### Scenario 4: Complete Tie
```
Campaign A: 5 calls (oldest: Jan 8, call #1)
Campaign B: 5 calls (oldest: Jan 8, call #1)
WINNER: Campaign A (first in list)
```

---

## 🎮 Agent Experience

### Auto-Mode (Recommended)
1. Agent clicks **"Start Calling"**
2. System analyzes all campaigns
3. Picks most important based on priority logic
4. Assigns block of calls from that campaign
5. Agent starts calling

**Console Output:**
```
🎯 Trying campaign: campaign_ABC123 (10 available, oldest: 1/5/2026, call #1)
✅ Successfully assigned 10 calls from campaign: campaign_ABC123
```

### Manual Mode (Campaign-Specific)
1. Agent selects specific campaign from dropdown
2. Clicks that campaign's "Start Calling" button
3. System assigns calls ONLY from that campaign
4. Overrides priority logic

---

## 💡 Why This Matters

### **Business Benefits:**
- ✅ **Maximizes Conversion:** Fresh prospects (1st calls) get priority over stale follow-ups
- ✅ **Handles Urgency:** Overdue calls don't pile up indefinitely
- ✅ **Efficient Agent Time:** Larger blocks mean less switching between campaigns

### **Agent Benefits:**
- ✅ **No Decision Fatigue:** System picks the most important work automatically
- ✅ **Consistent Messaging:** Full blocks from one campaign = no pitch confusion
- ✅ **Clear Progress:** Complete one campaign block before moving to next

---

## 🔍 Monitoring & Debugging

### Check Current Priority Order
Open browser console and inspect:
```javascript
window.__autoCampaignCandidates
```

### Sample Output:
```javascript
[
  {
    id: "campaign_ABC123",
    oldestDueAtMs: 1704499200000,  // Jan 5, 2026
    lowestCallNumber: 1,            // First attempts
    availableCalls: 10
  },
  {
    id: "campaign_XYZ789",
    oldestDueAtMs: 1704585600000,  // Jan 6, 2026
    lowestCallNumber: 2,            // Second attempts
    availableCalls: 5
  }
]
```

---

## 📝 Related Documentation

- **Block Assignment Logic:** `team/ASSIGNMENT_BUG_FIX_JAN_8_2026.md`
- **Call Filtering:** `team/phone-calls.html` (lines ~5200-5400)
- **Reservation System:** `team/reserve-calls.html`

---

## ✅ Summary

The system now **intelligently prioritizes campaigns** to:
1. Clear the oldest backlog first
2. Reach fresh prospects before follow-ups
3. Maximize agent productivity with larger blocks

This ensures agents work on the **most valuable calls** automatically! 🎯

