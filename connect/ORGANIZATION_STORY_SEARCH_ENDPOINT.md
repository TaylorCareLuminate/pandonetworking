# Organization Story Search Backend Endpoint

## Overview
This document specifies the backend endpoint needed to support the new "Organization Story Search" feature in `generate_messages.html`.

## Frontend Feature
The UI allows users to:
- Define a custom search prompt template (e.g., "Search for stories about [Organization Name] HealthcareIT, Epic, AI...")
- Select BDRs to generate messages for
- Specify how many organizations to search
- Generate connection messages based on organization-level news (not contact-specific news)

## Required Endpoint

### POST `/api/connect/generate-organization-story-messages-async`

**Purpose:** Start an async job to search for organization stories and generate connection messages.

**Authentication:** Requires Bearer token (Firebase auth)

**Request Body:**
```json
{
  "bdrEmail": "bdr@example.com",
  "organizationCount": 50,
  "searchPromptTemplate": "Search for new stories about [Organization Name] HealthcareIT, Epic, AI or other IT solutions or innovations"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job_xyz123"
}
```

## Implementation Logic

### 1. Get Organizations
```javascript
// Query prospect_contacts for this BDR
// Get unique organizations (company_name or similar field)
// Limit to organizationCount
```

### 2. For Each Organization
```javascript
for (const org of organizations) {
  // Step 1: Replace placeholder in template
  const searchQuery = searchPromptTemplate.replace(/\[Organization Name\]/gi, org.name);
  
  // Step 2: Search using Gemini
  const newsResults = await geminiSearch(searchQuery);
  
  // Step 3: If exciting news found, pick ONE contact from this org
  if (newsResults.hasExcitingNews) {
    // Get any contact from this organization (no role/title filtering)
    const contact = await getOneContactForOrganization(bdrEmail, org.name);
    
    // Step 4: Generate connection message
    const message = await generateConnectionMessage({
      contactName: contact.name,
      contactTitle: contact.title,
      organization: org.name,
      newsHeadline: newsResults.headline,
      newsContent: newsResults.content,
      newsUrl: newsResults.url
    });
    
    // Step 5: Save to connect_queue
    await saveMessageToQueue({
      bdrEmail: bdrEmail,
      contactName: contact.name,
      contactLinkedInUrl: contact.linkedInUrl,
      organization: org.name,
      messageText: message,
      messageType: 'connect',
      source: 'Organization Story Search',
      newsHeadline: newsResults.headline,
      newsUrl: newsResults.url,
      searchPrompt: searchQuery, // Store the actual search used
      reviewStatus: 'pending_admin_review'
    });
  }
}
```

### 3. Key Differences from Contact-Focused Search

| Aspect | Contact Search | Organization Story Search |
|--------|---------------|--------------------------|
| **Search Focus** | Contact + Organization | Organization only |
| **Search Count** | 2 per contact (contact + org) | 1 per organization |
| **Contact Selection** | Must match contact's role/title | Any contact from org |
| **Prompt** | System-generated | User-defined custom prompt |
| **Use Case** | General outreach | Targeted campaigns on specific topics |

### 4. Job Status Polling
The job should be pollable via the existing endpoint:
```
GET /api/connect/generation-job/:jobId
```

Response format:
```json
{
  "success": true,
  "job": {
    "status": "running|completed|failed",
    "progress": {
      "current": 15,
      "total": 50,
      "percentage": 30,
      "message": "Processing organization 15/50..."
    },
    "results": {
      "messagesGenerated": 12,
      "organizationsProcessed": 15,
      "searchesPerformed": 15,
      "costs": {
        "total": 0.0456,
        "openAIQueryGeneration": 0.0100,
        "openAINewsSelection": 0.0156,
        "openAIMessageGeneration": 0.0200
      }
    },
    "logs": [
      { "message": "Starting organization story search...", "type": "info", "timestamp": "..." },
      { "message": "Found story for Acme Corp", "type": "success", "timestamp": "..." }
    ]
  }
}
```

## Example Search Flow

### User Input:
- **BDR:** Derek Moore
- **Organizations:** 10
- **Template:** "Search for new stories about [Organization Name] HealthcareIT, Epic, AI or other IT solutions or innovations"

### Backend Processing:
1. Get 10 organizations from Derek's prospects (e.g., "Acme Health", "MedTech Solutions", ...)
2. For "Acme Health":
   - Search: "Search for new stories about Acme Health HealthcareIT, Epic, AI or other IT solutions or innovations"
   - Find: "Acme Health Partners with Epic for New EHR Implementation"
   - Pick: John Smith (VP of Operations at Acme Health)
   - Generate: "Hi John, I saw that Acme Health just partnered with Epic for a new EHR implementation..."
3. Repeat for each organization
4. Return results

## Database Schema
Messages should be saved with:
- `source`: "Organization Story Search" (to differentiate from contact-focused search)
- `search_prompt`: The actual search query used (with org name filled in)
- `news_headline`: The headline found
- `news_url`: Link to the news article
- All standard fields (contact info, BDR email, message text, etc.)

## Error Handling
- If no organizations found for BDR → Return error
- If search quota exceeded → Return partial results + warning
- If no exciting news for an org → Skip, don't generate message
- If no contacts found for an org → Skip that organization

## Notes
- This is more efficient than contact search (1 search per org vs 2 searches per contact)
- Good for targeted campaigns around specific themes (IT solutions, partnerships, awards, etc.)
- No contact-level relevance checking - assumes org-level news is relevant to any contact
- User can craft very specific search queries for niche topics

