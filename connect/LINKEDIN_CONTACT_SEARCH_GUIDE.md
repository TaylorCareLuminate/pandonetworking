# LinkedIn Contact Search System - Complete Guide

## 📋 Overview

The LinkedIn Contact Search system is a comprehensive automated solution for finding and enriching LinkedIn contacts. It intelligently searches for company LinkedIn pages, scrapes employee data, filters contacts using AI, and saves them to your prospects database.

## 🎯 Key Features

- **Smart Company Search**: Uses Gemini + Bebity to find company LinkedIn pages
- **Firebase Caching**: Avoids duplicate searches and saves API costs
- **Employee Scraping**: Harvest API integration for detailed contact data
- **AI Filtering**: GPT-powered contact filtering based on custom criteria
- **Batch Processing**: Efficient batch processing (1400 contacts per batch)
- **Cost Management**: Gemini limited to 1400 searches/day to avoid costs

## 🏗️ Architecture

### Frontend
- **Page**: `connect/linkedin_contact_search.html`
- **Features**: 
  - Step-by-step UI with progress indicators
  - Real-time log viewer
  - Test mode (5 companies max)
  - Form validation

### Backend Services
- **Service**: `RailwayCLemail/services/linkedin_contact_search_service.js`
- **Endpoints**:
  - `/api/linkedin-contact-search/find-company-urls`
  - `/api/linkedin-contact-search/search-employees`
  - `/api/linkedin-contact-search/filter-contacts`
  - `/api/linkedin-contact-search/save-prospects`

### Firebase Collections

#### 1. `apify_linkedin_company_pages`
Stores cached company LinkedIn URLs to avoid duplicate searches.

**Schema**:
```javascript
{
  company_name: "Mayo Clinic",
  company_name_lower: "mayo clinic",  // For case-insensitive searches
  linkedin_url: "https://www.linkedin.com/company/mayo-clinic",
  search_date: "2026-01-10T12:00:00Z",
  source: "bebity" | "gemini"
}
```

**Indexes Required**:
- `company_name_lower` (ascending)

#### 2. `apify_employee_scrape_log`
Logs all employee searches to track what's been scraped recently (past 12 months).

**Schema**:
```javascript
{
  company_url: "https://www.linkedin.com/company/mayo-clinic",
  company_name: "Mayo Clinic",
  search_key: "url|departments|seniority_levels",  // Unique key for this search
  departments: ["Information Technology"],
  seniority_levels: ["310", "300"],  // C-Level, VP
  max_employees: 25,
  scrape_date: "2026-01-10T12:00:00Z",
  results_count: 23
}
```

**Indexes Required**:
- `search_key` (ascending)
- `scrape_date` (descending)

#### 3. `apify_linkedin_employee_scrapes`
Stores actual employee/contact data from Harvest API.

**Schema**:
```javascript
{
  first_name: "John",
  last_name: "Doe",
  linkedin_url: "https://www.linkedin.com/in/johndoe",
  linkedin_id: "ACwAAABPRhgBXc...",
  current_title: "Chief Information Officer",
  current_company: "Mayo Clinic",
  current_company_url: "https://www.linkedin.com/company/mayo-clinic",
  headline: "CIO at Mayo Clinic | Healthcare IT Leader",
  location: "Rochester, Minnesota",
  open_profile: false,
  premium: true,
  started_month: 3,
  started_year: 2020,
  tenure_months: 46,
  picture_url: "https://...",
  search_key: "url|departments|seniority_levels",
  scrape_date: "2026-01-10T12:00:00Z"
}
```

**Indexes Required**:
- `search_key` (ascending)
- `scrape_date` (descending)
- `linkedin_url` (ascending) - for deduplication

## 🔄 Workflow

### Step 1: Find Company LinkedIn URLs

1. **User Input**: Enter up to 5 company names (test mode)
   - Optional: city, state, domain, industry

2. **Check Firebase Cache**:
   - Query `apify_linkedin_company_pages` collection
   - Return cached results (saves Gemini searches!)

3. **Gemini Web Search**:
   - For uncached companies, use Gemini to search web
   - Gemini finds official LinkedIn names and URLs
   - Uses `gemini-2.0-flash-exp` model with web search

4. **Bebity Validation**:
   - Validates/finds URLs using `bebity/linkedin-premium-actor`
   - Returns top 5 matches per company
   - Uses AI to select best match if multiple results

