# 📊 Call Count Diagnostic Guide - Why Only 8 Calls?

**Date**: February 5, 2026  
**Issue**: Scheduled calls shows 182 TODAY, but only 8 available  
**Status**: 🔍 INVESTIGATING

---

## 🔍 Understanding the Discrepancy

### What "Scheduled Calls" Page Shows
- **3694 TOTAL SCHEDULED** - All calls in database with status 'scheduled' or 'pending'
- **670 OVERDUE** - Calls scheduled before today that haven't been completed
- **182 TODAY** - Calls scheduled for today (Feb 5, 2026)
- **809 THIS WEEK** - Calls scheduled for this week

### What Campaign Button Shows
- **8 calls available** - After ALL filters applied

### Why The Difference?

The campaign button count applies **7 different filters** that Scheduled Calls page doesn't:

1. **Sequential Call Filtering** - Only shows oldest call per phone number
2. **Declined Contacts** - Removes contacts who declined
3. **Company Cooldown (12h)** - Removes companies called in last 12 hours
4. **Contact Cooldown (72h)** - Removes contacts called in last 3 days
5. **Future Date Filter** - Removes calls scheduled for future dates
6. **Timezone/Calling Hours** - Removes calls outside 8 AM-5 PM contact time
7. **Assignment Filter** - Removes calls already assigned to others

---

## 📊 Expected Filter Impact

### Example Breakdown (182 TODAY calls)

**Starting**: 182 calls scheduled for today

**↓ Sequential Filtering**: 182 → ~100 calls
- **Logic**: If contact has multiple scheduled calls (follow-ups), only oldest counts
- **Example**: Contact has calls scheduled Jan 21, Jan 26, Feb 5 → Only Jan 21 counts
- **Impact**: ~45% reduction (many contacts have 2-3 follow-ups)

**↓ Declined Contacts**: 100 → ~85 calls
- **Logic**: Remove contacts who explicitly declined
- **Impact**: ~15% reduction

**↓ Company Cooldown (12h)**: 85 → ~40 calls
- **Logic**: Remove if company was called in last 12 hours
- **Impact**: ~50% reduction (active calling campaign)

**↓ Contact Cooldown (72h)**: 40 → ~20 calls
- **Logic**: Remove if contact was called in last 3 days
- **Impact**: ~50% reduction

