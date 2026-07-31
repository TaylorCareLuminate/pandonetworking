================================================================================
BEBITY COMPANY SEARCH - README
================================================================================

OVERVIEW
--------
An intelligent function for searching LinkedIn organization/company profiles
using the bebity/linkedin-premium-actor on Apify, with built-in caching to
avoid redundant searches and save API costs.

KEY FEATURES:
✓ Automatic caching - never search the same organization twice
✓ GPT-powered name matching - finds cached results even with slight name variations
✓ Cost savings - only pay for new searches, not repeats
✓ Fully backward compatible - doesn't affect existing profile search function


WHAT PROBLEM DOES THIS SOLVE?
------------------------------
When you search for organization LinkedIn pages, you often:
- Search the same organizations multiple times across different projects
- Use slightly different names for the same organization
- Re-run scripts that include the same searches

Without caching, each search costs money. With this function:
- Day 1: Search "Sarasota Memorial Hospital" → costs API credits
- Day 2: Search "Sarasota Memorial Hospital" again → FREE (from cache!)
- Day 3: Search "Sarasota Memorial" → FREE (GPT matches to cached result!)


HOW IT WORKS
------------
1. You provide organization name(s)
2. Function checks cache database for previous searches
3. If found in cache → returns cached results (FREE!)
4. If NOT found → performs new search via Apify (costs API credits)
5. Saves new results to cache for future use

CACHE DATABASE STORES:
- search_query: What you originally searched for
- organization_name: Name found on LinkedIn
- linkedin_url: LinkedIn company page URL
- search_date: When this search was performed


INTELLIGENT MATCHING
-------------------
The function uses GPT (via gpt.batch from RProfile) to intelligently match
organization names. This means:

✓ "Mayo Clinic" matches "Mayo"
✓ "Sarasota Memorial Hospital" matches "Sarasota Memorial"
✓ "Cleveland Clinic Foundation" matches "Cleveland Clinic"
✓ "Johns Hopkins Hospital" matches "JHH"

If GPT matching is disabled (use_gpt_matching = FALSE), only exact matches work.


USAGE
-----

BASIC USAGE:
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search.R")

# Search single organization
result <- bebity_company_search("Mayo Clinic")

# Search multiple organizations
orgs <- c("Mayo Clinic", "Cleveland Clinic", "Johns Hopkins")
results <- bebity_company_search(orgs)


FUNCTION SIGNATURE
------------------
bebity_company_search(
  organization_names,        # Required: character vector of org names
  limit = 5,                 # Number of results per organization
  apify_token = NULL,        # API token (defaults to APIFY_API_KEY env var)
  cache_dir = "...",         # Cache directory (defaults to standard location)
  force_refresh = FALSE,     # If TRUE, ignore cache and search anyway
  use_gpt_matching = TRUE    # If TRUE, use GPT for name matching
)


RETURNED FIELDS
---------------
The function returns a data frame with these columns:

- search_query: Your original search term
- organization_name: Organization name found on LinkedIn
- linkedin_url: LinkedIn company page URL
- search_date: Date when search was performed
- is_cached: TRUE if from cache, FALSE if new search
- match_confidence: "cached", "new_search", or GPT-determined


EXAMPLES
--------

Example 1: First-time search
-----------------------------
result <- bebity_company_search("Sarasota Memorial Hospital")
# Output shows: is_cached = FALSE (new search, API cost incurred)

result
#   search_query              organization_name      linkedin_url              search_date  is_cached
#   Sarasota Memorial Hosp... Sarasota Memorial ...  linkedin.com/company/...  2024-12-27   FALSE


Example 2: Repeated search (demonstrates caching)
--------------------------------------------------
# Run the same search again
result2 <- bebity_company_search("Sarasota Memorial Hospital")
# Output shows: is_cached = TRUE (from cache, FREE!)

result2
#   search_query              organization_name      linkedin_url              search_date  is_cached
#   Sarasota Memorial Hosp... Sarasota Memorial ...  linkedin.com/company/...  2024-12-27   TRUE


Example 3: Similar name (demonstrates GPT matching)
----------------------------------------------------
# Search with slightly different name
result3 <- bebity_company_search("Sarasota Memorial")
# GPT recognizes this as same organization, uses cache!

result3$is_cached
# TRUE


Example 4: Multiple organizations
----------------------------------
hospitals <- c(
  "Mayo Clinic",
  "Cleveland Clinic", 
  "Johns Hopkins Hospital",
  "Massachusetts General Hospital"
)

results <- bebity_company_search(hospitals)

# View cache statistics
table(results$is_cached)
# FALSE  TRUE
#   4      0      (if first time searching all)

# Search again
results2 <- bebity_company_search(hospitals)
table(results2$is_cached)
# TRUE
#   4          (all from cache!)


Example 5: Integration with data frame
---------------------------------------
# Load data
hospitals_df <- data.frame(
  hospital_name = c("Mayo Clinic", "Cleveland Clinic"),
  city = c("Rochester", "Cleveland")
)

