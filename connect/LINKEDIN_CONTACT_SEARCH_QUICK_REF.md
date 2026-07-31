# LinkedIn Contact Search - Quick Reference

## 🚀 Quick Start (5 Minutes)

### 1. Open the Page
Navigate to: `connect/linkedin_contact_search.html`

### 2. Enter Companies (1 per line, max 5 for testing)
```
Mayo Clinic
Cleveland Clinic
Johns Hopkins Hospital
```

### 3. Set Search Criteria
- **Departments**: Information Technology
- **Seniority**: C-Level, VP, Director
- **Max per Company**: 25

### 4. Optional: Add Filter Prompt
```
Only include CIOs, CTOs, and IT VPs.
Exclude consultants and vendors.
```

### 5. Click Through Steps
1. "Find Company LinkedIn URLs" → Wait for completion
2. "Search for Contacts" → Wait for completion
3. "Filter & Save Contacts" → Done!

### 6. Verify
- Check prospects table in Firebase
- Review system logs for any errors

---

## 📊 What Happens Behind the Scenes

| Step | What It Does | Time | Cost |
|------|-------------|------|------|
| 1 | Gemini finds company LinkedIn pages | 30s | Free (cached after 1st) |
| 2 | Bebity validates URLs | 1-2 min | ~$0.25 (5 companies) |
| 3 | Harvest scrapes employees | 3-5 min | ~$0.10 (25 per company) |
| 4 | GPT filters contacts | 10-30s | ~$0.01 |
| 5 | Saves to prospects | 5s | Free |
| **Total** | **End-to-End Process** | **5-8 min** | **~$0.36** |

---

## 🔑 Key Concepts

### Firebase Caching = Cost Savings
- **Company URLs**: Search once, use forever
- **Employee Data**: Valid for 12 months
- **Second search**: Instant & FREE!

### Batch Processing
- **Gemini**: Up to 1400 companies at once
- **GPT**: Up to 1400 contacts at once
- **Harvest**: 5 companies at a time (safety)

### Seniority Levels (Harvest API IDs)
```
310 = C-Level (CIO, CTO, CISO, etc.)
300 = VP (Vice President)
220 = Director
120 = Manager
```

---

## 💡 Pro Tips

### Get Better Results
1. **Be Specific**: "Information Technology" > "IT"
2. **Use Multiple Levels**: Select 2-3 seniority levels
3. **Smart Filtering**: GPT understands natural language
4. **Check Logs**: Real-time feedback on what's happening

### Save Money
1. **Use Cache**: Same companies = zero cost
2. **Filter Smart**: Use GPT filter to reduce noise
3. **Right-Size**: Don't request more than you need
4. **Test First**: Always test with 5 companies first

### Avoid Issues
1. **Exact Names**: "Mayo Clinic" not "Mayo"
2. **Valid Companies**: Must have LinkedIn presence
3. **Reasonable Limits**: 25-50 per company max
4. **Check Quota**: Gemini = 1400/day limit

---

## 🎯 Common Use Cases

### Find Healthcare CIOs
```
Departments: Information Technology
Seniority: C-Level (310)
Max: 10
Filter: "Only Chief Information Officers"
```

### IT Security Leaders
```
Departments: Information Technology
Seniority: C-Level (310), VP (300), Director (220)
Max: 25
Filter: "Only cybersecurity, information security, or CISO roles"
```

### All IT Leadership
```
Departments: Information Technology
Seniority: C-Level (310), VP (300), Director (220), Manager (120)
Max: 50
Filter: None (get all)
```

---

## 🐛 Quick Fixes

### "No Companies Found"
- ✅ Check spelling
- ✅ Use official company names
- ✅ Try adding location/domain

### "No Contacts Found"
- ✅ Verify LinkedIn URL is correct
- ✅ Try broader seniority levels
- ✅ Check department name
- ✅ Increase max_employees

### "Timeout Error"
- ✅ Reduce number of companies (try 3)
- ✅ Reduce max_employees (try 15)
- ✅ Try again in a few minutes

### "Quota Exceeded"
- ⏰ Wait 24 hours
- 🔄 Gemini key rotation automatic
- 📧 Contact admin if persistent

---

## 📋 Checklist Before Running

- [ ] Logged into Firebase
- [ ] Company names are correct
- [ ] Department/seniority selected
- [ ] Max employees is reasonable (25-50)
- [ ] Filter prompt is clear (if using)
- [ ] Ready to wait 5-8 minutes

---

## 🔍 Understanding the Logs

### Good Signs ✅
```
✅ Found 5 in cache
✅ Gemini found 3 companies
✅ Validated 5 companies
✅ Harvest returned 127 profiles
✅ Filtered to 42 contacts
✅ Saved 42 prospects
```

### Warning Signs ⚠️
```
⚠️ Could not find LinkedIn URL for [Company]
⚠️ No results from Harvest API
⚠️ Gemini quota approaching limit
```

### Error Signs ❌
```
❌ Apify actor failed
❌ Firebase write failed
❌ Quota exceeded
```

---

## 📞 Need Help?

1. **Check Logs**: Look for error messages
2. **Check Firebase**: Verify data is saving
3. **Check Railway**: View backend logs
4. **Read Full Guide**: `LINKEDIN_CONTACT_SEARCH_GUIDE.md`

---

## 🎓 Next Steps After Testing

Once you've successfully tested with 5 companies:

1. **Increase Limits**: Remove 5-company test limit
2. **CSV Upload**: Add bulk company upload
3. **Scheduling**: Set up automated searches
4. **Integration**: Connect to outreach campaigns

---

**Remember**: This is TEST MODE. Limited to 5 companies. Perfect for learning the system!

**Typical First Run**: 
- 5 companies → ~125 contacts → ~30 after filtering → 6-8 minutes → $0.36 cost

**Second Run (cached)**:
- Same 5 companies → 125 contacts → Instant → FREE! 🎉