**↓ Future Date**: 20 → ~20 calls
- **Logic**: Should already be filtered (we're looking at TODAY calls)
- **Impact**: Minimal

**↓ Timezone/Calling Hours**: 20 → **~8-15 calls**
- **Logic**: Remove calls outside calling hours window
- **Impact**: Depends on current time!

**Final Result**: ~8 calls (matches what you're seeing!)

---

## ⏰ TIME OF DAY MATTERS

### Calling Hours Window
- **8 AM - 5 PM** in contact's timezone
- **OR 8 AM - 3 PM Mountain** if no timezone data

### Current Time Impact

**If it's 4:30 PM Mountain**:
- East Coast (ET): 6:30 PM - **CLOSED** (after 5 PM)
- Central (CT): 5:30 PM - **CLOSED** (after 5 PM)
- Mountain (MT): 4:30 PM - **OPEN**
- Pacific (PT): 3:30 PM - **OPEN**

**Result**: Only Mountain and Pacific calls available!

**If it's 9:30 AM Mountain**:
- All timezones open
- Full availability

---

## 🔍 DIAGNOSTIC STEPS

### Step 1: Hard Refresh
- Windows: `Ctrl+Shift+R`
- Mac: `Cmd+Shift+R`

### Step 2: Check Console Logs

Look for the new detailed breakdown:

```
📊 RAW COUNT: 225 pending/scheduled activities in database
   ${campaign.name} - Filter Breakdown:
      📊 Raw database count: 225
      ↓ After sequential filtering: 110 (removed 115 duplicate calls)
      ↓ After declined filter: 95 (removed 15)
      ↓ After company cooldown (12h): 45 (removed 50)
      ↓ After contact cooldown (72h): 22 (removed 23)
      ↓ After future date filter: 22 (removed 0)
      ↓ After timezone filter: 8 (removed 14)
      ✅ FINAL AVAILABLE: 8 calls
```

This tells you **EXACTLY** where calls are being filtered!

### Step 3: Identify the Bottleneck

**If Sequential Filtering removes most**:
- Many contacts have multiple follow-up calls
- This is NORMAL - you only want to call them once

**If Company Cooldown removes most**:
- Team has been very actively calling
- Companies need more time before next call
- **Solution**: Wait a few hours or reduce to 6-hour cooldown

**If Contact Cooldown removes most**:
- Many contacts were recently called
- This is GOOD - prevents annoying contacts
- **Solution**: Wait for cooldown to expire or add new contacts

**If Timezone removes most**:
- It's late in the day (after 3-4 PM)
- Most contacts are on East/Central time (past 5 PM there)
- **Solution**: Call earlier in the day OR adjust calling hours window

---

## 🎯 LIKELY SCENARIO

Based on the 182 TODAY → 8 AVAILABLE reduction:

**Most Likely**: Combination of:
1. **Sequential filtering** (~50% reduction) - 182 → 90
2. **Company cooldown** (~40-50% reduction) - 90 → 45
3. **Contact cooldown** (~30-40% reduction) - 45 → 30
4. **Timezone filtering** (~60-70% reduction if late day) - 30 → 8

**Key Question**: What time is it?
- If it's **before noon**: Timezone shouldn't filter much
- If it's **after 3 PM**: Timezone filters heavily (East/Central closed)

---

## 💡 SOLUTIONS

### Solution 1: Wait for Cooldowns to Expire
- **Company cooldown (12h)**: Calls made this morning available tonight
- **Contact cooldown (72h)**: Calls made Mon available Thurs

### Solution 2: Extend Calling Hours (If Late Day)
Currently: 8 AM - 5 PM contact time

**Option A**: Extend to 6 PM
- Adds 1 extra hour per day
- Might annoy some contacts

**Option B**: Extend to 4 PM Mountain (instead of 3 PM)
- For contacts with no timezone data
- Safer option

### Solution 3: Reduce Company Cooldown Further
- Current: 12 hours
- Try: 8 hours or 6 hours
- Risk: Might annoy receptionists

### Solution 4: Add More Contacts to Campaign
- If all current contacts exhausted
- Schedule more contacts via campaign management

---

## 🧪 IMMEDIATE ACTION

**Check the console logs after hard refresh** to see the detailed filter breakdown. This will tell us exactly which filter is the biggest blocker:

```
// Example output you should see:
   OutcomeMD Oncology Outreach - Filter Breakdown:
      📊 Raw database count: 225
      ↓ After sequential filtering: 110 (removed 115 duplicate calls)
      ↓ After declined filter: 95 (removed 15)
      ↓ After company cooldown (12h): 45 (removed 50)
      ↓ After contact cooldown (72h): 22 (removed 23)
      ↓ After future date filter: 22 (removed 0)
      ↓ After timezone filter: 8 (removed 14)  ← IF THIS IS BIG, it's time of day
      ✅ FINAL AVAILABLE: 8 calls
```

**Send us a screenshot of this breakdown** and we'll know exactly what to adjust!

---

## 📋 Quick Reference

### Filter Order (Why It Matters)
1. Sequential (removes follow-ups) - 40-50% reduction
2. Declined (removes bad contacts) - 10-15% reduction
3. Company cooldown (12h) - 20-50% reduction (depends on activity)
4. Contact cooldown (72h) - 20-30% reduction (depends on activity)
5. Future date (removes not-yet-due) - 0-5% reduction
6. Timezone (removes closed hours) - 0-70% reduction (depends on time!)

**The last two filters (future date and timezone) are TIME-DEPENDENT!**

---

**Next Steps**: 
1. Check console for detailed breakdown
2. Share screenshot with Sam
3. Decide if we need to adjust cooldowns or calling hours

**Status**: 🔍 Diagnostic logging deployed - waiting for data
