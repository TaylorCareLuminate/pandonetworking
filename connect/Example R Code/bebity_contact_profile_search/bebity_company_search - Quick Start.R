################################################################################
##
## Bebity Company Search - Quick Start
## 
## Quick setup and usage examples for the bebity company search function
## with intelligent caching to save API costs
##
################################################################################

# Source the function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search.R")

################################################################################
## EXAMPLE 1: Search for a single organization
################################################################################

# Search for one hospital
result <- bebity_company_search("Sarasota Memorial Hospital")

# View results
View(result)

# Check if it was cached
if (result$is_cached[1]) {
  message("✓ Result came from cache (no API cost!)")
} else {
  message("→ New search performed (API cost incurred)")
}

################################################################################
## EXAMPLE 2: Search for multiple organizations
################################################################################

# Define organization names
hospitals <- c(
  "Mayo Clinic",
  "Cleveland Clinic",
  "Johns Hopkins Hospital",
  "Massachusetts General Hospital"
)

# Search all organizations
results <- bebity_company_search(hospitals)

# View results
View(results)

# See cache statistics
table(results$is_cached)

################################################################################
## EXAMPLE 3: Run the same search again (demonstrates caching)
################################################################################

# First search (will hit API)
result1 <- bebity_company_search("Sarasota Memorial Hospital")
message(sprintf("First search - Cached: %s", result1$is_cached[1]))

# Second search (will use cache)
result2 <- bebity_company_search("Sarasota Memorial Hospital")
message(sprintf("Second search - Cached: %s", result2$is_cached[1]))

# Even slightly different names will be matched with GPT
result3 <- bebity_company_search("Sarasota Memorial")
message(sprintf("Similar name search - Cached: %s", result3$is_cached[1]))

################################################################################
## EXAMPLE 4: Search from a data frame
################################################################################

# Load data with organization names
hospitals_df <- data.frame(
  hospital_name = c(
    "Sarasota Memorial Hospital",
    "Mayo Clinic",
    "Cleveland Clinic"
  ),
  city = c("Sarasota", "Rochester", "Cleveland"),
  stringsAsFactors = FALSE
)

# Search for LinkedIn profiles
linkedin_profiles <- bebity_company_search(hospitals_df$hospital_name)

# Merge back with original data
hospitals_enriched <- hospitals_df %>%
  left_join(
    linkedin_profiles,
    by = c("hospital_name" = "search_query")
  )

View(hospitals_enriched)

################################################################################
## EXAMPLE 5: Force refresh (ignore cache)
################################################################################

# Sometimes you want to search again even if cached
# (e.g., if organization changed their LinkedIn page)
result_fresh <- bebity_company_search(
  "Mayo Clinic",
  force_refresh = TRUE
)

message("Forced fresh search - will always show is_cached = FALSE")

################################################################################
## EXAMPLE 6: Adjust number of results per search
################################################################################

# Get more results per organization (default is 5)
result_many <- bebity_company_search(
  "Memorial Hospital",  # Common name, many matches
  limit = 10
)

# See how many results per search
table(result_many$search_query)

################################################################################
## EXAMPLE 7: Disable GPT matching (faster but less smart)
################################################################################

# By default, GPT is used to match similar organization names
# You can disable this for faster (but less accurate) matching
result_nogpt <- bebity_company_search(
  "Sarasota Memorial",
  use_gpt_matching = FALSE  # Only exact matches
)

################################################################################
## AVAILABLE FIELDS
################################################################################

# The function returns these fields:
#   - search_query: Original organization name you searched
#   - organization_name: Name found on LinkedIn
#   - linkedin_url: LinkedIn company/organization page URL
#   - search_date: Date when this search was performed
#   - is_cached: TRUE if from cache, FALSE if new search
#   - match_confidence: "cached", "new_search", or GPT-determined

################################################################################
## COST SAVINGS FROM CACHING
################################################################################

# Example scenario:
# - You search 100 hospitals today (cost: ~$0.80)
# - Tomorrow you search the same 100 hospitals
# - Result: $0 additional cost (all from cache!)
#
# Cache also helps with:
# - Slight name variations (Mayo vs Mayo Clinic)
# - Accidental duplicates in your input
# - Re-running analysis scripts

################################################################################
## CACHE MANAGEMENT
################################################################################

# Cache location
cache_dir <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles"

# View cache
if (exists("loadr")) {
  cache <- loadr("Bebity LinkedIn Company Profiles/company_search_cache")
  View(cache)
  message(sprintf("Cache contains %d records", nrow(cache)))
}

# Clear cache (if needed)
# cache_file <- file.path(cache_dir, "company_search_cache.rdata")
# if (file.exists(cache_file)) {
#   file.remove(cache_file)
#   message("Cache cleared")
# }

################################################################################
## FUNCTION SIGNATURE
################################################################################

# bebity_company_search(
#   organization_names,        # Character vector of org names (required)
#   limit = 5,                 # Number of results per organization
#   apify_token = NULL,        # Apify API token (default: APIFY_API_KEY env var)
#   cache_dir = "...",         # Cache directory (default: standard location)
#   force_refresh = FALSE,     # Ignore cache and search anyway
#   use_gpt_matching = TRUE    # Use GPT for intelligent name matching
# )

################################################################################
## NOTES
################################################################################

# - Cache is automatically saved after each successful search
# - GPT matching helps find cached results for similar names
# - Use force_refresh = TRUE if you need updated data
# - Cache persists across R sessions
# - Backward compatible: existing profile search function unchanged




