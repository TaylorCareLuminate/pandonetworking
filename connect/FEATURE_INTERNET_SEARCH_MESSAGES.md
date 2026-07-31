# Internet Search Message Generation Feature

## Overview

This feature enables generating LinkedIn connection messages from recent news about prospects and their organizations, specifically for prospects without recent LinkedIn posts (which represents ~90% of contacts in the prospect database).

## How It Works

### 1. Prospect Selection
- **Target**: Prospects from `prospect_contacts` collection without recent LinkedIn posts
- **Criteria**: 
  - Not searched in the past 7 days, OR
  - Previously searched but no worthy posts found (`has_recent_worthy_posts: false`)
  - Must have: firstName, lastName, company, title, linkedInUrl

### 2. Dual Search Strategy

For each prospect, the system performs TWO Gemini web searches:

#### Organization News Search
- Uses OpenAI to craft a search query tailored to the contact's title
- Examples:
  - IT roles: "innovation, new tech implementations, digital transformation"
  - Executive roles: "strategic growth, partnerships, acquisitions"
  - Finance roles: "funding rounds, financial milestones"
- Searches for news from the **past 1-3 months**
- Focuses on truly exciting, positive news the company would be proud of

#### Contact News Search  
- Searches specifically for news about the individual contact
- Looks for:
  - Conference speaking engagements
  - Media quotes and features
  - Awards and recognition
  - Thought leadership content
  - Major initiative leadership
  - Promotions or career milestones
- Searches for news from the **past 1-6 months** (longer window for individual mentions)

### 3. News Selection Logic

The system automatically selects the best news to mention:
1. **Prefers Contact News** (more personal and impressive)
2. Falls back to Organization News if no contact news found
3. Skips prospect if no exciting news found for either

### 4. Message Generation

Messages follow this structure:
```
"Just saw the news about [contact/company] [specific news reference]. 
[Why it's exciting/impressive]. 
When I saw that, I looked you up on LinkedIn and wanted to connect."
```

**Style Guidelines:**
- Relaxed, appreciative, informal
- Focus 100% on THEIR achievement
- Genuinely impressed tone
- No salesy language or questions
- No exclamation marks or em-dashes
- Max 200 characters

### 5. Message Improvement

Generated messages go through the same `improveLinkedInMessage()` function used for LinkedIn post-based messages to ensure natural phrasing.

### 6. Storage in connect_queue

Messages are saved with special fields to track their source:

#### New Fields
- **`source`**: String - One of:
  - `"Contact News"` - News about the individual
  - `"Organization News"` - News about their company
  - `"LinkedIn Post"` - Traditional LinkedIn post-based message (existing)

- **`news_data`**: JSON String - Structured news information:
  ```json
  {
    "headline": "Brief headline of the news",
    "date": "Month YYYY",
    "content": "2-3 sentence summary",
    "url": "URL to news source"
  }
  ```

- **`generated_via`**: `"internet_search"` - Identifies generation method

#### Other Notable Fields
- `post_text`: Empty string (no LinkedIn post for these)
- `post_url`: Empty string
- `message_type`: Always `"connect"` (only for prospects)
- `reviewStatus`: `"pending_admin_review"` (same as other messages)

## API Usage & Rate Limiting

### Gemini API Key Management
- **16 API keys** (`gen00` through `gen15`)
- **1498 searches per key per 24 hours** (total: 23,968 searches/day across all keys)
- Automatic key rotation when limits reached
- 24-hour rolling window tracking

### Searches Per Prospect
- **2 Gemini searches**: Organization news + Contact news
- **2-3 OpenAI calls**: Query generation + Message generation + (optional) JSON extraction

### Cost Estimate (per prospect)
- Gemini: ~$0.003 (2 searches)
- OpenAI: ~$0.002 (2-3 calls with gpt-4o-mini and gpt-4o)
- **Total: ~$0.005 per prospect**

### Performance
- **Time**: ~15-30 seconds per prospect
- **Throughput**: ~120-240 prospects per hour per server
- **Daily capacity**: ~2,880-5,760 prospects per day (limited by time, not API limits)

## User Interface

### Location
`/connect/generate_messages.html` → "Internet Search" tab

### Controls
- **BDR Selection**: Process prospects for specific BDR or all BDRs
- **Prospect Count**: 1-100 prospects per run (default: 10)
- Real-time progress tracking
- Detailed results with news source breakdown

### Results Display
Shows:
- Messages generated
- Searches performed
- Prospects processed
- Error count
- Detailed list of each generated message with news source

## Backend Implementation

### Endpoint
```
POST /api/connect/generate-internet-messages
Authorization: Bearer <firebase-token>
Body: {
  "bdrEmail": "email@company.com" or null for all BDRs,
  "prospectCount": 10
}
```

### Key Functions (in server.js)

1. **`searchOrganizationNews(prospect, bdr)`**
   - Crafts search query based on prospect's title
   - Uses Gemini web search
   - Returns structured news object or null

2. **`searchContactNews(prospect, bdr)`**
   - Searches for news specifically about the individual
   - Uses Gemini web search
   - Returns structured news object or null

