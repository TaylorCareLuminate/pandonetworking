# HeyReach Auto-Resume - Quick Start Guide

## 🎯 What It Does

Automatically resumes paused/completed **Connect** and **Message** campaigns every night at 2:00 AM.

---

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd C:\repos\HealthLuminateSiteFromLocal\jobs
npm install
```

### 2. Add Firebase Credentials
- Download `serviceAccountKey.json` from Firebase Console
- Place in `C:\repos\HealthLuminateSiteFromLocal\jobs\`

### 3. Configure Customers
- Open: `admin/email_controls.html`
- For each customer:
  - ✅ Check "Enable HeyReach"
  - 🔑 Add HeyReach API Key
  - 💾 Save

### 4. Test the System
```bash
cd jobs
node heyreach-auto-resume.js
```

Look for: `✅ Auto-resume job completed successfully!`

### 5. Schedule It
```batch
cd jobs
schedule-heyreach-auto-resume.bat
```

Click "Yes" when prompted for Administrator access.

✅ Done! Campaigns will auto-resume nightly at 2 AM.

---

## 📱 Web Interface

**URL**: `crm/heyreach_campaigns.html`

### Features:
- 👀 View all campaigns by customer
- ▶️ Manually resume campaigns
- 🧪 Test auto-resume process
- 📊 See campaign statistics
- 🎯 Filter by priority campaigns

---

## 🎯 Campaign Detection

Campaigns are automatically detected by name:

| Type | Name Contains | Priority |
|------|--------------|----------|
| **Connect** | "connect", "connection" | ✅ Yes |
| **Message** | "message", "msg" | ✅ Yes |
| **Like** | "like", "engage" | ❌ No |
| **Other** | anything else | ❌ No |

**Priority campaigns** = automatically resumed if paused/completed

---

## 📊 Check Logs

### Firebase Console:
1. Go to Firestore
2. Open `system_logs` collection
3. Filter by type: `heyreach_auto_resume`

### Task Scheduler:
1. Open Task Scheduler (`taskschd.msc`)
2. Find "HeyReach Auto-Resume"
3. Click "History" tab

---

## 🔧 Common Commands

```bash
# Run manually
node heyreach-auto-resume.js

# Run with npm
npm run heyreach-resume

# Test specific customer (edit script first)
node heyreach-auto-resume.js
```

---

## ❓ Troubleshooting

### No Campaigns Resumed?

1. **Check campaign names** - Must contain "connect" or "message"
2. **Check status** - Must be paused (2) or completed (3)
3. **Check customer config** - HeyReach must be enabled with API key

### Task Not Running?

1. Open Task Scheduler
2. Right-click "HeyReach Auto-Resume" → Run
3. Check History tab for errors
4. Verify Node.js path in task settings

### API Errors?

1. Verify API key in `admin/email_controls.html`
2. Test manually: `node heyreach-auto-resume.js`
3. Check Railway proxy is running

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `crm/heyreach_campaigns.html` | Web interface |
| `jobs/heyreach-auto-resume.js` | Main job script |
| `jobs/serviceAccountKey.json` | Firebase credentials |
| `admin/email_controls.html` | Customer config |

---

## 📚 Full Documentation

- **Setup**: `jobs/HEYREACH_AUTO_RESUME_SETUP.md`
- **Implementation**: `HEYREACH_AUTO_RESUME_IMPLEMENTATION.md`
- **Jobs README**: `jobs/README.md`

---

## ⏰ Schedule

**Default**: Daily at 2:00 AM

**Change Time**:
1. Open Task Scheduler
2. Right-click task → Properties
3. Triggers → Edit → Change time

---

## 🎉 Success Checklist

- [x] Dependencies installed
- [x] Firebase credentials added
- [x] Customer HeyReach configured
- [x] Manual test successful
- [x] Task scheduled
- [x] First auto-run completed
- [x] Logs verified in Firebase

---

## 🆘 Need Help?

1. Read full docs: `jobs/HEYREACH_AUTO_RESUME_SETUP.md`
2. Check Firebase logs
3. Test manually with verbose output
4. Verify Task Scheduler configuration

---

**Version**: 1.0.0  
**Last Updated**: November 25, 2024