# Search for LinkedIn profiles
profiles <- bebity_company_search(hospitals_df$hospital_name)

# Merge back
enriched <- hospitals_df %>%
  left_join(profiles, by = c("hospital_name" = "search_query"))


COST SAVINGS
------------
Without caching:
- Search 100 hospitals once: $0.80
- Search same 100 hospitals again: $0.80
- Total: $1.60

With caching:
- Search 100 hospitals once: $0.80
- Search same 100 hospitals again: $0.00 (from cache)
- Total: $0.80 (50% savings!)

Over time with repeated analyses:
- Month 1: $0.80 (initial searches)
- Month 2: $0.00 (mostly cached)
- Month 3: $0.00 (mostly cached)
- Year total: ~$0.80 instead of ~$9.60 (92% savings!)


CACHE MANAGEMENT
----------------

VIEWING CACHE:
if (exists("loadr")) {
  cache <- loadr("Bebity LinkedIn Company Profiles/company_search_cache")
  View(cache)
  message(sprintf("Cache has %d records", nrow(cache)))
}

CACHE LOCATION:
C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles/

CLEARING CACHE (if needed):
cache_file <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles/company_search_cache.rdata"
if (file.exists(cache_file)) {
  file.remove(cache_file)
  message("✓ Cache cleared")
}


ADVANCED OPTIONS
----------------

FORCE REFRESH:
# Ignore cache and search anyway (useful if org changed LinkedIn page)
result <- bebity_company_search("Mayo Clinic", force_refresh = TRUE)

DISABLE GPT MATCHING:
# Faster but only finds exact matches
result <- bebity_company_search("Mayo Clinic", use_gpt_matching = FALSE)

CUSTOM CACHE DIRECTORY:
result <- bebity_company_search(
  "Mayo Clinic",
  cache_dir = "C:/My Custom Cache Location"
)

MORE RESULTS PER SEARCH:
# Get up to 10 LinkedIn pages per organization (default is 5)
result <- bebity_company_search("Memorial Hospital", limit = 10)


BACKWARD COMPATIBILITY
----------------------
✓ Existing bebity_profile_search() function unchanged
✓ No impact on existing scripts
✓ Cache is completely separate
✓ Can use both functions in same script


REQUIREMENTS
------------
- R packages: httr2, jsonlite, dplyr, stringr, purrr
- Apify API token (set as APIFY_API_KEY environment variable)
- Optional: gpt.batch function from RProfile (for intelligent matching)
- Optional: saver/loadr functions from RProfile (for cache management)


TROUBLESHOOTING
---------------

Issue: "APIFY_API_KEY not set"
Solution: Set environment variable:
  Sys.setenv(APIFY_API_KEY = "your_token_here")
  Or pass directly:
  bebity_company_search(orgs, apify_token = "your_token_here")

Issue: Cache not saving
Solution: Check that cache directory exists and is writable:
  dir.exists("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles")

Issue: GPT matching not working
Solution: Ensure gpt.batch function is loaded from RProfile:
  source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/RProfile Temp.R")
  Or disable GPT matching:
  bebity_company_search(orgs, use_gpt_matching = FALSE)

Issue: Want to update cached result
Solution: Use force_refresh = TRUE:
  bebity_company_search("Mayo Clinic", force_refresh = TRUE)


TESTING
-------
Quick test to verify everything works:

# Test 1: First search (should be cached = FALSE)
result1 <- bebity_company_search("Test Hospital ABC")
print(result1$is_cached)  # Should be FALSE

# Test 2: Repeat search (should be cached = TRUE)
result2 <- bebity_company_search("Test Hospital ABC")
print(result2$is_cached)  # Should be TRUE

# Test 3: Similar name (should be cached = TRUE if GPT works)
result3 <- bebity_company_search("Test Hospital")
print(result3$is_cached)  # Should be TRUE (if gpt.batch available)


RELATED FILES
-------------
bebity_profile_search.R: Main function file (includes both profile and company search)
bebity_company_search - Quick Start.R: Quick reference examples
bebity_company_search - README.txt: This file
bebity_profile_search - Quick Start.R: Profile search examples (unchanged)
bebity_profile_search - README.txt: Profile search documentation (unchanged)


VERSION HISTORY
---------------
v2.0 (2024-12-27)
- Added bebity_company_search() function with intelligent caching
- GPT-powered name matching for cache lookups
- Automatic cache management with saver/loadr integration
- Full backward compatibility with v1.0

v1.0 (2024-12-16)
- Initial release with bebity_profile_search()
- Profile data extraction and batching


NOTES
-----
- Cache persists across R sessions
- Cache grows over time (automatically saves all searches)
- GPT matching requires internet connection
- Cache file is stored as .rdata format
- Function is fully thread-safe for parallel processing


SUPPORT
-------
For questions or issues:
1. Check this README
2. Review Quick Start examples
3. Check Apify actor documentation:
   https://apify.com/bebity/linkedin-premium-actor


================================================================================




