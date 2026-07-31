# 📊 Scheduled Calls: Call Number & Cooldown Tracking - January 9, 2026

## 🎯 **The Need**

After today's fixes, Kristin found that Campaign 1 wasn't assigning calls (because they were in cooldown from morning calls by Mak, Alex, Justin). We needed visibility into:
1. **Which call attempt** this is (1st, 2nd, 3rd call)
2. **Cooldown status** (is this contact in 72-hour cooldown?)
3. **When they were last called** (and by whom)

This helps admins understand why certain calls aren't being assigned.

---

## ✨ **New Columns Added**

### **1. "Call #" Column** 📞

Shows which call attempt this is for the contact:
- **1st Call** - Blue badge (initial outreach)
- **2nd Call** - Yellow badge (follow-up)
- **3rd Call** - Red badge (final attempt)
- **4th+ Call** - Gray badge

**Purpose:** Quickly see call attempt history to understand campaign progression.

---

### **2. "Cooldown" Column** 🕐

Shows if contact is in 72-hour cooldown period:
- **🕐 Xh ago** - Red badge: Contact in cooldown (shows hours since last call)
- **✓ Available** - Green badge: Contact available to call (not in cooldown)

**Additional Info:**
- Hover tooltip shows: "Last called Xh ago by [agent]. Yh remaining in cooldown."
- Shows remaining hours in cooldown
- Shows who called them last

**Purpose:** Instantly see why a contact can't be assigned (they're in cooldown).

---

## 🎨 **Visual Design**

### **Call Number Badges:**
```
┌───────────┐
│ 1st Call  │  Blue (new contact)
└───────────┘

┌───────────┐
│ 2nd Call  │  Yellow (follow-up)
└───────────┘

┌───────────┐
│ 3rd Call  │  Red (final attempt)
└───────────┘
```

### **Cooldown Badges:**
```
┌─────────────────┐
│ 🕐 21h ago      │  Red (in cooldown)
│ 51h left        │  Gray subtext
└─────────────────┘

┌─────────────────┐
│ ✓ Available     │  Green (ready to call)
└─────────────────┘
```

---

## 📋 **Updated Table Structure**

| Column | Description | Example |
|--------|-------------|---------|
| Scheduled Date | When to call | Fri, Jan 9, 2026 |
| Company | Company name | Acme Corp |
| Contact | Name + phone | John Smith<br>555-1234 |
| Timezone | Contact timezone | **ET** |
| **Call #** ✨ NEW | Call attempt number | **1st Call** |
| **Cooldown** ✨ NEW | 72h cooldown status | **🕐 21h ago**<br>51h left |
| Campaign | Campaign name | Large PT Groups |
| Assigned To | Agent assigned | **✓ alex** 2h 15m |
| Status | Overdue/Today/Future | **TODAY** |
| Actions | View/Release buttons | View 🔓 Release |

---

## 🔍 **Use Cases**

### **Scenario 1: Understanding Why Campaign 1 Has No Calls**

**Before:**
- Admin: "Why won't Campaign 1 assign calls?"
- Have to dig through console logs
- No visibility into cooldown