5. **Save to Cache**:
   - Saves results to `apify_linkedin_company_pages`
   - Future searches for same companies are instant!

### Step 2: Search for Employees

1. **Check Scrape Log**:
   - Query `apify_employee_scrape_log`
   - Find recent searches (past 12 months)
   - If found, load from `apify_linkedin_employee_scrapes`

2. **Harvest API Scrape** (if not cached):
   - Uses `harvestapi/linkedin-company-employees` actor
   - Searches with criteria:
     - Departments/job functions
     - Seniority levels (C-Level, VP, Director, Manager)
     - Max employees per company
   - Processes in batches of 5 companies (safety limit)

3. **Parse Results**:
   - Extracts key fields from Harvest API response
   - Normalizes data structure
   - Handles complex current position logic

4. **Save to Firebase**:
   - Saves employees to `apify_linkedin_employee_scrapes`
   - Creates log entry in `apify_employee_scrape_log`
   - Enables future cache hits

### Step 3: Filter Contacts

1. **GPT Filtering** (optional):
   - User provides custom filter prompt
   - Example: "Only cybersecurity professionals, exclude support roles"
   - Processes in batches of 1400 contacts
   - Uses `gpt-4o-mini` for cost efficiency

2. **Batch Processing**:
   - Splits contacts into batches of 1400
   - Each batch filtered independently
   - Combines results

### Step 4: Save to Prospects

1. **Save to `prospects` Collection**:
   - Converts to standard prospect format
   - Adds metadata (uploaded by, date, source)
   - Sets status to 'pending'
   - Ready for outreach campaigns!

## 📊 API Reference

### 1. Find Company URLs

**Endpoint**: `POST /api/linkedin-contact-search/find-company-urls`

**Request**:
```json
{
  "companies": [
    {
      "company_name": "Mayo Clinic",
      "city": "Rochester",
      "state": "Minnesota",
      "domain": "mayoclinic.org",
      "industry": "Healthcare"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "companies": [
    {
      "company_name": "Mayo Clinic",
      "linkedin_url": "https://www.linkedin.com/company/mayo-clinic",
      "is_cached": false,
      "search_date": "2026-01-10T12:00:00Z"
    }
  ],
  "found": 1,
  "total": 1
}
```

### 2. Search Employees

**Endpoint**: `POST /api/linkedin-contact-search/search-employees`

**Request**:
```json
{
  "companies": [
    {
      "company_name": "Mayo Clinic",
      "linkedin_url": "https://www.linkedin.com/company/mayo-clinic"
    }
  ],
  "departments": ["Information Technology"],
  "seniority_levels": ["310", "300"],
  "max_employees": 25
}
```

**Seniority Level IDs**:
- `100`: Unpaid
- `110`: Training
- `120`: Entry/Manager
- `220`: Senior/Director
- `300`: VP
- `310`: C-Level (CIO, CTO, etc.)
- `320`: Partner

**Response**:
```json
{
  "success": true,
  "employees": [
    {
      "first_name": "John",
      "last_name": "Doe",
      "linkedin_url": "https://www.linkedin.com/in/johndoe",
      "current_title": "CIO",
      "current_company": "Mayo Clinic",
      "headline": "Chief Information Officer at Mayo Clinic",
      "location": "Rochester, Minnesota"
    }
  ],
  "total_contacts": 23
}
```

### 3. Filter Contacts

**Endpoint**: `POST /api/linkedin-contact-search/filter-contacts`

**Request**:
```json
{
  "employees": [...],
  "filter_prompt": "Only include contacts who work in cybersecurity or information security. Exclude general IT support roles."
}
```

**Response**:
```json
{
  "success": true,
  "filtered_contacts": [...],
  "filtered_count": 12,
  "total_count": 23
}
```

### 4. Save Prospects

**Endpoint**: `POST /api/linkedin-contact-search/save-prospects`

**Request**:
```json
{
  "contacts": [...],
  "user_email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "saved_count": 12
}
```

## 💰 Cost Management

### Gemini
- **Limit**: 1400 searches per API key per 24 hours
- **Strategy**: Uses web-enabled search (grounding)
- **Model**: `gemini-2.0-flash-exp`
- **Batch Size**: Up to 1400 companies per batch

