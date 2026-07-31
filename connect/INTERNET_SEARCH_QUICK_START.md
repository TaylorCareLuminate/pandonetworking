# Internet Search Messages - Quick Start Guide

## What Is This?

Generate LinkedIn connection messages from **recent news** about prospects, perfect for the 90% of prospects without recent LinkedIn posts.

## How to Use

### Step 1: Open Generate Messages Page
Go to: `/connect/generate_messages.html` → Click **"Internet Search"** tab

### Step 2: Configure
- **Select BDR**: Choose one BDR or "All BDRs"
- **Number of Prospects**: Set 10-50 for daily use (1-100 max)

### Step 3: Generate
Click **"Generate from Internet Search"** button

### Step 4: Wait
- Takes ~15-30 seconds per prospect
- Watch progress in real-time
- Don't close the browser tab

### Step 5: Review
- Messages appear in **Connect Review Queue** (Queue 1)
- Look for `source` field: "Contact News" or "Organization News"
- Approve/edit as normal

## What Happens Behind the Scenes

```mermaid
Prospect → Search for Contact News
       → Search for Organization News
       → Pick Best News
       → Generate Message
       → Save to Queue
       → Done!
```

### The System Searches For:
**Organization News** (past 1-3 months):
- Innovations and breakthroughs
- Awards and recognition
- Strategic growth and partnerships
- Major achievements

**Contact News** (past 1-6 months):
- Conference speaking
- Media features and quotes
- Awards received
- Thought leadership
- Career milestones

### News Selection Priority:
1. ✅ **Contact News** (most personal)
2. ✅ Organization News (fallback)
3. ❌ Skip if no exciting news found

## Message Format

All messages follow this structure:
```
"Just saw the news about [contact/company] [specific news]. 
[Why it's exciting]. 
When I saw that, I looked you up on LinkedIn and wanted to connect."
```

**Example (Contact News):**
```
Just saw the news about your keynote at HIMSS on AI in healthcare. 
Your perspective on patient data security was spot-on. 
When I saw that, I looked you up on LinkedIn and wanted to connect.
```

**Example (Organization News):**
```
Just saw the news about Acme Health's $50M Series B funding. 
Your expansion into telehealth is impressive timing. 
When I saw that, I looked you up on LinkedIn and wanted to connect.
```

## API Usage

### Searches Per Prospect
- **2 Gemini searches** (organization + contact news)
- Each search uses 1 API call from the rate limit pool

### Rate Limits
- 16 Gemini API keys
- 1,498 searches per key per 24 hours
- **Total capacity: 23,968 searches per day**
- Automatic key rotation

### Cost Per Prospect
- ~$0.005 per prospect (~$5 per 1,000 prospects)

## Tracking & Reporting

### New Fields in connect_queue
All internet search messages have:

**`source`**: 
- `"Contact News"` - News about the person
- `"Organization News"` - News about the company

**`news_data`** (JSON):
```json
{
  "headline": "Brief headline",
  "date": "Month YYYY",
  "content": "Summary of the news",
  "url": "Source URL"
}
```

**`generated_via`**: `"internet_search"`

### How to Find These Messages
In Connect Review or any queue view:
- Filter by `source = "Contact News"` or `"Organization News"`
- Or filter by `generated_via = "internet_search"`

## Best Practices

### ✅ DO
- Start with 5-10 prospects to test
- Run daily batches of 50-100 prospects per BDR
- Review messages before auto-pushing
- Mix with LinkedIn post-based messages
- Track which news sources convert best

### ❌ DON'T
- Don't run 1000+ prospects at once (too slow)
- Don't skip admin review (quality matters)
- Don't expect 100% success rate (some prospects have no news)
- Don't use if prospect has recent LinkedIn posts (use regular generation instead)

## Troubleshooting

### "No exciting news found"
**Normal!** Not every prospect has recent newsworthy events. The system is picky about news quality.

**What to do:** Try again in 1-3 months, or use LinkedIn post generation if they have posts.

---

### "All Gemini API keys exhausted"
Your 16 keys hit the daily limit (unlikely unless processing 10,000+ prospects).

**What to do:** Wait for keys to reset (24-hour rolling window) or check usage at `/gemini/usage-report`

---

### "No prospects found"
The BDR has no prospects without recent posts in the database.

**What to do:** Check `prospect_contacts` collection or try a different BDR.

---

### Messages not appearing in queue
**Check:**
1. Console logs for errors
2. Firestore `connect_queue` collection directly
3. BDR authentication and LinkedIn email mapping

## Integration with Existing Workflows

### Compatible With:
- ✅ Connect Review Queue (Queue 1)
- ✅ Auto-push to HeyReach
- ✅ Campaign assignment
- ✅ Message filtering and deduplication
- ✅ Admin approval workflow

### Works Alongside:
- ✅ LinkedIn post-based messages
- ✅ Manual message uploads
- ✅ Prospect contact imports

## Quick Commands

### Check API Usage
Open browser console:
```javascript
// Check Gemini key status
fetch('https://railwayclemail-production.up.railway.app/gemini/usage-report')
  .then(r => r.json())
  .then(console.log)
```

### Test Single Prospect (Backend)
```bash
POST /api/connect/generate-internet-messages
{
  "bdrEmail": "test@company.com",
  "prospectCount": 1
}
```

## Support & Logs

### Where to Look
1. **Browser Console**: Real-time progress and errors
2. **Railway Logs**: Detailed backend processing
3. **Connect Queue**: Final saved messages
4. **Gemini Usage Report**: API key status

### Key Log Messages
```
🌐 Starting internet search message generation...
🔍 Searching organization news...
✅ Found: [headline]
📰 Selected: Contact News
✍️ Generating message...
✅ Message generated and saved
```

## Summary

**Use this feature when:**
- Prospect has no recent LinkedIn posts
- You want to reference timely news
- You need to scale outreach beyond LinkedIn activity

**Expected results:**
- 40-60% of prospects will have exciting news
- Contact News messages typically perform best
- Average 15-30 seconds per prospect
- Messages require same admin review as LinkedIn posts

**Key advantage:**
Reach the **90% of prospects** who don't post regularly on LinkedIn! 🎯



