# LinkedIn Company Employees Scraper (HarvestAPI)

R wrapper for the `harvestapi/linkedin-company-employees` Apify actor. This actor provides advanced LinkedIn employee scraping with extensive filtering options and high success rates.

## Features

- **Multiple Profile Modes:**
  - **Short ($4 per 1k):** Name, URL, summary, location, current positions
  - **Full ($8 per 1k):** Complete work history, education, skills, headline, about
  - **Full + email ($12 per 1k):** Everything plus email search

- **Batch Processing:**
  - `all_at_once`: Scrape up to 10 companies in parallel
  - `one_by_one`: Scrape up to 1,000 companies sequentially

- **Advanced Filters:**
  - Seniority levels (CXO, VP, Director, Manager, etc.)
  - Job functions (IT, Finance, Sales, Marketing, etc.)
  - Locations, industries, years at company
  - Job titles, search queries

- **Smart Parsing:**
  - **Short mode:** Returns structured data frame with current position details
  - **Full mode:** Returns consolidated experience and education paragraphs for easy reading

## Installation

```r
# Load required libraries
library(httr)
library(jsonlite)
library(dplyr)

# Source the script
source("path/to/harvestapi-linkedin-company-employees.R")

# Set your Apify API key
Sys.setenv(APIFY_API_KEY = "your_api_key_here")
```

## Quick Start

```r
# Example 1: Get all VP/CXO employees in IT at a single company
result <- scrape_linkedin_employees(
  companies = "https://www.linkedin.com/company/1441/",
  seniority_levels = c("vp", "cxo"),
  job_functions = "information_technology",
  profile_scraper_mode = "Short ($4 per 1k)",
  max_items = 100
)

# View results
View(result$results_df)

# Example 2: Get full profiles with experience & education
result_full <- scrape_linkedin_employees(
  companies = "https://www.linkedin.com/company/1441/",
  profile_scraper_mode = "Full ($8 per 1k)",
  max_items = 50
)

# View consolidated experience and education
View(result_full$results_df[, c("first_name", "last_name", "experience_paragraph", "education_paragraph")])
```

## Test Functions

The script includes several pre-built test functions:

```r
# Test 1: VP/CXO in Information Technology
test_vp_cxo_it()

# Test 2: Director/Senior in Administrative roles
test_director_senior_admin()

# Test 3: All employees at 3 VC companies
test_three_vc_companies()

# Test 4: C-Suite executives (one company at a time)
test_csuite_one_by_one()

# Test 5: Full profile mode with experience & education
test_full_mode_vanity_urls()
```

## Profile Modes Comparison

### Short Mode ($4 per 1,000 profiles)

Returns a data frame with:
- `firstName`, `lastName`
- `linkedinEntityUrl` (entity URN format)
- `location`, `summary`
- `openProfile`, `premium`
- `pictureUrl`
- **Current position:** `currentTitle`, `currentCompany`, `currentCompanyUrl`, `startedMonth`, `startedYear`, `tenureMonths`, `tenureYears`, `positionDescription`

**Best for:** Quick lists of current employees with basic contact info.

### Full Mode ($8 per 1,000 profiles)

Returns a data frame with:
- `first_name`, `last_name`
- `linkedin_url` (may be entity URN)
- `current_title`, `current_company`
- `headline`, `about`
- **`experience_paragraph`**: All work history consolidated into one readable text block
- **`education_paragraph`**: All education consolidated into one readable text block
- `location`
- `open_profile`, `premium`

**Best for:** Detailed profiles with complete career and education history for analysis or outreach.

### Full + Email Mode ($12 per 1,000 profiles)

Includes everything from Full mode plus email search results.

**Best for:** Lead generation and direct outreach campaigns.

## Full Mode: Experience & Education Paragraphs

When using `"Full ($8 per 1k)"` mode, the parser automatically consolidates all experience and education into readable paragraphs:

### Experience Paragraph Format

```
Software Engineer at Google
Location: Mountain View, CA
Duration: 3 years 5 months
Led development of cloud infrastructure...

Senior Developer at Microsoft
Location: Seattle, WA
Duration: 2 years 1 month
Developed enterprise applications...
```

