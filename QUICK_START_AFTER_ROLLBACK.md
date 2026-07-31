# 🚀 Quick Start - Phone Calls After Rollback

**For**: Taylor, Joe, and covering developer  
**Date**: January 19, 2026  
**Status**: ✅ PRODUCTION ROLLBACK DEPLOYED

---

## ✅ What Changed

The phone calling page (`team/phone-calls.html`) has been **rolled back to the Dec 31, 2025 version** with critical bug fixes. This is the **simple, stable system** that worked before.

---

## 📱 How to Use (For Taylor & Joe)

### 1. **Open the calling page**
- Go to: `team/phone-calls.html`
- You should see at the top: **"Smart Call Queue Active"**

### 2. **Pick a campaign**
- Click any campaign button that shows available calls
- **Note**: "Start 4A" and "Start 1B" are hidden (all contacts declined)

### 3. **Start calling**
- Page loads 15 calls automatically
- Just start dialing!
- System assigns more as you complete calls

### 4. **No reservations needed**
- Unlike the "new system," you DON'T need to reserve calls
- Just pick a campaign and start

---

## 🛡️ Protection Features Active

### ✅ Bad Numbers Blocked
- If you mark a number as "Bad/Invalid" or "Wrong Person"
- That phone number won't show up again
- But alternate numbers for that contact can still appear

### ✅ Declined Contacts Blocked
- If you mark someone as "Declined" or "Not Interested"
- They won't appear in any campaign again

### ✅ Company Cooldown (30 hours)
- After calling someone at a company
- No one else at that company will show up for 30 hours
- Prevents annoying receptionists

### ✅ Phone Formatting
- All phone numbers display as: **(609) 760-6054**
- Easy to read and dial

---

## 🚫 Blocked Campaigns

These campaigns are **hidden** because all contacts are declined:
- **Start 4A** - Linkedin Visionary Practice Leaders
- **Start 1B** - High Google Ratings Physician Leaders

If you see them, hard refresh: `Ctrl+Shift+R`

---

## 🐛 Troubleshooting

### Problem: Campaigns not loading
**Solution**: Hard refresh the page (`Ctrl+Shift+R` on Windows, `Cmd+Shift+R` on Mac)

### Problem: Seeing weird text characters
**Solution**: Hard refresh the page - browser cached old version

### Problem: Phone numbers not formatted
**Solution**: Hard refresh the page

### Problem: Seeing "Start 4A" or "Start 1B"
**Solution**: Hard refresh - these should be hidden

### Problem: Page errors or won't load
**Solution**: 
1. Check browser console (F12)
2. Look for red errors
3. Contact covering developer with screenshot

---

## 🔧 For Covering Developer

### File Locations
```
team/
  └── phone-calls.html                          ← PRODUCTION (rollback)
  └── phone-calls-BACKUP-PRE-ROLLBACK-*.html   ← Backup (new system)

sandbox/
  ├── phone-calls.html                          ← New system (for future)
  ├── phone-calls-rollback.html                 ← Same as production
  ├── ROLLBACK_FIXES_APPLIED.md                 ← Technical docs
  └── ROLLBACK_FINAL_SUMMARY.md                 ← Summary
```

### Key Technical Details

**Version**: `v2.9.26-assignment-expiry-fix-ROLLBACK-SANDBOX`

**Blocked Campaigns** (in code):
```javascript
const BLOCKED_CAMPAIGN_IDS = [
    'campaign_1758727047628', // Start 4A
    'campaign_1757543656299'  // Start 1B
];
```

**Filtering Module**: Uses `js/call-filtering.js` for centralized filtering

**Phone Formatting**: `formatPhoneNumber()` function at line ~2475

**Console Logs to Check**:
- `🚫 HARD FILTERS: Start 4A + Start 1B are BLOCKED`
- `✅ Blocked contact summary: X contacts blocked...`
- `📄 Phone Calls Page Version: v2.9.26...`

### Common Dev Tasks

**To restore new system** (if needed):
```powershell
Copy-Item team\phone-calls-BACKUP-PRE-ROLLBACK-*.html team\phone-calls.html -Force
```

**To test changes**:
- Edit `sandbox/phone-calls-rollback.html`
- Test thoroughly
- Then copy to production when ready

**To add campaign blocks**:
- Search for `BLOCKED_CAMPAIGN_IDS`
- Add campaign ID to array
- Campaign will be filtered out automatically

---

## ✅ Success Checklist

- [ ] Page loads without errors
- [ ] Phone numbers formatted: (XXX) XXX-XXXX
- [ ] Campaigns load (except 4A & 1B)
- [ ] Can make calls
- [ ] Declined contacts don't reappear
- [ ] Bad numbers don't reappear
- [ ] Console shows version: `v2.9.26-assignment-expiry-fix-ROLLBACK-SANDBOX`

---

**System Status**: 🟢 STABLE  
**Ready for**: ✅ Production use during vacation