**After:**
1. Open [Scheduled Calls page](https://healthluminate.com/crm/scheduled_calls)
2. Filter: Campaign → "Campaign 1: Large PT Direct Outreach"
3. Look at **Cooldown** column
4. See: Most show **"🕐 Xh ago"** (in cooldown!)
5. **Understand:** "Ah, these were all called this morning. That's why they're not assigning!"

---

### **Scenario 2: Finding Available Calls**

**Before:**
- Agent: "Are there any calls I can make?"
- No way to see which are available

**After:**
1. Open Scheduled Calls page
2. Filter: Date → Today
3. Filter: Assigned To → Unassigned Only
4. Look for **"✓ Available"** in Cooldown column
5. Those are ready to be assigned!

---

### **Scenario 3: Understanding Call Progression**

**Before:**
- Manager: "Are we following up enough?"
- No visibility into call attempts

**After:**
1. Open Scheduled Calls page
2. Look at **Call #** column distribution
3. See: Lots of **1st Call** (blue) = Need more follow-ups
4. See: Lots of **3rd Call** (red) = Good persistence!

---

## 💡 **How It Works**

### **Call Number Detection:**
```javascript
const callNumber = call.callNumber || 1;

const callAttemptColors = {
    1: { bg: '#dbeafe', text: '#1e40af', label: '1st Call' },
    2: { bg: '#fef3c7', text: '#92400e', label: '2nd Call' },
    3: { bg: '#fecaca', text: '#991b1b', label: '3rd Call' }
};
```

Pulls from `phone_activities.callNumber` field (set by rescheduler).

---

### **Cooldown Calculation:**
```javascript
const cooldownHours = 72;
const cooldownThreshold = new Date(now.getTime() - (72 * 60 * 60 * 1000));

// Check phoneLastCalledAt (cross-campaign field)
if (call.phoneLastCalledAt) {
    const lastCalledDate = call.phoneLastCalledAt.toDate ? 
        call.phoneLastCalledAt.toDate() : 
        new Date(call.phoneLastCalledAt);
    
    if (lastCalledDate > cooldownThreshold) {
        isInCooldown = true;
        // Calculate hours ago and hours remaining
    }
}
```

Checks multiple date fields:
- `phoneLastCalledAt` (most reliable, set cross-campaign)
- `lastCallDate` (fallback)
- `completedAt` (fallback)

---

## 🎯 **Benefits**

### **For Admins:**
- ✅ **Instant visibility** into why calls aren't assigning
- ✅ **Quick diagnosis** of cooldown issues
- ✅ **Understanding** of call attempt distribution
- ✅ **Better planning** for agent workload

### **For Managers:**
- ✅ **Track call attempts** across campaigns
- ✅ **Monitor follow-up** effectiveness
- ✅ **Identify** contacts stuck in cooldown
- ✅ **Optimize** campaign schedules

### **For Agents:**
- ✅ **See** which calls are available
- ✅ **Understand** why some calls aren't loading
- ✅ **Know** call history at a glance

---

## 📊 **Real-World Example (From Today)**

### **Campaign 1 - This Morning:**
- 11:00 AM: Mak calls 16 contacts ✅
- 11:15 AM: Alex calls 16 contacts ✅
- 11:30 AM: Justin calls 14 contacts ✅
- **Total: 46 contacts called**

### **Campaign 1 - Later (11:21 AM):**
- Kristin tries to get calls from Campaign 1
- **Result:** 0 calls assigned ❌

### **Why? (Now Visible on Scheduled Calls):**
```
┌─────────────┬──────────────────┬──────────────┐
│ Contact     │ Call #           │ Cooldown     │
├─────────────┼──────────────────┼──────────────┤
│ John Smith  │ 1st Call (blue)  │ 🕐 1h ago    │
│             │                  │ 71h left     │
├─────────────┼──────────────────┼──────────────┤
│ Jane Doe    │ 2nd Call (yellow)│ 🕐 2h ago    │
│             │                  │ 70h left     │
├─────────────┼──────────────────┼──────────────┤
│ Bob Johnson │ 1st Call (blue)  │ 🕐 1h ago    │
│             │                  │ 71h left     │
└─────────────┴──────────────────┴──────────────┘
```

**Diagnosis:** All contacts in 72-hour cooldown!  
**Solution:** Use OutcomeMD campaign instead ✅

---

## 🔄 **Auto-Refresh Integration**

The Scheduled Calls page **auto-refreshes every 30 seconds**, so:
- Cooldown status updates automatically
- "Xh ago" counts increment in real-time
- "Available" status appears when cooldown expires
- No manual refresh needed!

---

## 📝 **Files Modified**

**`crm/scheduled_calls.html`:**

1. **Added "Call #" and "Cooldown" columns** to table header (line 1311-1312)
2. **Added call number extraction and formatting** (lines 1393-1408)
3. **Added cooldown detection logic** (lines 1410-1468)
4. **Added call number and cooldown cells to table rows** (lines 1530-1531)
5. **Added CSS styling** for new badges (lines 377-425):
   - `.call-number-cell`
   - `.call-number-badge`
   - `.cooldown-cell`
   - `.cooldown-badge`
   - `.cooldown-active` (red for in-cooldown)
   - `.cooldown-available` (green for available)
   - `.cooldown-remaining` (gray subtext)

---

## 🎉 **Result**

The [Scheduled Calls page](https://healthluminate.com/crm/scheduled_calls) now provides **complete visibility** into:
- ✅ Call attempt history (1st, 2nd, 3rd calls)
- ✅ Cooldown status (in cooldown vs available)
- ✅ Time since last call
- ✅ Time remaining in cooldown
- ✅ Who called them last

**No more guessing why calls aren't assigning!** 🎯

---

**Created:** January 9, 2026  
**By:** AI Assistant  
**Status:** ✅ LIVE - Auto-Refreshing Every 30s  
**Page:** https://healthluminate.com/crm/scheduled_calls