### Education Paragraph Format

```
Stanford University
Computer Science, MS
Dates: 2015 - 2017

University of California, Berkeley
Computer Science, BS
Dates: 2011 - 2015
```

### Accessing the Data

```r
# Get full profiles
result <- scrape_linkedin_employees(
  companies = "https://www.linkedin.com/company/1441/",
  profile_scraper_mode = "Full ($8 per 1k)",
  max_items = 50
)

df <- result$results_df

# View a specific person's full experience
cat(df$experience_paragraph[1])

# View a specific person's education
cat(df$education_paragraph[1])

# Export to CSV (experience and education will be in single cells)
write.csv(df, "linkedin_profiles_full.csv", row.names = FALSE)
```

## Filtering Options

### Seniority Levels

```r
seniority_levels = c("cxo", "vp", "director", "manager", "senior", "entry", "training", "unpaid", "partner", "owner")
```

### Job Functions

```r
job_functions = c(
  "accounting", "administrative", "arts_design", "business_development",
  "community_social_services", "consulting", "education", "engineering",
  "entrepreneurship", "finance", "healthcare_services", "human_resources",
  "information_technology", "legal", "marketing", "media_communication",
  "military_protective_services", "operations", "product_management",
  "program_project_management", "purchasing", "quality_assurance",
  "real_estate", "research", "sales", "support"
)
```

## Important Safety Limits

### 🛑 CRITICAL: Preventing Runaway Costs & Timeouts

The actor has **built-in safety limits** to prevent expensive, long-running jobs that can timeout while still costing money:

**Hard Limits (Will Stop Execution):**

1. **`one_by_one` mode:**
   - **Maximum 5 companies** per actor run
   - **Maximum 10,000 estimated profiles** per run
   - Exceeding these triggers an error with solutions

2. **`all_at_once` mode:**
   - Maximum 10 companies (Apify limit)
   - **Maximum 5,000 estimated profiles** per run

**Why These Limits Exist:**

When you process too many companies or request too many profiles in one run:
- ❌ Actor can timeout (502 error) but **keep running on Apify servers**
- ❌ You lose connection but **the actor keeps costing money**
- ❌ Results may be lost or incomplete
- ❌ No way to get partial results if it times out

**Best Practice:**

```r
# BAD: This will fail with safety error
scrape_linkedin_employees(
  companies = 38_company_urls,  # ❌ Too many!
  company_batch_mode = "one_by_one",
  max_items_per_company = 2000
)

# GOOD: Process in small batches
for (i in seq(1, length(all_urls), by = 5)) {
  batch <- all_urls[i:min(i+4, length(all_urls))]
  result <- scrape_linkedin_employees(
    companies = batch,  # ✅ Only 5 at a time
    company_batch_mode = "one_by_one",
    max_items_per_company = 500
  )
  # Save results after each batch
}
```

### Emergency: Abort a Running Actor

If an actor is stuck running and costing money:

```r
# Find your run ID from the error message or Apify console
abort_actor_run(run_id = "YOUR_RUN_ID_HERE")
```

This will immediately stop the actor on Apify's servers.

## Important Notes

### LinkedIn URLs

⚠️ **Entity URN vs. Vanity URLs:** 

The actor returns LinkedIn URLs in "entity URN" format (e.g., `https://www.linkedin.com/in/ACwAAABHZ5EB...`) rather than vanity URLs (e.g., `https://www.linkedin.com/in/john-smith/`).

**This is a limitation of the actor itself**, not the R wrapper. Even the "Full" mode does not provide vanity URLs or the `public_identifier` field.

**Workarounds:**
1. Use the entity URN URLs directly (they work in browsers and redirect to the correct profile)
2. Accept that vanity URLs are not available from this actor
3. Consider using the `linkedin-data-scraper-everything-thing` actor if you need vanity URLs, though it has other limitations

### Cost Management