### GPT (OpenAI)
- **Model**: `gpt-4o-mini` (cost-effective)
- **Batch Size**: 1400 contacts per batch
- **Use**: Contact filtering only

### Apify
- **Bebity**: ~$0.05 per company search
- **Harvest API**: 
  - Short mode: $4 per 1000 profiles
  - Returns: name, URL, location, current position
- **Safety Limits**: 
  - Max 5 companies per Harvest run
  - Max 10,000 profiles per run

## 🔐 Security

- **Authentication**: Firebase Auth required
- **Authorization**: `verifyCrossProjectAuth` middleware
- **API Keys**: Stored in environment variables
- **CORS**: Restricted to healthluminate.com

## 🧪 Testing

### Test Mode Features
- Limited to 5 companies
- Real-time logging
- Step-by-step progress
- Visual feedback

### Manual Testing Steps

1. **Open Page**: `connect/linkedin_contact_search.html`

2. **Enter Companies**:
```
Mayo Clinic
Cleveland Clinic
Johns Hopkins Hospital
Massachusetts General Hospital
UPMC
```

3. **Set Criteria**:
- Departments: "Information Technology"
- Seniority: Select "C-Level" and "VP"
- Max Employees: 25

4. **Add Filter** (optional):
```
Only include CIOs, CTOs, and VPs of IT. 
Exclude consultants and contractors.
```

5. **Run Process**:
- Click "Find Company LinkedIn URLs"
- Wait for results
- Click "Search for Contacts"
- Wait for results
- Click "Filter & Save Contacts"
- Verify contacts saved to prospects

6. **Check Logs**:
- Review system logs for errors
- Verify Firebase writes

## 🚀 Production Deployment

### Environment Variables Required

```bash
# Apify
APIFY_API_KEY=your_apify_key

# OpenAI
OPENAI_API_KEY=your_openai_key

# Gemini (handled by GeminiService)
# Multiple keys in firebase_service
```

### Firebase Setup

1. **Create Collections**:
   - `apify_linkedin_company_pages`
   - `apify_employee_scrape_log`
   - `apify_linkedin_employee_scrapes`

2. **Create Indexes**:
```javascript
// apify_linkedin_company_pages
company_name_lower ASC

// apify_employee_scrape_log
search_key ASC
scrape_date DESC (composite)

// apify_linkedin_employee_scrapes
search_key ASC
scrape_date DESC
linkedin_url ASC
```

3. **Set Security Rules**:
```javascript
match /apify_linkedin_company_pages/{doc} {
  allow read, write: if request.auth != null;
}

match /apify_employee_scrape_log/{doc} {
  allow read, write: if request.auth != null;
}

match /apify_linkedin_employee_scrapes/{doc} {
  allow read, write: if request.auth != null;
}
```

### Production Limits

Once testing is complete, update limits:
- Remove 5-company test limit
- Allow batch processing
- Add rate limiting
- Add usage monitoring

## 📝 Future Enhancements

1. **CSV Upload**: Support CSV file upload with company data
2. **Job Function Filters**: More granular Harvest API filters
3. **Duplicate Detection**: Cross-check with existing prospects
4. **Enrichment**: Add company size, revenue, etc.
5. **Scheduling**: Schedule regular scrapes
6. **Email Finding**: Integrate email enrichment
7. **Phone Numbers**: Add phone number enrichment

## 🐛 Troubleshooting

### Gemini Quota Exceeded
**Symptom**: "Quota exceeded" error
**Solution**: Wait 24 hours or add more API keys

### Apify Timeout
**Symptom**: Actor run times out
**Solution**: Reduce batch size or max_employees

### No Contacts Found
**Symptom**: 0 contacts returned
**Solution**: 
- Verify company LinkedIn URLs are correct
- Check seniority/department filters
- Try broader search criteria

### Firebase Write Failed
**Symptom**: "Permission denied" error
**Solution**: Check Firebase security rules

## 📞 Support

For issues or questions:
1. Check system logs in Railway
2. Review Firebase console
3. Check Apify run history
4. Contact development team

## 🎉 Success Metrics

Track these metrics:
- Cache hit rate (company URLs)
- Contacts found per company
- Filter effectiveness (% kept)
- Time to complete full search
- Cost per contact
- Prospects converted to outreach

---

**Version**: 1.0.0  
**Last Updated**: January 10, 2026  
**Status**: Test Mode - Ready for Testing