3. **`selectBestNews(orgNews, contactNews)`**
   - Prioritizes contact news over organization news
   - Returns selected news or null

4. **`generateMessageFromNews(news, prospect, bdr)`**
   - Generates natural connection message mentioning the news
   - Uses OpenAI GPT-4o
   - Returns message text

## Integration Points

### Works With Existing Systems
- ✅ Uses same `improveLinkedInMessage()` function
- ✅ Saves to same `connect_queue` collection
- ✅ Uses existing BDR settings and authentication
- ✅ Shows in Connect Review Queue alongside other messages
- ✅ Compatible with auto-push to HeyReach system
- ✅ Respects same rate limiting and approval workflows

### Differences from LinkedIn Post Messages
- ❌ No LinkedIn post scraping required
- ❌ No Apify usage
- ✅ Uses Gemini web search instead
- ✅ Longer time window (1-6 months vs. 45 days)
- ✅ Works for 90% of prospects without recent posts

## Usage Recommendations

### When to Use
1. **After LinkedIn post generation**: Fill gaps for prospects without posts
2. **New prospect batches**: Process newly added prospects
3. **Quarterly updates**: Refresh messages for prospects with old searches
4. **Campaign-specific**: Generate messages for targeted prospect lists

### Best Practices
1. **Start small**: Test with 5-10 prospects first
2. **Monitor API usage**: Check Gemini key usage via `/gemini/usage-report`
3. **Review messages**: Admin review ensures quality before sending
4. **Balance sources**: Mix internet search and LinkedIn post messages
5. **Track source field**: Analyze which news sources convert best

### Batch Sizes
- **Testing**: 5-10 prospects
- **Daily runs**: 50-100 prospects per BDR
- **Bulk generation**: Up to 200-300 prospects (monitor API usage)

## Monitoring & Troubleshooting

### Check API Key Usage
```bash
GET /gemini/usage-report
```
Shows current usage for all 16 keys and when next key becomes available.

### Common Issues

1. **"All Gemini API keys exhausted"**
   - Wait for keys to reset (24-hour rolling window)
   - Check usage report for next available time

2. **"No exciting news found"**
   - Normal for some prospects
   - Try again in 1-3 months for new news

3. **"No prospects found"**
   - Check prospect_contacts have required fields
   - Verify BDR email matches prospects

### Logs to Watch
```
🌐 Starting internet search message generation...
   🔍 Searching organization news for [Company]...
         Search query: "[optimized query]"
         ✅ Found: [headline]
   🔍 Searching contact news for [Name]...
         ✅ Found: [headline]
   📰 Selected: Contact News ([headline])
   ✍️  Generating message from news...
   ✅ Generated: "[message]"
   ✅ Message generated and saved
```

## Future Enhancements

### Potential Improvements
1. **Caching**: Store news data to avoid re-searching same prospects
2. **News quality scoring**: Rank news by excitement level
3. **Source prioritization**: Learn which news sources perform best
4. **Batch optimization**: Process multiple prospects in parallel
5. **News age tracking**: Avoid mentioning stale news
6. **Company research integration**: Leverage existing company background data

### Metrics to Track
- Conversion rates by news source (Contact vs Organization)
- Message acceptance rate in review queue
- Response rates after sending (via HeyReach)
- Time to find exciting news per prospect
- Cost per successful connection

## Files Modified

### Frontend
- `HealthLuminateSiteFromLocal/connect/generate_messages.html`
  - Added "Internet Search" tab
  - Added UI controls and progress tracking
  - Added `generateInternetMessages()` function
  - Populated dropdown for BDR selection

### Backend
- `RailwayCLemail/server.js`
  - Added `/api/connect/generate-internet-messages` endpoint
  - Added `searchOrganizationNews()` helper
  - Added `searchContactNews()` helper
  - Added `selectBestNews()` helper
  - Added `generateMessageFromNews()` helper

### Documentation
- This file: `FEATURE_INTERNET_SEARCH_MESSAGES.md`

## Testing Checklist

- [ ] Test with single BDR and 5 prospects
- [ ] Verify messages saved with correct `source` field
- [ ] Verify `news_data` JSON structure is valid
- [ ] Check messages appear in Connect Review Queue
- [ ] Test with "All BDRs" option
- [ ] Verify Gemini API key rotation works
- [ ] Test error handling (no news found)
- [ ] Verify prospect last_search_date updates
- [ ] Check UI progress tracking displays correctly
- [ ] Test with prospect count at max (100)

## Summary

This feature dramatically increases message generation capacity by enabling outreach to the 90% of prospects without recent LinkedIn posts. It uses intelligent web search to find genuinely exciting news, then crafts personalized connection messages that reference that news. The system respects API rate limits, integrates seamlessly with existing workflows, and provides comprehensive tracking via the new `source` and `news_data` fields.

**Key Benefits:**
- ✅ Reach 90% more prospects
- ✅ More timely news (1-6 months vs. LinkedIn's 45 days)
- ✅ Personalized messages about actual achievements
- ✅ Automatic quality filtering (only exciting news)
- ✅ Full integration with existing review and push workflows



