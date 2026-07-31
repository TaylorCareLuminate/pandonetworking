# Prospect Cleanup Tool - Quick Start Guide

## What It Does
🧹 Uses AI to scan a specific BDR's **prospect contact** database and identify contacts that don't fit your business criteria for quick deletion.

🛡️ **Protected**: Established connections (Relationship Building Focus/Light) are automatically excluded and cannot be deleted.

## Access
- **URL**: https://healthluminate.com/connect/prospect_cleanup.html
- **Required**: Admin account (healthluminate.com or careluminate.com)

## 4-Step Process

### Step 1: Select BDR 👤
```
1. Choose a BDR from the dropdown
2. Click "Load Contacts for Selected BDR"
3. Wait for contacts to load
4. See count of prospect contacts (connections excluded)
5. See count of protected connections (if any)
```

### Step 2: Define Your Criteria ✍️

**Contacts to KEEP** - Who should stay in your database?
```
Example: Keep contacts who work at healthcare companies, 
hospital systems, medical device manufacturers, health tech 
companies, or pharmaceutical companies. Keep anyone with 
Director-level titles or above.
```

**Contacts to REMOVE** - Who should be deleted?
```
Example: Remove contacts who work at non-healthcare companies, 
consulting firms, marketing agencies, or educational institutions. 
Remove anyone with junior titles like coordinator, assistant, 
or intern.
```

### Step 3: Run AI Scan 🤖
1. Click **"Scan Loaded Contacts"**
2. Confirm the scan
3. Watch real-time progress:
   - Scanned: 125 / 500
   - Flagged for Deletion: 78
   - Progress: 25%

### Step 4: Review & Delete 🗑️
1. Review the flagged contacts table
2. Read AI reasoning for each contact
3. **Uncheck** any contacts you want to keep (they turn green)
4. Click **"Delete Selected"**
5. Type **"DELETE"** to confirm
6. Contacts are permanently removed

## Quick Examples

### Remove Non-Healthcare Contacts
```
KEEP: Healthcare, medical, health tech companies
REMOVE: Marketing agencies, consulting, non-healthcare industries
```

### Remove Junior Staff
```
KEEP: VP, Director, Manager, C-level executives
REMOVE: Coordinator, Assistant, Intern, Junior titles
```

### Geographic Cleanup
```
KEEP: United States, Canada
REMOVE: All other countries
```

### Company Size Filter
```
KEEP: Companies with 100+ employees
REMOVE: Solo practitioners, micro businesses under 10 employees
```

## Safety Features ⚠️
- ✅ Admin-only access
- ✅ BDR-specific (only selected BDR's prospects)
- ✅ **Automatic connection protection** - Relationship Focus/Light excluded
- ✅ Must type "DELETE" to confirm
- ✅ Can uncheck contacts to keep them
- ✅ AI defaults to "keep" when uncertain
- ⚠️ **Deletions are PERMANENT** - cannot be undone

## Cost 💰
- Very affordable: ~$0.50 per 5,000 contacts
- Uses GPT-4o-mini (cheapest OpenAI model)
- Batched processing for efficiency

## Tips 💡
1. **Be specific** with your criteria
2. **Review AI reasoning** before deleting
3. **Start small** if uncertain
4. **Uncheck liberally** - better safe than sorry
5. **Document your criteria** for future reference

## What Gets Deleted?
- ✅ **Prospect** contact records in `heyreach_contacts`
- ❌ **NOT deleted**: Established connections (Relationship Focus/Light)
- ❌ **NOT deleted**: Conversation history, campaigns, company research

## Troubleshooting 🔧

**"Access Denied"**
→ Need admin account (healthluminate.com or careluminate.com)

**"No contacts found"**
→ Check if `heyreach_contacts` has data in Firestore

**"Failed to scan"**
→ Check Railway backend is running, verify OpenAI API key

**Unexpected results**
→ Make criteria more specific, review contact data quality

## Need Help?
Check the full documentation: `PROSPECT_CLEANUP_README.md`

---

**⚠️ REMEMBER: Deletions are permanent. Always review before confirming!**