```r
# Estimate costs before scraping
num_profiles <- 500
cost_short <- (num_profiles / 1000) * 4    # $2.00
cost_full <- (num_profiles / 1000) * 8     # $4.00
cost_email <- (num_profiles / 1000) * 12   # $6.00

# Start small to test
result <- scrape_linkedin_employees(
  companies = "https://www.linkedin.com/company/1441/",
  max_items = 10,  # Test with just 10 profiles first
  profile_scraper_mode = "Short ($4 per 1k)"
)
```

### Batch Modes

- **`all_at_once`** (default): Faster, but limited to 10 companies
- **`one_by_one`**: Slower, but can handle up to 1,000 companies

## Helper Functions

### Save to CSV

```r
# Short mode
save_employees_csv(df, filename = "linkedin_employees.csv")

# Full mode - experience and education will be preserved in single cells
write.csv(df, "linkedin_profiles_full.csv", row.names = FALSE, fileEncoding = "UTF-8")
```

### Display Preview

```r
display_employees_preview(df)
```

### Summarize by Company

```r
summarize_companies(df)
```

## Troubleshooting

### Common Issues

1. **"Input is not valid: Field input.companies must be array"**
   - Ensure companies is a character vector: `companies = "https://..."`
   - Or a vector of URLs: `companies = c("https://...", "https://...")`

2. **"No full profiles found in results"**
   - Use `"Full ($8 per 1k)"` mode to get experience and education data
   - Short mode only provides current position information

3. **Empty results**
   - Company may have restricted employee listings
   - Try reducing filters (remove seniority/function filters)
   - Increase `max_items` or `take_pages`

4. **Rate limiting**
   - This actor handles rate limiting automatically
   - Use `one_by_one` mode for large company lists
   - Add delays between runs if needed

## Pricing Examples

| Profiles | Short ($4/1k) | Full ($8/1k) | Full + Email ($12/1k) |
|----------|---------------|--------------|----------------------|
| 10       | $0.04         | $0.08        | $0.12                |
| 100      | $0.40         | $0.80        | $1.20                |
| 500      | $2.00         | $4.00        | $6.00                |
| 1,000    | $4.00         | $8.00        | $12.00               |
| 10,000   | $40.00        | $80.00       | $120.00              |

## API Reference

### Main Function

```r
scrape_linkedin_employees(
  companies,                              # LinkedIn company URL(s)
  company_batch_mode = "all_at_once",    # or "one_by_one"
  profile_scraper_mode = "Short ($4 per 1k)",  # or "Full ($8 per 1k)" or "Full + email search ($12 per 1k)"
  seniority_levels = NULL,               # c("cxo", "vp", "director", etc.)
  job_functions = NULL,                  # c("information_technology", "finance", etc.)
  locations = NULL,                      # c("San Francisco", "New York", etc.)
  search_query = NULL,                   # Free text search
  job_titles = NULL,                     # c("Software Engineer", "Product Manager", etc.)
  industry_ids = NULL,                   # LinkedIn industry IDs
  years_at_company = NULL,               # Minimum years at current company
  max_items = 25,                        # Total profiles to scrape
  max_items_per_company = NULL,          # Profiles per company
  start_page = 1,                        # Starting page number
  take_pages = NULL,                     # Number of pages to scrape
  recently_changed_jobs = FALSE,         # Filter for recent job changes
  api_token = NULL,                      # Apify API key (or use env var)
  wait_for_finish = TRUE,                # Wait for actor to complete
  timeout = 600,                         # Timeout in seconds
  return_df = TRUE                       # Return as data frame
)
```

## License

This is a wrapper for the Apify `harvestapi/linkedin-company-employees` actor. Please review Apify's terms of service and LinkedIn's terms of service before scraping.

## Support

For issues with:
- **This R wrapper:** Open an issue in this repository
- **The Apify actor itself:** Contact HarvestAPI support
- **LinkedIn data access:** Review LinkedIn's API documentation

## Version History

- **v1.0** (2025-01-08): Initial release with Short mode parsing
- **v1.1** (2025-01-08): Added Full mode parsing with consolidated experience/education paragraphs

